import { test as it, expect } from './fixtures';

const describe = it.describe;

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

/**
 * Re-keying a database used to be all-or-nothing: `EncryptedPayload` carried no key
 * identifier, so a half-finished pass left some fields readable and some not with nothing
 * saying which was which. These cover the two properties that make it incremental and
 * resumable instead - payloads name their key, and a retired key stays readable.
 */
describe("document key rotation", () => {
    it("stamps a stable key identifier on every payload it writes", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, deriveKeyId } = (window as any).docstack;
            const name = `kid-stamp-${Date.now()}`;
            const documentKey = "a".repeat(64);

            const stack = await ClientStack.create(`db-${name}`, { documentKey });
            try {
                const payload = await stack.cryptoEngine.encryptValueForMarker({ v: 1 });
                return {
                    kid: payload.kid,
                    engineKeyId: stack.cryptoEngine.getKeyId(),
                    // Derivable from the key alone: a second device reaches the same
                    // identifier without being told it.
                    derived: await deriveKeyId(documentKey),
                };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.kid).toBeTruthy();
        expect(result.kid).toBe(result.engineKeyId);
        expect(result.kid).toBe(result.derived);
    });

    it("distinguishes different keys and says nothing about the key itself", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { deriveKeyId } = (window as any).docstack;
            const keyA = "a".repeat(64);
            const keyB = "b".repeat(64);
            return {
                a: await deriveKeyId(keyA),
                b: await deriveKeyId(keyB),
                stable: await deriveKeyId(keyA),
            };
        });

        expect(result.a).not.toBe(result.b);
        expect(result.a).toBe(result.stable);
        // One-way: the identifier must not leak the key it names.
        expect(result.a).not.toContain("aaaa");
        expect(result.a).toHaveLength(16);
    });

    it("reads fields written under a retired key while writing under the new one", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `kid-rotate-${Date.now()}`;
            const keyA = "a".repeat(64);
            const keyB = "b".repeat(64);

            // Written under the original key.
            const stack = await ClientStack.create(`db-${name}`, { documentKey: keyA });
            try {
                const underA = await stack.cryptoEngine.encryptValueForMarker({ era: "old" });
                const kidA = underA.kid;

                // Rotate: keep the old key readable, then start writing under the new one.
                await stack.cryptoEngine.retireDocumentKey(keyA);
                await stack.cryptoEngine.setDocumentKey(keyB);

                const underB = await stack.cryptoEngine.encryptValueForMarker({ era: "new" });

                // Both eras open, which is what lets the rewrite happen a piece at a time.
                const oldDoc: any = { value: underA };
                const newDoc: any = { value: underB };
                await stack.cryptoEngine.decryptDocument(oldDoc, undefined, ["value"]);
                await stack.cryptoEngine.decryptDocument(newDoc, undefined, ["value"]);

                return {
                    kidA,
                    kidB: underB.kid,
                    readableKeyIds: stack.cryptoEngine.getReadableKeyIds(),
                    recoveredOld: oldDoc.value,
                    recoveredNew: newDoc.value,
                    currentKeyId: stack.cryptoEngine.getKeyId(),
                };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.kidA).not.toBe(result.kidB);
        expect(result.recoveredOld).toEqual({ era: "old" });
        expect(result.recoveredNew).toEqual({ era: "new" });
        // The current key is the one that writes; the retired one only reads.
        expect(result.currentKeyId).toBe(result.kidB);
        expect(result.readableKeyIds).toEqual([result.kidB, result.kidA]);
    });

    it("identifies which stored fields a partial rotation has still to rewrite", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `kid-resume-${Date.now()}`;
            const keyA = "a".repeat(64);
            const keyB = "b".repeat(64);

            const stack = await ClientStack.create(`db-${name}`, { documentKey: keyA });
            try {
                const stale = await stack.cryptoEngine.encryptValueForMarker({ n: 1 });

                await stack.cryptoEngine.retireDocumentKey(keyA);
                await stack.cryptoEngine.setDocumentKey(keyB);

                const fresh = await stack.cryptoEngine.encryptValueForMarker({ n: 2 });

                // This is the whole point: an interrupted rotation can be resumed, because
                // the fields still to do are the ones whose kid is not the current one.
                const current = stack.cryptoEngine.getKeyId();
                const needsRewrite = [stale, fresh].filter((p: any) => p.kid !== current);

                // Finish the one that was left behind.
                const carried: any = { value: stale };
                await stack.cryptoEngine.decryptDocument(carried, undefined, ["value"]);
                const rewritten = await stack.cryptoEngine.encryptValueForMarker(carried.value);

                return {
                    pending: needsRewrite.length,
                    rewrittenKid: rewritten.kid,
                    current,
                };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.pending).toBe(1);
        expect(result.rewrittenKid).toBe(result.current);
    });

    it("still reads payloads written before key identifiers existed", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, isEncryptedPayload } = (window as any).docstack;
            const name = `kid-legacy-${Date.now()}`;
            const documentKey = "a".repeat(64);

            const stack = await ClientStack.create(`db-${name}`, { documentKey });
            try {
                const payload = await stack.cryptoEngine.encryptValueForMarker({ legacy: true });
                // Strip the identifier to mimic a value stored by an older version.
                const legacy = { __enc: true, iv: payload.iv, data: payload.data, alg: payload.alg };

                const doc: any = { value: legacy };
                await stack.cryptoEngine.decryptDocument(doc, undefined, ["value"]);

                return { recognised: isEncryptedPayload(legacy), recovered: doc.value };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.recognised).toBe(true);
        expect(result.recovered).toEqual({ legacy: true });
    });
});
