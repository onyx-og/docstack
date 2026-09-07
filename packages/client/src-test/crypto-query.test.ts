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

    // ADR-0045: clearing the key seals encrypted fields to `null` per the
    // locked-read convention, per payload. A row keeps whatever is NOT
    // encrypted; a row whose every visible field was encrypted drops out. No
    // throw - access denial is the seal, not an exception.
    it("seals encrypted fields per row once the key is cleared", async ({ useDocStack }) => {
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

                // A visible non-encrypted column keeps the row; `secret` seals to null.
                const { rows: partialRows } = await stack.query("SELECT title, secret FROM PartialSecureItem;");
                // Only the encrypted column projected: it seals, nothing visible remains,
                // and the row drops.
                const { rows: sealedProjection } = await stack.query("SELECT secret FROM FullyLockedItem;");

                return { withKeyRows, partialRows, sealedProjection };
            },
        });

        expect(result.withKeyRows).toEqual([{ title: "partially-visible", secret: "semi" }]);
        expect(result.partialRows).toEqual([{ title: "partially-visible", secret: null }]);
        expect(result.sealedProjection).toEqual([]);
    });
});
