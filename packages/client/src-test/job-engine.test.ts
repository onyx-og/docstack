import { test as it, expect } from './fixtures';

it.setTimeout(120_000)

const describe = it.describe;

// Helper to hash content in browser
const hashContentInBrowser = `
function hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    return crypto.subtle.digest('SHA-256', data).then(buffer => {
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    });
}
`;

describe("JobEngine", () => {
    it("executes a job and records a run", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-engine",
            evaluate: async ({ stack }) => {
                const hashContent = async (content: string) => {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(content);
                    const buffer = await crypto.subtle.digest('SHA-256', data);
                    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                };

                const content = `
function execute(_stack, params) {
    const current = params?.value ?? 0;
    const next = current + 1;
    return { metadata: { counter: next } };
}
`;
                const jobDoc = {
                    _id: `Job-${Date.now()}`,
                    "~class": "~Job",
                    name: "Counter",
                    description: "increments a counter",
                    type: "user",
                    workerPlatform: "client",
                    content,
                    hash: await hashContent(content),
                    isEnabled: true,
                    isSingleton: false,
                    defaultParams: { value: 1 },
                    metadata: { counter: 1 }
                };

                await stack.db.bulkDocs([jobDoc as any]);

                const run = await stack.jobEngine.executeJob(jobDoc._id, { value: 5 });
                const storedRun = await stack.db.get<any>(run._id);
                const storedJob = await stack.db.get<any>(jobDoc._id);

                return {
                    runStatus: storedRun.status,
                    runTriggerType: storedRun.triggerType,
                    runFinalMetadataCounter: storedRun.finalMetadata?.counter,
                    runDurationMs: storedRun.durationMs,
                    jobMetadataCounter: storedJob.metadata?.counter,
                };
            },
        });

        expect(result.runStatus).toBe("SUCCESS");
        expect(result.runTriggerType).toBe("manual");
        expect(result.runFinalMetadataCounter).toBe(6);
        expect(result.runDurationMs).toBeGreaterThanOrEqual(0);
        expect(result.jobMetadataCounter).toBe(6);
    });

    it("skips disabled jobs and records a skipped run", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-engine-disabled",
            evaluate: async ({ stack }) => {
                const hashContent = async (content: string) => {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(content);
                    const buffer = await crypto.subtle.digest('SHA-256', data);
                    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                };

                const content = `
function execute() {
    return { metadata: { executed: true } };
}
`;
                const jobDoc = {
                    _id: `Job-${Date.now()}`,
                    "~class": "~Job",
                    name: "Disabled job",
                    type: "user",
                    workerPlatform: "client",
                    content,
                    hash: await hashContent(content),
                    isEnabled: false,
                    isSingleton: false,
                };

                await stack.db.bulkDocs([jobDoc as any]);

                let threwDisabled = false;
                let errorMessage = "";
                try {
                    await stack.jobEngine.executeJob(jobDoc._id);
                } catch (e: any) {
                    threwDisabled = true;
                    errorMessage = e.message || "";
                }

                const runs = await stack.db.find<any>({ selector: { jobId: jobDoc._id, "~class": "~JobRun" } });
                const storedRun = runs.docs[0];

                return {
                    threwDisabled,
                    errorMessage,
                    runStatus: storedRun?.status,
                    runErrorMessage: storedRun?.errorMessage,
                    endTimeGteStartTime: storedRun ? storedRun.endTime >= storedRun.startTime : false,
                };
            },
        });

        expect(result.threwDisabled).toBe(true);
        expect(result.errorMessage).toContain("disabled");
        expect(result.runStatus).toBe("SKIPPED");
        expect(result.runErrorMessage).toContain("disabled");
        expect(result.endTimeGteStartTime).toBe(true);
    });

    it("captures failure metadata when job throws", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-engine-failure",
            evaluate: async ({ stack }) => {
                const hashContent = async (content: string) => {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(content);
                    const buffer = await crypto.subtle.digest('SHA-256', data);
                    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                };

                const content = `
function execute() {
    throw new Error('boom');
}
`;
                const jobDoc = {
                    _id: `Job-${Date.now()}`,
                    "~class": "~Job",
                    name: "Explosive",
                    type: "user",
                    workerPlatform: "client",
                    content,
                    hash: await hashContent(content),
                    isEnabled: true,
                    isSingleton: false,
                };

                await stack.db.bulkDocs([jobDoc as any]);

                const run = await stack.jobEngine.executeJob(jobDoc._id);
                const storedRun = await stack.db.get<any>(run._id);

                return {
                    runStatus: storedRun.status,
                    errorMessage: storedRun.errorMessage,
                    hasErrorStack: storedRun.errorStack !== undefined,
                };
            },
        });

        expect(result.runStatus).toBe("FAILURE");
        expect(result.errorMessage).toContain("boom");
        expect(result.hasErrorStack).toBe(true);
    });

    it("derives keys using the classic auth job content", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "job-engine-auth",
            username: "alice",
            password: "password-123",
            evaluate: async ({ stack }) => {
                // Re-authenticate to get a fresh proof with the derived key
                const proof = await stack.authenticate({ username: "alice", password: "password-123" });

                // Get the user to access keyDerivationSalt
                const user = await stack.findDocument({
                    "~class": { $eq: "~User" },
                    username: { $eq: "alice" }
                }) as any;

                // PBKDF2 derivation in the browser using SubtleCrypto
                const encoder = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey(
                    "raw",
                    encoder.encode("password-123"),
                    "PBKDF2",
                    false,
                    ["deriveBits"]
                );

                const derivedBits = await crypto.subtle.deriveBits(
                    {
                        name: "PBKDF2",
                        salt: encoder.encode(user.keyDerivationSalt),
                        iterations: 120000,
                        hash: "SHA-256",
                    },
                    keyMaterial,
                    256
                );

                const expectedDerivedKey = Array.from(new Uint8Array(derivedBits))
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");

                return {
                    hasDerivedKey: proof.derivedKey !== undefined,
                    derivedKeyLength: proof.derivedKey?.length || 0,
                    derivedKeyMatches: proof.derivedKey === expectedDerivedKey,
                };
            },
        });

        expect(result.hasDerivedKey).toBe(true);
        expect(result.derivedKeyLength).toBeGreaterThanOrEqual(64);
        expect(result.derivedKeyMatches).toBe(true);
    });
});
