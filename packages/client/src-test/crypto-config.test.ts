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

    // Regression tests for specs/adr/0018-docstack-document-key-lifecycle.md.
    // Before the fix, a stack opened with no key invented a random one per session,
    // never persisted it, and never verified it against the stored canary - so writes
    // succeeded under K1 and read back as undecryptable ciphertext under K2, silently.

    it("ADR-0018: opens locked instead of inventing a document key", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `key-lifecycle-locked-${Date.now()}`;

            const stack = await ClientStack.create(`db-${name}`);
            try {
                return {
                    locked: stack.isLocked(),
                    // The whole bug: a key that exists here could not outlive the session.
                    key: stack.cryptoEngine.getDocumentKey() ?? null,
                };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.locked).toBe(true);
        expect(result.key).toBeNull();
    });

    it("ADR-0018: a supplied key survives close and reopen", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `key-lifecycle-persist-${Date.now()}`;
            const documentKey = "a".repeat(64);

            const stack1 = await ClientStack.create(`db-${name}`, { documentKey });
            const ciphertext = await stack1.cryptoEngine.encryptValueForMarker({ secret: "top-secret" });
            stack1.close();

            // Same key, second session: the value written before must come back.
            const stack2 = await ClientStack.create(`db-${name}`, { documentKey });
            try {
                const roundTrip: any = { secret: ciphertext };
                await stack2.cryptoEngine.decryptDocument(roundTrip, undefined, ["secret"]);
                return {
                    locked: stack2.isLocked(),
                    recovered: roundTrip.secret,
                };
            } finally {
                await stack2.db.destroy();
            }
        });

        expect(result.locked).toBe(false);
        expect(result.recovered).toEqual({ secret: "top-secret" });
    });

    it("ADR-0018: rejects a key that cannot decrypt the stack's canary", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `key-lifecycle-canary-${Date.now()}`;

            const stack1 = await ClientStack.create(`db-${name}`, { documentKey: "a".repeat(64) });
            stack1.close();

            let threw = false;
            let errorMessage = "";
            let stack2: any = null;
            try {
                // A different key: exactly what the old code produced on every reopen.
                stack2 = await ClientStack.create(`db-${name}`, { documentKey: "b".repeat(64) });
            } catch (e: any) {
                threw = true;
                errorMessage = e.message || "";
            }

            const cleanup = stack2 || await ClientStack.create(`db-${name}`, { documentKey: "a".repeat(64) });
            await cleanup.db.destroy();

            return { threw, errorMessage };
        });

        expect(result.threw).toBe(true);
        expect(result.errorMessage).toMatch(/does not match this stack/i);
    });

    it("ADR-0018: unlock supplies the key later and refuses the wrong one", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `key-lifecycle-unlock-${Date.now()}`;
            const documentKey = "c".repeat(64);

            // First session establishes the canary.
            const stack1 = await ClientStack.create(`db-${name}`, { documentKey });
            stack1.close();

            // Second session opens with no key at all, then is handed one.
            const stack2 = await ClientStack.create(`db-${name}`);
            try {
                const lockedBeforeUnlock = stack2.isLocked();

                let wrongKeyThrew = false;
                try {
                    await stack2.unlock("d".repeat(64));
                } catch {
                    wrongKeyThrew = true;
                }
                // A rejected key must leave the stack as it was, not half-keyed.
                const stillLockedAfterWrongKey = stack2.isLocked();

                let unlockedEventFired = false;
                stack2.addEventListener("unlocked", () => { unlockedEventFired = true; });
                await stack2.unlock(documentKey);

                return {
                    lockedBeforeUnlock,
                    wrongKeyThrew,
                    stillLockedAfterWrongKey,
                    lockedAfterUnlock: stack2.isLocked(),
                    unlockedEventFired,
                };
            } finally {
                await stack2.db.destroy();
            }
        });

        expect(result.lockedBeforeUnlock).toBe(true);
        expect(result.wrongKeyThrew).toBe(true);
        expect(result.stillLockedAfterWrongKey).toBe(true);
        expect(result.lockedAfterUnlock).toBe(false);
        expect(result.unlockedEventFired).toBe(true);
    });

    it("ADR-0018: a locked stack refuses to write encrypted attributes in the clear", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `key-lifecycle-refuse-${Date.now()}`;

            const stack = await ClientStack.create(`db-${name}`);
            try {
                // Authenticating satisfies the policy engine without supplying a key: the
                // seed user carries no wrapped one, so the stack stays locked. That is the
                // state under test - a session held, but no key.
                await stack.authenticate({ username: "system", password: "system" });

                const secretClass = await Class.create(stack, "LockedSecret", "class", "Locked", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                let threw = false;
                let errorMessage = "";
                try {
                    await secretClass.addCard({ title: "t", secret: "should-not-be-stored" });
                } catch (e: any) {
                    threw = true;
                    errorMessage = e.message || "";
                }

                return { locked: stack.isLocked(), threw, errorMessage };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.locked).toBe(true);
        expect(result.threw).toBe(true);
        expect(result.errorMessage).toMatch(/locked/i);
    });

    it("stores an encrypted marker once a document key is available", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "crypto-marker",
            evaluate: async ({ stack }) => {
                // Generate a random 32-byte hex key in the browser
                // const array = new Uint8Array(32);
                // crypto.getRandomValues(array);
                // const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                // await stack.cryptoEngine.setDocumentKey(documentKey);
                // await (stack as any).ensureCryptoMarkerEncryption();

                const marker = await stack.db.get<any>("~crypto-engine-config");
                const encryptedMarker = marker.encryptedMarker;

                // Check if the encryptedMarker looks like an encrypted payload
                const isEncrypted = typeof encryptedMarker === "object" &&
                    encryptedMarker !== null && (encryptedMarker as any).__enc === true &&
                    "iv" in encryptedMarker && "data" in encryptedMarker;

                return { isEncrypted };
            },
        });

        expect(result.isEncrypted).toBe(true);
    });

    it("encrypts marked fields at rest and decrypts them on read", async ({ useDocStack }) => {
        // Ported from the jest crypto-engine suite, which could not open a stack under
        // Node: the ciphertext shape at rest and the decrypting read are what need a
        // real database.
        const result = await useDocStack({
            name: "crypto-at-rest",
            username: "vault-user",
            password: "vault-pass",
            documentKey: "ab".repeat(32),
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const vault = await Class.create(stack, "Vault", "class", "Encrypted records", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });
                const card = await vault.addCard({ title: "visible", secret: "top-secret" });

                // Raw shape, as stored: `allDocs` does not decrypt.
                const all = await stack.db.allDocs({ include_docs: true });
                const stored = all.rows.find((row: any) => row.id === card._id)?.doc as any;

                // Every reading path decrypts - single-document get included, since
                // ADR-0032 restored the plugin's `get` override. Ciphertext is the
                // changes feed's property (ADR-0020), never a read's.
                const fetched = await stack.getDocument(card._id) as any;
                const queried = await stack.query("SELECT secret FROM Vault;");

                return {
                    storedEnc: stored?.secret?.__enc === true,
                    storedHasNoPlaintext: JSON.stringify(stored?.secret ?? null).includes("top-secret") === false,
                    fetchedSecret: fetched?.secret ?? null,
                    queriedSecret: queried.rows?.[0]?.secret ?? null,
                };
            },
        });

        expect(result.storedEnc).toBe(true);
        expect(result.storedHasNoPlaintext).toBe(true);
        expect(result.fetchedSecret).toBe("top-secret");
        expect(result.queriedSecret).toBe("top-secret");
    });
});
