import crypto from "crypto";
import { Attribute, Class } from "../../index.js";
import type { Document, JobModel, JobRunModel } from "@docstack/shared";
import { createTestDocStack } from "../../test-utils/docstack";

jest.setTimeout(30000);

describe("Trigger integration", () => {
    it("runs before triggers when creating documents", async () => {
        const { stack, cleanup } = await createTestDocStack("trigger-before");
        try {
            const className = `BeforeTrigger-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "before trigger test");

            await Attribute.create(classObj, "name", "string", "Name", { mandatory: true });
            await Attribute.create(classObj, "flag", "boolean", "Flag", {});

            await classObj.addTrigger("before:flag", {
                name: "beforeFlag",
                order: "before",
                run: `
                    document.flag = true;
                    document.originClass = classObj?.getName?.();
                    return document;
                `,
            });

            const createdDoc = await classObj.addCard({ name: "Triggered" });
            const storedDoc = (await stack.getDocument((createdDoc as Document)._id as string)) as Document | null;

            expect(storedDoc?.flag).toBe(true);
            expect(storedDoc?.originClass).toBe(className);
        } finally {
            await cleanup();
        }
    });

    it("runs after triggers and persists their changes", async () => {
        const { stack, cleanup } = await createTestDocStack("trigger-after");
        try {
            const className = `AfterTrigger-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "after trigger test");

            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
            await Attribute.create(classObj, "audit", "integer", "Audit", { mandatory: false });

            await classObj.addTrigger("after:audit", {
                name: "afterAudit",
                order: "after",
                run: `
                    const current = typeof document.audit === "number" ? document.audit : 0;
                    document.audit = current + 1;
                    document.afterRan = true;
                    return document;
                `,
            });

            const createdDoc = await classObj.addCard({ title: "After trigger" });
            const storedDoc = (await stack.getDocument((createdDoc as Document)._id as string)) as Document | null;

            expect(storedDoc?.audit).toBe(1);
            expect(storedDoc?.afterRan).toBe(true);
        } finally {
            await cleanup();
        }
    });

    it("executes trigger jobs referenced by jobId", async () => {
        const { stack, cleanup } = await createTestDocStack("trigger-job");
        try {
            const className = `JobTrigger-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "job trigger test");

            await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

            const content = `
function execute(_stack, params) {
    const doc = params?.document || {};
    const title = doc.title || "";
    return { metadata: { lastTriggeredFor: title, ran: true } };
}
`;

            const jobDoc: JobModel = {
                _id: `Job-${Date.now()}`,
                "~class": "~Job",
                name: "Trigger job",
                type: "user",
                workerPlatform: "client",
                content,
                hash: crypto.createHash("sha256").update(content).digest("hex"),
                isEnabled: true,
                isSingleton: false,
            };

            await stack.db.bulkDocs([jobDoc as any]);

            await classObj.addTrigger("after:title", {
                name: "after-title-job",
                order: "after",
                jobId: jobDoc._id,
            });

            await classObj.addCard({ title: "Job-based trigger" });

            const runs = await stack.db.find<JobRunModel>({ selector: { "~class": "~JobRun", jobId: jobDoc._id } });
            expect(runs.docs.length).toBe(1);
            const run = runs.docs[0];
            expect(run.status).toBe("SUCCESS");
            expect(run.triggerType).toBe("event");
            expect(run.finalMetadata?.lastTriggeredFor).toBe("Job-based trigger");

            const storedJob = await stack.db.get<JobModel>(jobDoc._id);
            expect(storedJob.metadata?.lastTriggeredFor).toBe("Job-based trigger");
        } finally {
            await cleanup();
        }
    });
    /*
    it("fails validation when after trigger violates constraints", async () => {
        const { stack, cleanup } = await createTestDocStack("trigger-validation");
        try {
            const className = `AfterTriggerValidation-${Date.now()}`;
            const classObj = await Class.create(stack, className, "class", "after trigger validation test");

            await Attribute.create(classObj, "name", "string", "Name", { mandatory: true });
            await Attribute.create(classObj, "status", "string", "Status", { mandatory: true });

            await classObj.addTrigger("after:status", {
                name: "afterStatus",
                order: "after",
                run: `
                    // This after trigger will delete the mandatory 'status' field
                    delete document.status;
                    return document;
                `,
            });

            // Attempt to create a document with valid data
            // The after trigger will remove 'status', causing validation to fail
            await expect(
                classObj.addCard({ name: "Test", status: "active" }).catch((err) => {
                    throw new Error(err.message);
                })
            ).rejects.toThrow();
        } finally {
            await cleanup();
        }
    },500); */
});
