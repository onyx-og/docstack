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

                // Generate a random 32-byte hex key in the browser
                // const array = new Uint8Array(32);
                // crypto.getRandomValues(array);
                // const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                // await stack.cryptoEngine.setDocumentKey(documentKey);

                const secureClass = await Class.create(stack, "SecureItem", "class", "Secured items", {
                    title: { name: "title", type: "string", config: { mandatory: true, encrypted: true } },
                });

                await secureClass.addCard({ title: "secret" });

                const { rows: authenticatedRows } = await stack.query("SELECT title FROM SecureItem;");

                stack.clearAuthSession();
                // await stack.cryptoEngine.setDocumentKey(null);

                let threwWhenCleared = false;
                let unauthenticatedRows;
                let errorMessage = "";
                try {
                    let { rows } = await stack.query("SELECT title FROM SecureItem;");
                    unauthenticatedRows = rows;
                } catch (e: any) {
                    threwWhenCleared = true;
                    errorMessage = e.message || "";
                }
                

                return {
                    authenticatedRows,
                    unauthenticatedRows,
                    threwWhenCleared,
                    errorMessage,
                };
            },
        });

        expect(result.unauthenticatedRows).toEqual([]);
        expect(result.authenticatedRows).toEqual([{ title: "secret" }]);
        expect(result.threwWhenCleared).toBe(true);
        expect(result.errorMessage).toContain("authenticated");
    });
});
