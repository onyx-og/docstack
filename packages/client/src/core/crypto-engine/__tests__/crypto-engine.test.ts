import crypto from "crypto";
import { CryptoEngine, wrapDocumentKey } from "../index.js";

const deriveKey = (password: string, salt: string) =>
    crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");

describe("CryptoEngine", () => {
    it("wraps and unwraps the shared document key with a user key", async () => {
        const derivedKey = deriveKey("strong-password", "user-salt");
        // A document key is hex-encoded 32 bytes (ADR-0018), and the engine validates
        // that - an arbitrary string like "doc-key-123" is rejected as malformed hex,
        // which is the contract, not a bug.
        const documentKey = crypto.randomBytes(32).toString("hex");
        const wrapped = await wrapDocumentKey(documentKey, derivedKey);

        const engine = new CryptoEngine({ isCryptoEngineDisabled: () => false } as any);
        const unwrapped = await engine.unwrapAndStoreDocumentKey(wrapped, derivedKey);

        expect(unwrapped).toBe(documentKey);
        expect(engine.getDocumentKey()).toBe(documentKey);
    });

    // Field encryption at rest and decryption on read need a real stack, which does not
    // open under Node - that half lives in `src-test/crypto-config.test.ts`.
});
