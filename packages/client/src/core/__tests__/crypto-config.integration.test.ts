import crypto from "crypto";
import ClientStack from "../stack.js";
import { isEncryptedPayload } from "../crypto-engine/utils.js";
import { createTestDocStack } from "../test-utils/docstack.js";

jest.setTimeout(20000);

describe("crypto engine configuration", () => {
    it("persists disableCryptoEngine flag and blocks mismatched reopen", async () => {
        const name = `crypto-flag-${Date.now()}`;
        const stack = await ClientStack.create(`db-${name}`, { disableCryptoEngine: true });
        try {
            const marker = await stack.db.get<any>("~crypto-engine-config");
            expect(marker.cryptoEngineDisabled).toBe(true);

            stack.close();
            await expect(ClientStack.create(`db-${name}`)).rejects.toThrow(/crypto engine disabled/i);
        } finally {
            await stack.db.destroy();
        }
    });

    it("rejects disabling crypto for a stack that was created with encryption enabled", async () => {
        const name = `crypto-required-${Date.now()}`;
        const stack = await ClientStack.create(`db-${name}`);
        try {
            const marker = await stack.db.get<any>("~crypto-engine-config");
            expect(marker.cryptoEngineDisabled).toBe(false);

            stack.close();
            await expect(
                ClientStack.create(`db-${name}`, { disableCryptoEngine: true })
            ).rejects.toThrow(/requires the crypto engine/i);
        } finally {
            await stack.db.destroy();
        }
    });

    it("stores an encrypted marker once a document key is available", async () => {
        const { stack, cleanup } = await createTestDocStack("crypto-marker", { withSession: false });
        try {
            const documentKey = crypto.randomBytes(32).toString("hex");
            await stack.cryptoEngine.setDocumentKey(documentKey);
            await (stack as any).ensureCryptoMarkerEncryption();

            const marker = await stack.db.get<any>("~crypto-engine-config");
            expect(isEncryptedPayload((marker as any).encryptedMarker)).toBe(true);
        } finally {
            await cleanup();
        }
    });
});
