import { test as it, expect } from './fixtures';

const describe = it.describe;

it.setTimeout(120_000);

/**
 * Compiled handlers: the first layer of `ports.md` §5, declared with the model
 * (`proposal.md` §13).
 *
 * A stored trigger or patch job states a `handler` *name* instead of a body, and the name
 * resolves against the handlers this build registered. Nothing is evaluated from a
 * string, which is what makes the form work on a host with no interpreter - and what
 * removes the code-injection surface of a `run` string travelling in a replicated
 * document.
 *
 * The runtime layer is unchanged and is not going away: end users define triggers, and
 * this client is effectively the runtime plugin §5.2 describes. So the pair of tests that
 * matter are "a compiled handler does what a `run` string does" and "a reference that
 * resolves nowhere fails at open rather than at the first write".
 */
describe("compiled handlers", () => {
    it("run as triggers and as patch jobs, resolved by name", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack, defineHandler, defineClass, defineModel, a } = (window as any).docstack;

            // Declared in code, against the document type the class infers. The engine
            // never sees this function - only its name.
            const stampLabel = defineHandler("test.stampLabel", {
                kind: "trigger",
                run: (doc: any, ctx: any) => ({
                    ...doc,
                    label: String(doc.label ?? "").trim().toUpperCase(),
                    stampedAt: ctx.now(),
                }),
            });
            const seedOne = defineHandler("test.seedOne", {
                kind: "job",
                // The job writes no encrypted attribute, so it may run while locked.
                requiresKey: false,
                execute: async (stack: any) => {
                    await stack.db.put({
                        _id: "Entry-from-job", "~class": "Entry", label: "FROM JOB", active: true,
                    });
                },
            });

            const Entry = defineClass("Entry", {
                description: "Entries",
                attributes: { label: a.string({ mandatory: true }) },
                triggers: [{ name: "stamp", order: "before", handler: stampLabel }],
            });
            const model = defineModel({ classes: [Entry], handlers: [seedOne] });

            // What `toClassModel()` emits for a declared trigger: the name, not the body.
            const emitted = Entry.toClassModel().triggers;

            const name = `handlers-${Date.now()}`;
            const docStack = new DocStack({
                name,
                documentKey: "0".repeat(64),
                // The registry, exactly as an application passes it.
                handlers: model.handlers,
                patches: [{
                    _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                    changelog: "the Entry class",
                    docs: model.toClassModels(),
                    postApply: { name: "seed", handler: "test.seedOne" },
                }],
            });
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 20000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });
            const stack = docStack.getStack(name)!;
            await stack.authenticate({ username: "system", password: "system" });

            // The trigger: a write goes through the compiled function.
            const entry: any = await (await stack.getClass("Entry"))!.addCard({ label: "  rent  " });

            // The job: its write is in the database, and its receipt says it ran.
            const fromJob: any = await stack.db.get("Entry-from-job").catch(() => null);
            const receipts = (await (stack as any).db.find({
                selector: { "~class": "~JobRun", "runtimeArgs.patchVersion": "1.0.0" }, limit: 10,
            })).docs;

            const stored: any = await stack.getClassModel("Entry");
            const resolved = (stack as any).getHandler("test.stampLabel");

            stack.close();
            await (stack as any).db.destroy();

            return {
                emitted,
                storedTriggers: stored?.triggers,
                triggered: entry?.label,
                stamped: typeof entry?.stampedAt === "number",
                fromJob: fromJob?.label,
                receiptStatuses: receipts.map((receipt: any) => receipt.status),
                resolvedKind: resolved?.kind,
                resolvedName: resolved?.name,
            };
        });

        // The declaration emits a reference. No function, and no source string - that is
        // the whole point: a handler body is code, versioned by the app build.
        expect(result.emitted).toEqual([{ name: "stamp", order: "before", handler: "test.stampLabel" }]);
        expect(result.storedTriggers).toEqual([{ name: "stamp", order: "before", handler: "test.stampLabel" }]);

        // The trigger ran, and its context was real: `now()` produced a timestamp.
        expect(result.triggered).toBe("RENT");
        expect(result.stamped).toBe(true);

        // The patch job ran as a compiled function, and recorded a receipt like any other.
        expect(result.fromJob).toBe("FROM JOB");
        expect(result.receiptStatuses).toEqual(["SUCCESS"]);

        // And the registry is addressable from the stack, which is how the trigger found it.
        expect(result.resolvedKind).toBe("trigger");
        expect(result.resolvedName).toBe("test.stampLabel");
    });

    it("fail closed when a reference resolves nowhere - at open, not at the first write", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const classDoc = {
                _id: "Orphan", "~class": "class", active: true, name: "Orphan",
                description: "Entries", schema: {
                    label: { name: "label", type: "string", config: { mandatory: true } },
                },
                triggers: [{ name: "stamp", order: "before", handler: "test.missing" }],
            };

            // Opened through `addStack`, which returns the open as a promise, so a
            // refusal is something a caller can catch. The constructor path reports the
            // same refusal as an `error` event and in `ready`'s `failed` detail - see the
            // case after this one.
            // No ready wait: constructed with no stacks, `initStacks` reaches its own
            // dispatch with nothing to await, so "ready" has already fired by the time
            // the constructor returns. `addStack` is awaited below, which is the signal
            // that matters here.
            const docStack = new DocStack();

            const open = async (patches: any[], handlers?: any) => {
                const name = `handlers-closed-${Math.random().toString(16).slice(2)}`;
                try {
                    await docStack.addStack({ name, documentKey: "0".repeat(64), patches, handlers });
                } catch (error: any) {
                    return { opened: false, message: String(error?.message ?? error), landed: false };
                }
                const stack = docStack.getStack(name);
                // Did the schema land despite the bad reference?
                const landed = stack ? await stack.getClassModel("Orphan").catch(() => null) : null;
                if (stack) await docStack.removeStack(name, { destroy: true });
                return { opened: true, message: null as string | null, landed: landed !== null };
            };

            const unregistered = await open([{
                _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                changelog: "a trigger naming nothing", docs: [classDoc],
            }]);

            const jobUnregistered = await open([{
                _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                changelog: "a job naming nothing",
                docs: [{ ...classDoc, triggers: [] }],
                preApply: { name: "seed", handler: "test.missingJob" },
            }]);

            // A handler registered under the right name but the wrong kind.
            const { defineHandler } = (window as any).docstack;
            const wrongKind = await open([{
                _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                changelog: "a trigger naming a job", docs: [classDoc],
            }], {
                "test.missing": defineHandler("test.missing", {
                    kind: "job", execute: async () => undefined,
                }),
            });

            // Two things stated at once has no defined meaning, so it is refused rather
            // than resolved by precedence.
            const bothStated = await open([{
                _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                changelog: "a trigger stating two things",
                docs: [{
                    ...classDoc,
                    triggers: [{
                        name: "stamp", order: "before", handler: "test.stampLabel",
                        run: "return document;",
                    }],
                }],
            }]);

            return { unregistered, jobUnregistered, wrongKind, bothStated };
        });

        // The open fails, and the message says what is missing and what to do about it.
        expect(result.unregistered.opened).toBe(false);
        // Nothing was written: the check runs before the chain stages, so a patch naming
        // a handler this build lacks does not land its schema and fail afterwards.
        expect(result.unregistered.landed).toBe(false);
        expect(result.unregistered.message).toContain("test.missing");
        expect(result.unregistered.message).toContain("does not");
        expect(result.unregistered.message).toContain("handlers");

        // Same for a patch job's reference.
        expect(result.jobUnregistered.opened).toBe(false);
        expect(result.jobUnregistered.message).toContain("test.missingJob");

        // A name that resolves to the wrong kind is as unusable as one that resolves to
        // nothing, and says so differently.
        expect(result.wrongKind.opened).toBe(false);
        expect(result.wrongKind.message).toContain("'trigger'");
        expect(result.wrongKind.message).toContain("'job'");

        // Exactly one of handler/run/jobId.
        expect(result.bothStated.opened).toBe(false);
        expect(result.bothStated.message).toContain("exactly one");
    });

    it("report an unresolved reference through the constructor path too", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const name = `handlers-ctor-${Date.now()}`;
            // The path every application uses: construct, then wait for `ready`. The
            // check throws from `ClientStack.create`, which the constructor cannot
            // report by returning - so what a consumer gets is an `error` event and a
            // `failed` entry beside `ready`.
            const docStack = new DocStack({
                name, documentKey: "0".repeat(64),
                patches: [{
                    _id: "test-1.0.0", "~class": "patch", target: "test", version: "1.0.0",
                    changelog: "a trigger naming nothing",
                    docs: [{
                        _id: "Orphan", "~class": "class", active: true, name: "Orphan",
                        description: "Entries",
                        schema: { label: { name: "label", type: "string", config: { mandatory: true } } },
                        triggers: [{ name: "stamp", order: "before", handler: "test.missing" }],
                    }],
                }],
            });

            let errorMessage: string | null = null;
            docStack.addEventListener("error", (event: any) => {
                errorMessage = String(event?.detail?.error?.message ?? event?.detail?.error);
            });
            const detail: any = await Promise.race([
                new Promise(resolve => docStack.addEventListener("ready", (e: any) => resolve(e?.detail))),
                new Promise(resolve => setTimeout(() => resolve("hung"), 15000)),
            ]);

            return {
                hung: detail === "hung",
                errorMessage,
                failedNames: detail === "hung" ? [] : (detail?.failed ?? []).map((f: any) => f.name),
                failedMessage: detail === "hung" ? "" : String(detail?.failed?.[0]?.error?.message ?? ""),
                stackAbsent: docStack.getStack(name) === undefined,
            };
        });

        // `ready` still arrives, so a consumer waiting on it is not left hanging.
        expect(result.hung).toBe(false);
        // And the refusal is readable from either side.
        expect(result.errorMessage).toContain("test.missing");
        expect(result.failedNames.length).toBe(1);
        expect(result.failedMessage).toContain("test.missing");
        // The stack is not usable, which is the point of failing closed.
        expect(result.stackAbsent).toBe(true);
    });
});
