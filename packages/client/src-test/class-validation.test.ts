import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("PouchDB plugin class validation", () => {
    it("rejects documents that reference missing classes", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "missing-class",
            evaluate: async ({ stack }) => {
                const missingClass = "MissingClass";
                const doc = { _id: `missing-${Date.now()}`, "~class": missingClass };

                let threw = false;
                let errorMessage = "";
                try {
                    await stack.db.bulkDocs([doc]);
                } catch (e: any) {
                    threw = true;
                    errorMessage = e.message || "";
                }

                return { threw, errorMessage, missingClass };
            },
        });

        expect(result.threw).toBe(true);
        expect(result.errorMessage).toContain(`Class '${result.missingClass}' not found`);
    });
});
