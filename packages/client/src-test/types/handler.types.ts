/**
 * Type-level tests for `defineHandler` (`proposal.md` §13).
 *
 * Nothing here runs; it fails by failing to compile. Checked by:
 *
 * ```bash
 * npm run test:types -w @docstack/client
 * ```
 *
 * The claim under test is that a compiled handler is *typed against the class it
 * targets* - the document type in and out - because that is the whole advantage it has
 * over a `run` string, which is unchecked text in a document. The `@ts-expect-error`
 * directives are assertions: an unused one is a compile error, so a signature that
 * quietly widened fails here.
 */
import { a, defineClass, defineHandler, defineModel, InferDoc } from "@docstack/shared";
import type { Handler, JobHandler, TriggerHandler, TriggerHandlerContext } from "@docstack/shared";

/** Compiles only when `T` is exactly `true`. */
type Expect<T extends true> = T;

/** Exact type equality, invariant in both directions (so `any` cannot slip through). */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const Todo = defineClass("HandlerTodo", {
    attributes: {
        title: a.string({ mandatory: true }),
        completed: a.boolean({ defaultValue: false }),
        completedAt: a.date(),
    },
});
type TodoDoc = InferDoc<typeof Todo>;

// The document type is stated once, on the handler's own parameter: the class's
// `InferDoc` is not available while its `triggers` list is being written, so the
// annotation is where the two meet.
const stamp = defineHandler("test.stamp", {
    kind: "trigger",
    run: (doc: TodoDoc, ctx) => (doc.completed ? { ...doc, completedAt: String(ctx.now()) } : doc),
});

export type _triggerKind = Expect<Equal<typeof stamp.kind, "trigger">>;
export type _triggerIsHandler = Expect<Equal<typeof stamp, TriggerHandler<TodoDoc>>>;
// The context is inferred, so a handler body gets it without annotating it.
export type _contextInferred =
    Expect<Equal<Parameters<typeof stamp.fn>[1], TriggerHandlerContext>>;
export type _nowIsNumber = Expect<Equal<ReturnType<TriggerHandlerContext["now"]>, number>>;
// The document goes in and comes out: a trigger rewrites its document, it does not
// return something else.
export type _docInAndOut =
    Expect<Equal<Parameters<typeof stamp.fn>[0], TodoDoc>>;
export type _returnsDoc =
    Expect<Equal<ReturnType<typeof stamp.fn>, TodoDoc | Promise<TodoDoc>>>;

const backfill = defineHandler("test.backfill", {
    kind: "job",
    requiresKey: false,
    execute: async (stack, params) => { void stack; void params; },
});

export type _jobKind = Expect<Equal<typeof backfill.kind, "job">>;
export type _jobIsHandler = Expect<Equal<typeof backfill, JobHandler>>;
// A job's `requiresKey` is readable, which is what lets the lock barrier take the
// handler's answer when the patch states none (ADR-0044).
export type _requiresKeyIsOptionalBoolean =
    Expect<Equal<typeof backfill.requiresKey, boolean | undefined>>;

// A declared trigger takes the handler object; the stored model gets its name.
const WithTrigger = defineClass("HandlerTodoWired", {
    attributes: { title: a.string({ mandatory: true }) },
    triggers: [{ name: "stamp", order: "before", handler: stamp }],
});

// The registry is what `StackOptions.handlers` is given, and it holds either kind.
const model = defineModel({ classes: [Todo, WithTrigger], handlers: [backfill] });
export type _registry = Expect<Equal<typeof model.handlers, Readonly<Record<string, Handler>>>>;

// A trigger handler is not a job handler, however alike they look at runtime.
declare const asJob: JobHandler;
// @ts-expect-error - the kinds are distinct, so one cannot stand in for the other.
export const _kindsDoNotMix: TriggerHandler<TodoDoc> = asJob;

// The document type is enforced, not decorative: a handler written against one class
// cannot be handed a document of another.
declare const otherDoc: InferDoc<typeof WithTrigger>;
// @ts-expect-error - `completed` is missing, so this is not a `TodoDoc`.
export const _wrongDocRefused = stamp.fn(otherDoc, { now: () => 0 });

// And nothing collapsed to `any` on the way: `Equal` is invariant, so this fails if
// inference gave up anywhere above.
export type _notAny = Expect<Equal<Equal<Parameters<typeof stamp.fn>[0], any>, false>>;
