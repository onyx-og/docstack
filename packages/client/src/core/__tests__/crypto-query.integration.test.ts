import crypto from "crypto";
import { Class } from "../index.js";
import { createAuthenticatedStack } from "../test-utils/docstack.js";

jest.setTimeout(20000);

describe("crypto-engine queries", () => {
    it("decrypts encrypted fields when the document key is available", async () => {
        const { stack, cleanup } = await createAuthenticatedStack("crypto-query-user", "crypto-query-pass");
        try {
            const documentKey = crypto.randomBytes(32).toString("hex");
            await stack.cryptoEngine.setDocumentKey(documentKey);

            const secureClass = await Class.create(stack, "SecureQueryItem", "class", "Encrypted query records", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                category: { name: "category", type: "string", config: { mandatory: false } },
            });

            await secureClass.addCard({ title: "visible", secret: "classified", category: "general" });

            const result = await stack.query("SELECT title, secret, category FROM SecureQueryItem;");
            expect(result.rows).toEqual([{ title: "visible", secret: "classified", category: "general" }]);
        } finally {
            await cleanup();
        }
    });

    it("drops encrypted fields and rows gracefully when the document key is absent", async () => {
        const { stack, cleanup } = await createAuthenticatedStack("crypto-query-user2", "crypto-query-pass2");
        try {
            const documentKey = crypto.randomBytes(32).toString("hex");
            await stack.cryptoEngine.setDocumentKey(documentKey);

            const secureClass = await Class.create(stack, "PartialSecureItem", "class", "Partially encrypted records", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
            });

            const lockedClass = await Class.create(stack, "FullyLockedItem", "class", "Fully encrypted records", {
                secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
            });

            await secureClass.addCard({ title: "partially-visible", secret: "semi" });
            await lockedClass.addCard({ _id: `locked-${Date.now()}`, secret: "sealed" });

            const withKey = await stack.query("SELECT title, secret FROM PartialSecureItem;");
            expect(withKey.rows).toEqual([{ title: "partially-visible", secret: "semi" }]);

            await stack.cryptoEngine.setDocumentKey(null);

            const withoutKey = await stack.query("SELECT title, secret FROM PartialSecureItem;");
            expect(withoutKey.rows).toEqual([{ title: "partially-visible", secret: null }]);

            const fullyLocked = await stack.query("SELECT secret FROM FullyLockedItem;");
            expect(fullyLocked.rows).toEqual([]);
        } finally {
            await cleanup();
        }
    });
});
