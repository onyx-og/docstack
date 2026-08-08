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

    it("rejects queries on encrypted classes once the session is cleared", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "crypto-query-absent",
            username: "crypto-query-user2",
            password: "crypto-query-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

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

                stack.clearAuthSession();

                let partialThrew = false;
                let partialErrorMessage = "";
                try {
                    await stack.query("SELECT title, secret FROM PartialSecureItem;");
                } catch (e: any) {
                    partialThrew = true;
                    partialErrorMessage = e.message || "";
                }

                let lockedThrew = false;
                let lockedErrorMessage = "";
                try {
                    await stack.query("SELECT secret FROM FullyLockedItem;");
                } catch (e: any) {
                    lockedThrew = true;
                    lockedErrorMessage = e.message || "";
                }

                return {
                    withKeyRows,
                    partialThrew,
                    partialErrorMessage,
                    lockedThrew,
                    lockedErrorMessage,
                };
            },
        });

        expect(result.withKeyRows).toEqual([{ title: "partially-visible", secret: "semi" }]);
        expect(result.partialThrew).toBe(true);
        expect(result.partialErrorMessage).toContain("authenticated");
        expect(result.lockedThrew).toBe(true);
        expect(result.lockedErrorMessage).toContain("authenticated");
    });
});
