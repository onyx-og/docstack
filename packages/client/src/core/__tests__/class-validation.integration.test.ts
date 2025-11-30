import { createTestDocStack } from "../test-utils/docstack";

describe("PouchDB plugin class validation", () => {
    it("rejects documents that reference missing classes", async () => {
        const { stack, cleanup } = await createTestDocStack("missing-class");
        const missingClass = "MissingClass";
        const doc = { _id: `missing-${Date.now()}`, "~class": missingClass };

        try {
            await expect(stack.db.bulkDocs([doc])).rejects.toThrow(`Class '${missingClass}' not found`);
        } finally {
            await cleanup();
        }
    });
});
