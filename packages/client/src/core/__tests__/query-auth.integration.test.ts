import { Class } from "../index.js";
import { createAuthenticatedStack } from "../test-utils/docstack";

jest.setTimeout(20000);

describe("query authentication", () => {
    it("allows querying when authenticated and rejects when session is cleared", async () => {
        const { stack, cleanup } = await createAuthenticatedStack("query-user", "query-pass");
        try {
            const secureClass = await Class.create(stack, "SecureItem", "class", "Secured items", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
            });

            await secureClass.addCard({ title: "secret" });

            const { rows } = await stack.query("SELECT title FROM SecureItem;");
            expect(rows).toEqual([{ title: "secret" }]);

            stack.clearAuthSession();
            await expect(stack.query("SELECT title FROM SecureItem;")).rejects.toThrow("authenticated");
        } finally {
            await cleanup();
        }
    });
});
