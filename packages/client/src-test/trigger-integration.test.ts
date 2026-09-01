import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Triggers against a live stack - ported from the jest suite
 * `core/trigger/__tests__/trigger.integration.test.ts`. The trigger *unit* mechanics
 * stay in jest (`trigger.test.ts`, which needs no database); what belongs here is the
 * authoring path actually running them: before-triggers shaping the document,
 * after-triggers persisting, and a `jobId` trigger reaching the job engine as an
 * `"event"` run.
 */
describe("trigger integration", () => {
    it("runs before and after triggers on the authoring path", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "trigger-run",
            username: "trigger-user1",
            password: "trigger-pass1",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;

                const beforeClass = await Class.create(stack, "BeforeTrigger", "class", "before trigger test");
                await Attribute.create(beforeClass, "name", "string", "Name", { mandatory: true });
                await Attribute.create(beforeClass, "flag", "boolean", "Flag", {});
                await beforeClass.addTrigger("before:flag", {
                    name: "beforeFlag",
                    order: "before",
                    run: `
                        document.flag = true;
                        document.originClass = classObj?.getName?.();
                        return document;
                    `,
                });
                const beforeDoc = await beforeClass.addCard({ name: "Triggered" });
                const storedBefore = await stack.getDocument(beforeDoc._id);

                const afterClass = await Class.create(stack, "AfterTrigger", "class", "after trigger test");
                await Attribute.create(afterClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(afterClass, "audit", "integer", "Audit", { mandatory: false });
                await afterClass.addTrigger("after:audit", {
                    name: "afterAudit",
                    order: "after",
                    run: `
                        const current = typeof document.audit === "number" ? document.audit : 0;
                        document.audit = current + 1;
                        document.afterRan = true;
                        return document;
                    `,
                });
                const afterDoc = await afterClass.addCard({ title: "After trigger" });
                const storedAfter = await stack.getDocument(afterDoc._id);

                return {
                    flag: (storedBefore as any)?.flag,
                    originClass: (storedBefore as any)?.originClass,
                    audit: (storedAfter as any)?.audit,
                    afterRan: (storedAfter as any)?.afterRan,
                };
            },
        });

        expect(result.flag).toBe(true);
        expect(result.originClass).toBe("BeforeTrigger");
        expect(result.audit).toBe(1);
        expect(result.afterRan).toBe(true);
    });

    it("executes trigger jobs referenced by jobId, as event runs", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "trigger-job",
            username: "trigger-user2",
            password: "trigger-pass2",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const hashContent = async (content: string) => {
                    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
                    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
                };

                const classObj = await Class.create(stack, "JobTrigger", "class", "job trigger test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

                const content = `
function execute(_stack, params) {
    const doc = params?.document || {};
    return { metadata: { lastTriggeredFor: doc.title || "", ran: true } };
}
`;
                await stack.db.bulkDocs([{
                    _id: "Job-trigger-test", "~class": "~Job", name: "Trigger job",
                    type: "user", workerPlatform: "client",
                    content, hash: await hashContent(content),
                    isEnabled: true, isSingleton: false,
                }]);

                await classObj.addTrigger("after:title", {
                    name: "after-title-job",
                    order: "after",
                    jobId: "Job-trigger-test",
                });
                await classObj.addCard({ title: "Job-based trigger" });

                const runs = await stack.db.find({
                    selector: { "~class": "~JobRun", jobId: "Job-trigger-test" },
                });
                const run = runs.docs[0] as any;
                const storedJob = await stack.db.get("Job-trigger-test");

                return {
                    runCount: runs.docs.length,
                    status: run?.status,
                    triggerType: run?.triggerType,
                    finalFor: run?.finalMetadata?.lastTriggeredFor,
                    jobFor: (storedJob as any)?.metadata?.lastTriggeredFor,
                };
            },
        });

        expect(result.runCount).toBe(1);
        expect(result.status).toBe("SUCCESS");
        expect(result.triggerType).toBe("event");
        expect(result.finalFor).toBe("Job-based trigger");
        expect(result.jobFor).toBe("Job-based trigger");
    });
});
