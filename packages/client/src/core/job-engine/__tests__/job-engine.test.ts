import crypto from "crypto";
import type { JobModel, JobRunModel } from "@docstack/shared";
import { createAuthenticatedStack, createTestDocStack } from "../../test-utils/docstack";

const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");
jest.setTimeout(15000);

describe("JobEngine", () => {
    it("executes a job and records a run", async () => {
        const { stack, cleanup } = await createTestDocStack("job-engine");
        try {
            const content = `
function execute(_stack, params) {
    const current = params?.value ?? 0;
    const next = current + 1;
    return { metadata: { counter: next } };
}
`;
            const jobDoc: JobModel = {
                _id: `Job-${Date.now()}`,
                "~class": "~Job",
                name: "Counter",
                description: "increments a counter",
                type: "user",
                workerPlatform: "client",
                content,
                hash: hashContent(content),
                isEnabled: true,
                isSingleton: false,
                defaultParams: { value: 1 },
                metadata: { counter: 1 }
            };

            await stack.db.bulkDocs([jobDoc as any]);

            const run = await stack.jobEngine.executeJob(jobDoc._id, { value: 5 });
            const storedRun = await stack.db.get<JobRunModel>(run._id);
            const storedJob = await stack.db.get<JobModel>(jobDoc._id);

            expect(storedRun.status).toBe("SUCCESS");
            expect(storedRun.triggerType).toBe("manual");
            expect(storedRun.finalMetadata?.counter).toBe(6);
            expect(storedRun.durationMs).toBeGreaterThanOrEqual(0);
            expect(storedJob.metadata?.counter).toBe(6);
        } finally {
            await cleanup();
        }
    });

    it("skips disabled jobs and records a skipped run", async () => {
        const { stack, cleanup } = await createTestDocStack("job-engine-disabled");
        try {
            const content = `
function execute() {
    return { metadata: { executed: true } };
}
`;
            const jobDoc: JobModel = {
                _id: `Job-${Date.now()}`,
                "~class": "~Job",
                name: "Disabled job",
                type: "user",
                workerPlatform: "client",
                content,
                hash: hashContent(content),
                isEnabled: false,
                isSingleton: false,
            };

            await stack.db.bulkDocs([jobDoc as any]);

            await expect(stack.jobEngine.executeJob(jobDoc._id)).rejects.toThrow("disabled");

            const runs = await stack.db.find<JobRunModel>({ selector: { jobId: jobDoc._id, "~class": "~JobRun" } });
            const storedRun = runs.docs[0];
            expect(storedRun.status).toBe("SKIPPED");
            expect(storedRun.errorMessage).toContain("disabled");
            expect(storedRun.endTime).toBeGreaterThanOrEqual(storedRun.startTime);
        } finally {
            await cleanup();
        }
    });

    it("captures failure metadata when job throws", async () => {
        const { stack, cleanup } = await createTestDocStack("job-engine-failure");
        try {
            const content = `
function execute() {
    throw new Error('boom');
}
`;
            const jobDoc: JobModel = {
                _id: `Job-${Date.now()}`,
                "~class": "~Job",
                name: "Explosive",
                type: "user",
                workerPlatform: "client",
                content,
                hash: hashContent(content),
                isEnabled: true,
                isSingleton: false,
            };

            await stack.db.bulkDocs([jobDoc as any]);

            const run = await stack.jobEngine.executeJob(jobDoc._id);
            const storedRun = await stack.db.get<JobRunModel>(run._id);
            expect(storedRun.status).toBe("FAILURE");
            expect(storedRun.errorMessage).toContain("boom");
            expect(storedRun.errorStack).toBeDefined();
        } finally {
            await cleanup();
        }
    });

    it("derives keys using the classic auth job content", async () => {
        const { stack, cleanup, user } = await createAuthenticatedStack("alice", "password-123");
        try {
            const proof = await stack.authenticate({ username: "alice", password: "password-123" });
            expect(proof.derivedKey).toBeDefined();
            expect(proof.derivedKey?.length).toBeGreaterThanOrEqual(64);

            const expected = crypto.pbkdf2Sync(
                "password-123",
                user.keyDerivationSalt,
                120000,
                32,
                "sha256"
            ).toString("hex");
            expect(proof.derivedKey).toBe(expected);
        } finally {
            await cleanup();
        }
    });
});
