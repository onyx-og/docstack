import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("crypto-engine queries", () => {
    it("decrypts encrypted fields when the document key is available", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "crypto-query-decrypt",
            username: "crypto-query-user",
            password: "crypto-query-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // Generate a random 32-byte hex key in the browser
                // const array = new Uint8Array(32);
                // crypto.getRandomValues(array);
                // const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                // await stack.cryptoEngine.setDocumentKey(documentKey);

                const secureClass = await Class.create(stack, "SecureQueryItem", "class", "Encrypted query records", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                    category: { name: "category", type: "string", config: { mandatory: false } },
                });

                await secureClass.addCard({ title: "visible", secret: "classified", category: "general" });

                const { rows } = await stack.query("SELECT title, secret, category FROM SecureQueryItem;");
                return { rows };
            },
        });

        expect(result.rows).toEqual([{ title: "visible", secret: "classified", category: "general" }]);
    });

    it("drops encrypted fields and rows gracefully when the document key is absent", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "crypto-query-absent",
            username: "crypto-query-user2",
            password: "crypto-query-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // Generate a random 32-byte hex key in the browser
                // const array = new Uint8Array(32);
                // crypto.getRandomValues(array);
                // const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                // await stack.cryptoEngine.setDocumentKey(documentKey);

                const secureClass = await Class.create(stack, "PartialSecureItem", "class", "Partially encrypted records", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                const lockedClass = await Class.create(stack, "FullyLockedItem", "class", "Fully encrypted records", {
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                await secureClass.addCard({ title: "partially-visible", secret: "semi" });
                await lockedClass.addCard({ _id: `locked-${Date.now()}`, secret: "sealed" });

                const { rows: withKeyRows } = await stack.query("SELECT title, secret FROM PartialSecureItem;");

                // await stack.cryptoEngine.setDocumentKey(null);
                stack.clearAuthSession();

                const { rows: withoutKeyRows } = await stack.query("SELECT title, secret FROM PartialSecureItem;");
                const { rows: fullyLockedRows } = await stack.query("SELECT secret FROM FullyLockedItem;");

                return {
                    withKeyRows,
                    withoutKeyRows,
                    fullyLockedRows,
                };
            },
        });

        expect(result.withKeyRows).toEqual([{ title: "partially-visible", secret: "semi" }]);
        expect(result.withoutKeyRows).toEqual([{ title: "partially-visible", secret: null }]);
        expect(result.fullyLockedRows).toEqual([]);
    });
});
