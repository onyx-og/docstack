import Class from "../../class";
import type { PolicyModel } from "@docstack/shared";
import { createSessionProof, createTestDocStack } from "../../test-utils/docstack";

jest.setTimeout(20000);

describe("PolicyEngine", () => {
    it("filters reads and denies writes based on policy rules", async () => {
        const { stack, cleanup } = await createTestDocStack("policy-engine");
        try {
            await createSessionProof(stack, "alice");

            const noteClass = await Class.create(stack, "Note", "class", "Note class", {
                title: { name: "title", type: "string", config: { mandatory: true } },
                owner: { name: "owner", type: "string", config: { mandatory: true } },
            });

            const ownerPolicy: PolicyModel = {
                _id: "Policy-Note-owner",
                "~class": "~Policy",
                userId: "system",
                rule: "if (document.owner !== session.username) return false; return true;",
                description: "Only allow owners to access notes",
                targetClass: [noteClass.getModel()._id],
            };

            await stack.db.bulkDocs([ownerPolicy as any]);

            await stack.createDoc(null, noteClass.name, noteClass, { title: "visible", owner: "alice" });

            const aliceDocs = await stack.findDocuments<{ title: string; owner: string }>({ "~class": { $eq: noteClass.name } });
            expect(aliceDocs.docs).toHaveLength(1);

            await createSessionProof(stack, "bob");

            await expect(
                stack.createDoc(null, noteClass.name, noteClass, { title: "blocked", owner: "alice" })
            ).rejects.toThrow();

            const bobDocs = await stack.findDocuments<{ title: string; owner: string }>({ "~class": { $eq: noteClass.name } });
            expect(bobDocs.docs).toHaveLength(0);
        } finally {
            await cleanup();
        }
    });
});
