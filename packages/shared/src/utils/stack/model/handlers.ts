import type Class from "../class/index.js";
import type Stack from "../index.js";
import { Document, PatchJob, StackSession, TriggerModel } from "../../../types.js";

/**
 * Which execution point a handler is written for.
 *
 * The two take different arguments and are resolved by different parts of the engine, so
 * the kind is declared rather than inferred: a job registered where a trigger is expected
 * is a mistake worth catching when the model is built, not when a write arrives.
 */
export type HandlerKind = "trigger" | "job";

/**
 * What a compiled trigger handler is given beside the document.
 *
 * The same information a runtime trigger's body receives as positional arguments
 * (`TriggerRunFunction`), bundled: a declared handler is ordinary typed code, and four
 * positional parameters where three are usually unused reads badly in it. `now` is here
 * rather than called directly so a test can pin it.
 */
export type TriggerHandlerContext = {
    /** The class the document belongs to, when the write has one. */
    classObj?: Class;
    /** The stack the write is running against. */
    stack?: Stack;
    /** The session the write runs under, or `undefined` for an unattributed write (ADR-0046). */
    session?: StackSession;
    /** The current time, in epoch milliseconds. */
    now: () => number;
};

/** A compiled trigger handler: the document in, the document out. */
export type TriggerHandler<TDoc extends object = Document> = {
    readonly name: string;
    readonly kind: "trigger";
    readonly fn: (doc: TDoc, ctx: TriggerHandlerContext) => TDoc | Promise<TDoc>;
};

/** A compiled job handler, for a patch's one-shot migration (ADR-0044). */
export type JobHandler = {
    readonly name: string;
    readonly kind: "job";
    /**
     * Whether the job needs the document key, with the same meaning and the same default
     * as {@link PatchJob.requiresKey}: unstated means "needs it", so a job whose author
     * did not think about the lock costs latency rather than correctness.
     */
    readonly requiresKey?: boolean;
    readonly fn: (
        stack: Stack,
        params: Record<string, unknown>,
        job: { name: string; phase: "pre" | "post"; version: string }
    ) => unknown | Promise<unknown>;
};

/** Either kind of compiled handler. */
export type Handler = TriggerHandler<any> | JobHandler;

/** What `defineHandler` accepts for a trigger. */
export type TriggerHandlerInput<TDoc extends object> = {
    kind: "trigger";
    run: (doc: TDoc, ctx: TriggerHandlerContext) => TDoc | Promise<TDoc>;
};

/** What `defineHandler` accepts for a job. */
export type JobHandlerInput = {
    kind: "job";
    requiresKey?: boolean;
    execute: (
        stack: Stack,
        params: Record<string, unknown>,
        job: { name: string; phase: "pre" | "post"; version: string }
    ) => unknown | Promise<unknown>;
};

/**
 * A handler name has to be namespaced.
 *
 * The name is the whole reference: it is what a stored trigger or patch job carries, what
 * the registry is keyed on, and what the model hash notices. One flat namespace shared by
 * an application and every library it installs makes `stamp` or `backfill` a collision
 * waiting to happen, and the losing handler would be silently replaced rather than
 * reported. A dot is cheap insurance and the convention `proposal.md` §13 writes.
 */
const HANDLER_NAME = /^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/;

/**
 * Declares a handler in code, to be referenced by name from a trigger or a patch job.
 *
 * The compiled half of the two-layer design in `ports.md` §5: a stored trigger or job
 * states a `handler` name instead of a body, the name resolves against the handlers this
 * build registered, and nothing is evaluated from a string. The runtime layer - `run` and
 * `content` source - keeps working for end-user definitions and is unaffected.
 *
 * Pattern: Factory.
 *
 * @param name - A namespaced, stable identifier, e.g. `todo.stampCompletion`. It is
 * stored in documents and hashed into the model, so renaming it is a model change.
 * @param definition - The kind, and the function. A trigger declares `run`, a job
 * declares `execute`.
 * @returns A frozen {@link Handler}.
 * @throws If the name is not namespaced, or the function is missing.
 *
 * @example
 * ```typescript
 * type TodoDoc = InferDoc<typeof Todo>;
 *
 * export const stampCompletion = defineHandler("todo.stampCompletion", {
 *     kind: "trigger",
 *     run: (doc: TodoDoc, ctx) => doc.completed ? { ...doc, completedAt: ctx.now() } : doc,
 * });
 *
 * export const Todo = defineClass("Todo", {
 *     attributes: { ... },
 *     triggers: [{ name: "stamp", order: "before", handler: stampCompletion }],
 * });
 * ```
 */
