import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("query authentication", () => {
    it("allows querying when authenticated and rejects when session is cleared", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "query-auth",
            username: "query-user",
            password: "query-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const secureClass = await Class.create(stack, "SecureItem", "class", "Secured items", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                await secureClass.addCard({ title: "secret" });

                const { rows: authenticatedRows } = await stack.query("SELECT title FROM SecureItem;");

                stack.clearAuthSession();

                let threwWhenCleared = false;
                let errorMessage = "";
                try {
                    await stack.query("SELECT title FROM SecureItem;");
                } catch (e: any) {
                    threwWhenCleared = true;
                    errorMessage = e.message || "";
                }

                return {
                    authenticatedRows,
                    threwWhenCleared,
                    errorMessage,
                };
            },
        });

        expect(result.authenticatedRows).toEqual([{ title: "secret" }]);
        expect(result.threwWhenCleared).toBe(true);
        expect(result.errorMessage).toContain("authenticated");
    });
});
