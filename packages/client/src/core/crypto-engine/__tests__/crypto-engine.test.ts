import crypto from "crypto";
import { CryptoEngine, wrapDocumentKey } from "../index.js";
import { createTestDocStack } from "../../test-utils/docstack.js";

jest.setTimeout(15000);

const deriveKey = (password: string, salt: string) =>
    crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");

describe("CryptoEngine", () => {
    it("wraps and unwraps the shared document key with a user key", async () => {
        const derivedKey = deriveKey("strong-password", "user-salt");
        const wrapped = await wrapDocumentKey("doc-key-123", derivedKey);

        const engine = new CryptoEngine({} as any);
        const unwrapped = await engine.unwrapAndStoreDocumentKey(wrapped, derivedKey);

        expect(unwrapped).toBe("doc-key-123");
        expect(engine.getDocumentKey()).toBe("doc-key-123");
    });

    it("encrypts and decrypts document fields marked as encrypted", async () => {
        const { stack, cleanup } = await createTestDocStack("crypto-engine");
        try {
            const documentKey = crypto.randomBytes(32).toString("hex");
            await stack.cryptoEngine.setDocumentKey(documentKey);

            const userClassModel = await stack.getClassModel("~User");
            const userSchema = userClassModel?.schema || {};

            const userDoc = {
                _id: `user-${Date.now()}`,
                "~class": "~User",
                username: "crypto-user",
                password: "top-secret",
                authMethod: "AuthMod-Classic",
                externalId: "",
                keyDerivationSalt: "test-salt",
            };

            const created = await stack.createDoc(userDoc._id, userDoc["~class"], userSchema, userDoc);

            const allDocs = await stack.db.allDocs({ include_docs: true });
            const stored = allDocs.rows.find((row) => row.id === created?._id)?.doc as any;
            expect(stored.password).toHaveProperty("__enc", true);

            const fetched = await stack.getDocument(created?._id as string) as any;
            expect(fetched.password).toBe("top-secret");
        } finally {
            await cleanup();
        }
    });
});
