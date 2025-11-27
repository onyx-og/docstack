import { Attribute, Class } from "../../index.js";
import type { Document } from "@docstack/shared";
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
