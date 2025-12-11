import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("crypto engine configuration", () => {
    it("persists disableCryptoEngine flag and blocks mismatched reopen", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;

            const name = `crypto-flag-${Date.now()}`;
            const stack = await ClientStack.create(`db-${name}`, { disableCryptoEngine: true });

            try {
                const marker = await stack.db.get<any>("~crypto-engine-config");
                const cryptoEngineDisabled = marker.cryptoEngineDisabled;

                stack.close();

                let threwOnReopen = false;
                let errorMessage = "";
                try {
                    await ClientStack.create(`db-${name}`);
                } catch (e: any) {
                    threwOnReopen = true;
                    errorMessage = e.message || "";
                }

                return { cryptoEngineDisabled, threwOnReopen, errorMessage };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.cryptoEngineDisabled).toBe(true);
        expect(result.threwOnReopen).toBe(true);
        expect(result.errorMessage).toMatch(/crypto engine disabled/i);
    });

    it("rejects disabling crypto for a stack that was created with encryption enabled", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;

            const name = `crypto-required-${Date.now()}`;
            const stack = await ClientStack.create(`db-${name}`);

            try {
                const marker = await stack.db.get<any>("~crypto-engine-config");
                const cryptoEngineDisabled = marker.cryptoEngineDisabled;

                stack.close();

                let threwOnReopen = false;
                let errorMessage = "";
                try {
                    await ClientStack.create(`db-${name}`, { disableCryptoEngine: true });
                } catch (e: any) {
                    threwOnReopen = true;
                    errorMessage = e.message || "";
                }

                return { cryptoEngineDisabled, threwOnReopen, errorMessage };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.cryptoEngineDisabled).toBe(false);
        expect(result.threwOnReopen).toBe(true);
        expect(result.errorMessage).toMatch(/requires the crypto engine/i);
    });

    it("stores an encrypted marker once a document key is available", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "crypto-marker",
            evaluate: async ({ stack }) => {
                // Generate a random 32-byte hex key in the browser
                const array = new Uint8Array(32);
                crypto.getRandomValues(array);
                const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                await stack.cryptoEngine.setDocumentKey(documentKey);
                await (stack as any).ensureCryptoMarkerEncryption();

                const marker = await stack.db.get<any>("~crypto-engine-config");
                const encryptedMarker = marker.encryptedMarker;

                // Check if the encryptedMarker looks like an encrypted payload
                const isEncrypted = typeof encryptedMarker === "object" &&
                    encryptedMarker !== null &&
                    "iv" in encryptedMarker &&
                    "ciphertext" in encryptedMarker;

                return { isEncrypted };
            },
        });

        expect(result.isEncrypted).toBe(true);
    });
});
