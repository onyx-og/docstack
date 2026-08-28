import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The job engine's execution contract, on the real platform - ported from the jest
 * suite `core/job-engine/__tests__/job-engine.test.ts`, which booted a stack under Node
 * where `pouchdb-browser` has no adapter. The scheduler's *timing* behavior stays in
 * its jest suite against a fake host, where an injected clock can state a fortnight in
 * one line; what belongs here is the part that needs a real stack: hydration, run
 * records, metadata persistence, and the auth job's key derivation.
 */
describe("job engine", () => {
    it("executes a job, records the run, skips disabled, and captures failure", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-engine",
            username: "job-user1",
            password: "job-pass1",
            evaluate: async ({ stack }) => {
                const hashContent = async (content: string) => {
                    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
                    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
                };
                const defineJob = async (id: string, content: string, overrides: any = {}) => {
                    await stack.db.bulkDocs([{
                        _id: id, "~class": "~Job", name: id, type: "user", workerPlatform: "client",
                        content, hash: await hashContent(content),
                        isEnabled: true, isSingleton: false, ...overrides,
                    }]);
                };

                // 1 - a job that runs: metadata flows params -> run -> job document.
                await defineJob("Job-counter", `
function execute(_stack, params) {
    const current = params?.value ?? 0;
    return { metadata: { counter: current + 1 } };
}
`, { defaultParams: { value: 1 }, metadata: { counter: 1 } });
                const run = await stack.jobEngine.executeJob("Job-counter", { value: 5 });
                const storedRun = await stack.db.get(run._id);
                const storedJob = await stack.db.get("Job-counter");

                // 2 - a disabled job refuses, and the refusal is itself recorded.
                await defineJob("Job-disabled", `
function execute() { return { metadata: { executed: true } }; }
`, { isEnabled: false });
                let disabledError: string | null = null;
                await stack.jobEngine.executeJob("Job-disabled").catch((error: any) => {
                    disabledError = String(error?.message || error);
                });
                const skippedRuns = await stack.db.find({
                    selector: { "~class": "~JobRun", jobId: "Job-disabled" },
                });
                const skipped = skippedRuns.docs[0] as any;

                // 3 - a throw becomes a FAILURE run with the error preserved.
                await defineJob("Job-explosive", `
function execute() { throw new Error('boom'); }
`);
                const failed = await stack.jobEngine.executeJob("Job-explosive");
                const storedFailure = await stack.db.get(failed._id);

                return {
                    runStatus: (storedRun as any).status,
                    runTrigger: (storedRun as any).triggerType,
                    runCounter: (storedRun as any).finalMetadata?.counter,
                    runDuration: (storedRun as any).durationMs,
                    jobCounter: (storedJob as any).metadata?.counter,

                    disabledError,
                    skippedStatus: skipped?.status,
                    skippedMessage: skipped?.errorMessage,
                    skippedTimesOrdered: skipped ? skipped.endTime >= skipped.startTime : null,

                    failureStatus: (storedFailure as any).status,
                    failureMessage: (storedFailure as any).errorMessage,
                    failureStack: Boolean((storedFailure as any).errorStack),
                };
            },
        });

        expect(result.runStatus).toBe("SUCCESS");
        expect(result.runTrigger).toBe("manual");
        expect(result.runCounter).toBe(6);
        expect(result.runDuration).toBeGreaterThanOrEqual(0);
        expect(result.jobCounter).toBe(6);

        expect(result.disabledError).toContain("disabled");
        expect(result.skippedStatus).toBe("SKIPPED");
        expect(result.skippedMessage).toContain("disabled");
        expect(result.skippedTimesOrdered).toBe(true);

        expect(result.failureStatus).toBe("FAILURE");
        expect(result.failureMessage).toContain("boom");
        expect(result.failureStack).toBe(true);
    });

    it("derives keys using the classic auth job content", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-auth-derive",
            username: "alice",
            password: "password-123",
            evaluate: async ({ stack }) => {
                const proof = await stack.authenticate({ username: "alice", password: "password-123" });
                const user = await stack.db.get("user-alice");

                // The documented derivation, computed independently: PBKDF2-SHA256,
                // 120000 iterations, 32 bytes, the stored salt as UTF-8.
                const material = await crypto.subtle.importKey(
                    "raw", new TextEncoder().encode("password-123"), "PBKDF2", false, ["deriveBits"]);
                const bits = await crypto.subtle.deriveBits({
                    name: "PBKDF2",
                    hash: "SHA-256",
                    salt: new TextEncoder().encode((user as any).keyDerivationSalt),
                    iterations: 120000,
                }, material, 256);
                const expected = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");

                return { derivedKey: proof.derivedKey ?? null, expected };
            },
        });

        expect(result.derivedKey).not.toBeNull();
        expect((result.derivedKey as string).length).toBeGreaterThanOrEqual(64);
        expect(result.derivedKey).toBe(result.expected);
    });
});
