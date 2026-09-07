import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("query authentication", () => {
    // Access control is cryptographic since ADR-0045: losing the key SEALS the
    // data, it does not throw. Clearing the session drops the document key, so a
    // query over an all-encrypted class returns nothing readable rather than
    // raising - the graceful locked-read convention (ADR-0020), now the whole
    // access story.
    it("seals encrypted reads when the session (and its key) is cleared", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "query-auth",
            username: "query-user",
            password: "query-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const secureClass = await Class.create(stack, "SecureItem", "class", "Secured items", {
                    title: { name: "title", type: "string", config: { mandatory: true, encrypted: true } },
                });

                await secureClass.addCard({ title: "secret" });

                const { rows: authenticatedRows } = await stack.query("SELECT title FROM SecureItem;");

                stack.clearAuthSession();

                let threwWhenCleared = false;
                let sealedRows: any[] = [];
                try {
                    let { rows } = await stack.query("SELECT title FROM SecureItem;");
                    sealedRows = rows;
                } catch (e: any) {
                    threwWhenCleared = true;
                }

                return { authenticatedRows, sealedRows, threwWhenCleared };
            },
        });

        expect(result.authenticatedRows).toEqual([{ title: "secret" }]);
        // `title` is the only field and it is encrypted: with no key it seals to
        // null, the row has nothing visible, and it drops out. Empty, not an error.
        expect(result.sealedRows).toEqual([]);
        expect(result.threwWhenCleared).toBe(false);
    });
});
