import {
    Class, Document, Handler, Trigger as Trigger_, TriggerModel, TriggerRunFunction,
    StackSession,
} from "@docstack/shared";

/**
 * A trigger, resolved from its model.
 *
 * Three forms, in the order `ports.md` §5.1 resolves them:
 *
 * - `handler`, a **compiled** handler declared with `defineHandler` and registered on the
 *   stack. Nothing is evaluated from a string, so this is the form that works on a host
 *   with no interpreter.
 * - `jobId`, a `~Job` document run through the job engine.
 * - `run`, the **runtime** form: JavaScript source hydrated with `new Function`. Kept
 *   because end users define triggers, and this client is effectively the runtime plugin
 *   `ports.md` §5.2 describes.
 *
 * A model states exactly one of the three - enforced when a patch writes it
 * (`ClientStack.assertPatchHandlers`). Stored history is read leniently here, in the
 * precedence this constructor has always used, because a document written before that
 * rule cannot be rejected at read time without making the class unopenable.
 */
export class Trigger extends Trigger_ {
    /** The declarative model for the trigger. */
    public readonly model: TriggerModel;
    public readonly name: TriggerModel["name"];
    public readonly order: TriggerModel["order"];

    /** A reference to the parent Class instance. */
    public readonly classObj: Class | undefined;

    /** The dynamically hydrated function that executes the trigger logic. */
    public readonly run: TriggerRunFunction;

    constructor(model: TriggerModel, classObj?: Class) {
        super();
        this.model = model;
        this.name = model.name;
        this.order = model.order;
        this.classObj = classObj;

        if (model.run !== undefined && typeof model.run !== "string") {
            throw new Error("Trigger model's 'run' field must be a string representation of a function.");
        }

        if (!model.run && !model.jobId && !model.handler) {
            throw new Error("Trigger requires a 'handler' name, a 'run' script or a 'jobId'.");
        }

        if (model.handler) {
            const handlerName = model.handler;
            // Resolved per invocation, like the `jobId` branch, not captured here: a
            // Class is often built before it is attached to a stack (`Class.get` with a
            // model, the detached builds in the sweep and the write pipeline), and a
            // registry read at construction would be read from whatever stack - or none -
            // happened to be in hand then.
            this.run = async (document, callClass, callStack, session) => {
                const stack: any = callStack ?? this.classObj?.getStack();
                const handler = stack?.getHandler?.(handlerName) as Handler | undefined;
                if (!handler) {
                    throw new Error(
                        `Trigger '${model.name}' names the compiled handler '${handlerName}', ` +
                        "which is not registered on this stack. Pass it in `handlers` when the " +
                        "stack opens."
                    );
                }
                if (handler.kind !== "trigger") {
                    throw new Error(
                        `Trigger '${model.name}' names '${handlerName}', which is declared as a ` +
                        `'${handler.kind}' handler.`
                    );
                }
                const result = await handler.fn(document, {
                    classObj: callClass ?? this.classObj,
                    stack,
                    session,
                    now: () => Date.now(),
                });
                return (result ?? document) as Document;
            };
        } else if (model.jobId) {
            this.run = async (document, _classObj, stack, session) => {
                if (!stack || !stack.jobEngine) {
                    throw new Error(`Stack does not expose a job engine for trigger '${model.name}'.`);
                }
                // The session rides along to the job, so a job started by a trigger
                // knows who wrote the document that started it.
                await (stack as any).jobEngine.executeJob(model.jobId as string, { document }, "event", session);
                return document;
            }
        } else if (model.run) {
            // Hydrate the run function from the string.
            try {
                // Use 'new Function()' for secure, sandboxed execution.
                // We pass dependencies as explicit arguments to the function's scope.
                // The `this` context is not used to prevent unwanted access.
                // `session` is the fourth argument: the StackSession the write runs
                // under, or undefined for a write with no session (ADR-0046).
                this.run = new Function('document', 'classObj', 'stack', 'session', `
                    "use strict";
                    // The developer's code is placed here.
                    return (async () => {
                        ${model.run}
                    })();
                `) as TriggerRunFunction;
            } catch (error) {
                throw new Error(`Failed to hydrate trigger '${model.name}': ${error}`);
            }
        }
    }

    /**
     * Executes the hydrated run function with the necessary context.
     * The method is now asynchronous by default.
     * @param document The document to be processed by the trigger.
     * @param session The session the write runs under, when there is one. Reaches the
     * body as its fourth argument, so a trigger can attribute or refuse by principal.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    public execute = async (document: Document, session?: StackSession): Promise<Document> => {
        const stack = this.classObj ? this.classObj.getStack() : undefined;
        
        // Call the dynamically created function with the required arguments.
        // It's crucial to pass the `document` argument and await the result.
        const result = await this.run(document, this.classObj, stack, session);

        if (result === undefined) {
            console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
            return document;
        }

        return result;
    }

    /**
     * Executes the hydrated run function without providing class or stack context.
     * This is useful for testing or previews where cross-document
     * behaviors are not desired.
     * @param document The document to be processed by the trigger.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    public executeLimited = async (document: Document): Promise<Document> => {
        // Call the dynamically created function, providing null for classObj and stack.
        const result = await this.run(document);

        if (result === undefined) {
             console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
            return document;
        }

        return result;
    }
}