export function defineHandler<TDoc extends object = Document>(
    name: string, definition: TriggerHandlerInput<TDoc>
): TriggerHandler<TDoc>;
export function defineHandler(name: string, definition: JobHandlerInput): JobHandler;
export function defineHandler(
    name: string,
    definition: TriggerHandlerInput<any> | JobHandlerInput
): Handler {
    if (!HANDLER_NAME.test(name)) {
        throw new Error(
            `defineHandler - '${name}' is not a usable handler name. Namespace it, as ` +
            "`myapp.stampCompletion`: the name is stored in documents and shared with " +
            "every library's handlers in one registry."
        );
    }
    if (definition.kind === "trigger") {
        if (typeof definition.run !== "function") {
            throw new Error(`defineHandler - trigger handler '${name}' needs a 'run' function.`);
        }
        return Object.freeze({ name, kind: "trigger" as const, fn: definition.run });
    }
    if (definition.kind === "job") {
        if (typeof definition.execute !== "function") {
            throw new Error(`defineHandler - job handler '${name}' needs an 'execute' function.`);
        }
        return Object.freeze({
            name, kind: "job" as const, requiresKey: definition.requiresKey, fn: definition.execute,
        });
    }
    throw new Error(
        `defineHandler - handler '${name}' declares kind ` +
        `'${(definition as { kind: string }).kind}'; it must be 'trigger' or 'job'.`
    );
}

/**
 * A trigger as it is *declared*: a handler object rather than a name.
 *
 * `toClassModel()` turns it into a {@link TriggerModel} carrying `handler: handler.name`,
 * which is what gets stored. The handler itself travels separately, through the model's
 * registry, because a function cannot be written to a document.
 *
 * The document type is not tied to the class being declared here, and cannot be: the
 * class's own `InferDoc` is not available while its `triggers` list is being written.
 * The handler's own annotation is where that type is stated (see {@link defineHandler}).
 */
export type DeclaredTrigger = {
    name: string;
    order: "before" | "after";
    handler: TriggerHandler<any>;
};

/** A trigger in a declaration: either already-stored form, or a handler reference. */
export type TriggerInput = TriggerModel | DeclaredTrigger;

/**
 * Whether a declared trigger references a handler object.
 *
 * @param trigger - The entry as written in a declaration.
 * @returns `true` when it carries a handler to register rather than a stored model.
 */
export const isDeclaredTrigger = (trigger: TriggerInput): trigger is DeclaredTrigger =>
    typeof (trigger as DeclaredTrigger).handler === "object"
    && (trigger as DeclaredTrigger).handler !== null;

/**
 * Normalizes a declared trigger into the model the engine stores.
 *
 * @param trigger - The entry as written in a declaration.
 * @returns A `TriggerModel`; a handler reference becomes `handler: <name>`.
 */
export const toTriggerModel = (trigger: TriggerInput): TriggerModel =>
    isDeclaredTrigger(trigger)
        ? { name: trigger.name, order: trigger.order, handler: trigger.handler.name }
        : trigger;

/**
 * Checks that a trigger says exactly one thing about what to run.
 *
 * `handler`, `run` and `jobId` are three ways to answer one question, and a trigger
 * carrying two of them has no defined meaning. The engine used to resolve `run` + `jobId`
 * silently in favour of `jobId`, so the `run` body a reader could see in the document
 * never executed. Refused rather than ordered (`proposal.md` §13).
 *
 * @param trigger - The stored trigger model.
 * @param where - What to name in the error, e.g. `class 'Todo'`.
 * @throws If none or more than one of the three is set.
 */
export const assertTriggerReference = (trigger: TriggerModel, where: string): void => {
    const stated = (["handler", "run", "jobId"] as const).filter(
        key => trigger[key] !== undefined && trigger[key] !== null && trigger[key] !== ""
    );
    if (stated.length === 1) return;
    throw new Error(
        stated.length === 0
            ? `Trigger '${trigger.name}' in ${where} states none of 'handler', 'run' or 'jobId'; `
                + "it has nothing to run."
            : `Trigger '${trigger.name}' in ${where} states ${stated.join(" and ")}; `
                + "exactly one of 'handler', 'run' or 'jobId' may be set."
    );
};

/**
 * Checks that a patch job says exactly one thing about what to run.
 *
 * @param job - The job as the patch carries it.
 * @param where - What to name in the error, e.g. `patch '1.1.0' preApply`.
 * @throws If neither or both of `handler` and `content` is set.
 */
export const assertJobReference = (job: PatchJob, where: string): void => {
    const stated = (["handler", "content"] as const).filter(
        key => job[key] !== undefined && job[key] !== null && job[key] !== ""
    );
    if (stated.length === 1) return;
    throw new Error(
        stated.length === 0
            ? `Job '${job.name}' in ${where} states neither 'handler' nor 'content'; `
                + "it has nothing to run."
            : `Job '${job.name}' in ${where} states both 'handler' and 'content'; `
                + "exactly one of them may be set."
    );
};

/**
 * Collects handlers into a registry, by name.
 *
 * Pattern: Registry. A duplicate name is refused rather than overwritten: the two
 * handlers would be indistinguishable to every stored reference, and whichever lost would
 * do so silently. The same handler object listed twice - which happens as soon as a
 * trigger references it and the model lists it as well - is not a duplicate.
 *
 * @param handlers - The handlers to register, in any order.
 * @returns A frozen map from name to handler.
 * @throws If two different handlers share a name.
 */
export const collectHandlers = (handlers: readonly Handler[]): Readonly<Record<string, Handler>> => {
    const registry: Record<string, Handler> = {};
    for (const handler of handlers) {
        const existing = registry[handler.name];
        if (existing && existing !== handler) {
            throw new Error(
                `defineModel - two different handlers are named '${handler.name}'. ` +
                "A stored trigger or job names one handler, so the name has to pick one."
            );
        }
        registry[handler.name] = handler;
    }
    return Object.freeze(registry);
};
