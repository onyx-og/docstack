import { test as it, expect } from './fixtures';

const describe = it.describe;

it.setTimeout(120_000);

/**
 * What a `DocStack` does when a stack fails to open.
 *
 * The constructor cannot report anything itself - it is not async - so the contract is
 * the `ready` event, and every consumer waits on it. Which meant a failed open was
 * unobservable twice over: `initStacks` was called without a `catch`, so the rejection
 * went nowhere and `ready` never fired, leaving the caller awaiting an event that would
 * not arrive, with nothing to catch and an unhandled rejection in the console. A hang is
 * worse than a throw for the same reason it was worse in `Class.build`: there is nothing
 * to handle and nothing in a log to read.
 *
 * `addStack` always reported properly - it returns the open as a promise - so this is
 * about the constructor path, which is the one every application uses.
 */
describe("a stack that fails to open", () => {
    /**
     * A patch the engine refuses from inside the chain machinery: the pre-apply job
     * throws, so staging unwinds and `ClientStack.create` rejects with the patch named
     * (ADR-0042, ADR-0044). A real failure path rather than a contrived one.
     *
     * The other failure used below is a bad `adapter`, which fails in the database
     * constructor - the earliest point there is, before any DocStack machinery runs. The
     * two together cover both ends of an open.
     */
    const FAILING_PATCH = {
        "~class": "patch", version: "1.0.0", target: "app", changelog: "a job that throws",
        docs: [],
        preApply: { name: "boom", content: "function execute() { throw new Error('boom'); }" },
    };

    it("reports it, instead of leaving the caller waiting on `ready`", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async (patch) => {
            const { DocStack } = (window as any).docstack;
            const name = `open-fail-${Date.now()}`;
            const docStack = new DocStack({ name, documentKey: "0".repeat(64), patches: [patch] });

            const events: string[] = [];
            let errorDetail: any = null;
            let readyDetail: any = null;

            // Whichever arrives first, plus a deadline well under the test timeout so a
            // regression reports "hung" rather than timing out the whole run.
            const settled = await Promise.race([
                new Promise<string>(resolve => {
                    docStack.addEventListener("error", (event: any) => {
                        events.push("error");
                        errorDetail = {
                            name: event?.detail?.name,
                            message: String(event?.detail?.error?.message ?? event?.detail?.error),
                        };
                        resolve("error");
                    });
                    docStack.addEventListener("ready", (event: any) => {
                        events.push("ready");
                        readyDetail = {
                            stacks: (event?.detail?.stacks ?? []).map((s: any) => s.name),
                            failed: (event?.detail?.failed ?? []).map((f: any) => f.name),
                        };
                        resolve("ready");
                    });
                }),
                new Promise<string>(resolve => setTimeout(() => resolve("hung"), 15000)),
            ]);

            // Both events are part of the contract, so give the second one a moment to
            // arrive before reporting what was seen.
            await new Promise(resolve => setTimeout(resolve, 500));

            return {
                settled,
                events,
                errorDetail,
                readyDetail,
                // The stack is not in the list, so `getStack` says so rather than
                // handing back a half-open handle.
                resolvesToNothing: docStack.getStack(name) === undefined,
            };
        }, FAILING_PATCH);

        // The failure is reported. Before this, neither event fired and `settled` was
        // "hung" - a caller awaiting `ready` waited for an event that never came.
        expect(result.settled).not.toBe("hung");

        // An `error` event carries the stack's name and the real message, matching the
        // convention the sync handle already uses.
        expect(result.events).toContain("error");
        expect(result.errorDetail?.name).toBeTruthy();
        // The real cause, not a wrapper: the patch at fault and the job's own message.
        expect(result.errorDetail?.message).toContain("1.0.0");
        expect(result.errorDetail?.message).toContain("boom");

        // And `ready` still fires, naming what failed: a `DocStack` holding several
        // stacks is usable for the ones that opened, which is the same reading of
        // "ready" that lets a locked stack signal it (ADR-0018). A consumer that only
        // listens for `ready` therefore stops waiting either way.
        expect(result.events).toContain("ready");
        expect(result.readyDetail?.stacks).toEqual([]);
        expect(result.readyDetail?.failed?.length).toBe(1);

        expect(result.resolvesToNothing).toBe(true);
    });

    it("still signals `ready` when there is nothing to open", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            // No stacks: `initStacks` has nothing to await, so the dispatch used to run
            // to completion *inside* the constructor - before this line could attach a
            // listener, and therefore before anyone could ever see it.
            const docStack = new DocStack();
            const seen = await Promise.race([
                new Promise<string>(resolve => {
                    docStack.addEventListener("ready", () => resolve("ready"));
                }),
                new Promise<string>(resolve => setTimeout(() => resolve("hung"), 10000)),
            ]);
            return { seen };
        });

        expect(result.seen).toBe("ready");
    });

    it("opens the stacks it can, and reports only the one that failed", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const good = `open-good-${Date.now()}`;
            const bad = `open-bad-${Date.now()}`;
            // A database that cannot be constructed at all - the earliest failure there
            // is - and listed first, so the outcome cannot be mistaken for "whatever came
            // after it was never attempted".
            const docStack = new DocStack(
                { name: bad, adapter: "nope" },
                { name: good, documentKey: "0".repeat(64) },
            );
            const detail: any = await Promise.race([
                new Promise(resolve => {
                    docStack.addEventListener("ready", (event: any) => resolve(event?.detail));
                }),
                new Promise(resolve => setTimeout(() => resolve(null), 15000)),
            ]);
            const opened = docStack.getStack(good);
            if (opened) { opened.close(); await (opened as any).db.destroy(); }
            return {
                stacks: (detail?.stacks ?? []).map((s: any) => s.name),
                failed: (detail?.failed ?? []).map((f: any) => f.name),
                goodOpened: opened !== undefined,
                badIsAbsent: docStack.getStack(bad) === undefined,
                failedMessage: String(detail?.failed?.[0]?.error?.message ?? ""),
            };
        });

        // One database refusing to open does not take the others down with it. Aborting
        // the loop meant a workspace registry naming one bad database cost the
        // application every other one.
        expect(result.goodOpened).toBe(true);
        expect(result.stacks.length).toBe(1);
        expect(result.failed.length).toBe(1);
        expect(result.failedMessage).toContain("Invalid Adapter");
        expect(result.badIsAbsent).toBe(true);
    });
});
