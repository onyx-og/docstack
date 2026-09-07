import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cryptographic access scopes - ADR-0045, spec 02.
 *
 * The one access-control language: content belongs to a scope, the scope's CEK
 * is ABE-sealed under an attribute policy, and a session's attribute key either
 * satisfies the formula (scope opens, reads plaintext) or does not (scope stays
 * sealed, reads null). Denial is decryption failure. Writing into a sealed
 * scope refuses; relabeling a document to a scope it was not sealed for refuses
 * (the induced-downgrade guard). The authority half (setup/keygen) runs in the
 * test only - never the client's public API.
 */
describe("access scopes", () => {
    it("a satisfying key opens a scope and reads plaintext; a non-satisfying key cannot", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const abe = (window as any).docstackAbe;
            const name = `scopes-open-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            // AUTHORITY (runs where the app controls it; here, the test).
            const { pk, msk } = await abe.setup();
            const scopeDoc = await ClientStack.buildAccessScope({
                scopeId: "hr", policyString: '"role:hr" or "clearance:exec"', pk,
            });
            const hrKey = await abe.keygen(msk, ["role:hr"]);
            const outsiderKey = await abe.keygen(msk, ["role:sales"]);

            // A stack that holds the scope's attribute key: it publishes the scope
            // doc, then writes a labeled, encrypted document under it.
            const author = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: hrKey },
            });
            await author.db.bulkDocs([scopeDoc]);
            await author.unlockScopes(hrKey);
            const salary = await Class.create(author, "Salary", "class", "HR", {
                who: { name: "who", type: "string", config: { mandatory: true, primaryKey: true } },
                amount: { name: "amount", type: "string", config: { mandatory: true, encrypted: true } },
            });
            await salary.addCard({ who: "alice", amount: "100000", "~scope": "hr" });
            author.close();

            // A device whose key satisfies the policy: opens the scope, reads it.
            const insider = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: hrKey },
            });
            const insiderRow = (await insider.findDocuments({ "~class": { $eq: "Salary" } })).docs[0];
            const insiderLocked = insider.isScopeLocked("hr");
            insider.close();

            // A device whose key does NOT satisfy it: the scope stays sealed, the
            // encrypted field reads null. Same database, same ciphertext.
            const outsider = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: outsiderKey },
            });
            const outsiderRow = (await outsider.findDocuments({ "~class": { $eq: "Salary" } })).docs[0];
            const outsiderLocked = outsider.isScopeLocked("hr");
            outsider.close();
            await outsider.db.destroy();

            return {
                insiderAmount: insiderRow?.amount,
                insiderWho: insiderRow?.who,
                insiderLocked,
                outsiderAmount: outsiderRow?.amount,
                outsiderWho: outsiderRow?.who,
                outsiderLocked,
            };
        });

        // The insider opened the scope and read the sealed field.
        expect(result.insiderLocked).toBe(false);
        expect(result.insiderAmount).toBe("100000");
        // The outsider replicated the same document but the math denies the CEK:
        // the field seals to null, the non-encrypted key stays readable.
        expect(result.outsiderLocked).toBe(true);
        expect(result.outsiderAmount).toBe(null);
        expect(result.outsiderWho).toBe("alice");
    });

    it("writing into a sealed scope refuses, and relabeling to a foreign scope refuses", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const abe = (window as any).docstackAbe;
            const name = `scopes-refuse-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            const { pk, msk } = await abe.setup();
            const hrScope = await ClientStack.buildAccessScope({ scopeId: "hr", policyString: '"role:hr"', pk });
            const finScope = await ClientStack.buildAccessScope({ scopeId: "fin", policyString: '"role:fin"', pk });
            const hrKey = await abe.keygen(msk, ["role:hr"]);
            const finKey = await abe.keygen(msk, ["role:fin"]);

            // The author holds only the HR key: fin is declared but sealed here.
            const author = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: hrKey },
            });
            await author.db.bulkDocs([hrScope, finScope]);
            await author.unlockScopes(hrKey);
            const secret = await Class.create(author, "Secret", "class", "Secrets", {
                tag: { name: "tag", type: "string", config: { mandatory: true, primaryKey: true } },
                body: { name: "body", type: "string", config: { mandatory: true, encrypted: true } },
            });
            const card = await secret.addCard({ tag: "t1", body: "open-sesame", "~scope": "hr" });

            // Writing into the sealed 'fin' scope refuses (no read-write CEK held).
            let sealedWriteRefused = false;
            try {
                await secret.addCard({ tag: "t2", body: "nope", "~scope": "fin" });
            } catch (e: any) {
                sealedWriteRefused = e?.name === "StackLockedError" && e?.scopeId === "fin";
            }
            author.close();

            // The induced-downgrade attack (spec 02 §2.3 rule 2): a device that
            // can WRITE 'fin' but cannot READ 'hr'. It fetches the hr document -
            // whose body stays SEALED because hr is not open for it - and tries to
            // relabel it into fin, carrying hr's ciphertext. The mismatch between
            // the fin label and the hr kid is refused, never re-sealed under fin.
            const attacker = await ClientStack.create(conn, {
                name, documentKey: KEY, credentials, accessKeys: { attributeKey: finKey },
            });
            const attackerHrLocked = attacker.isScopeLocked("hr");
            const attackerFinOpen = !attacker.isScopeLocked("fin");
            const stored: any = await attacker.db.get(card._id); // body still sealed (hr kid)
            let mismatchRefused = false;
            try {
                await attacker.db.put({ ...stored, "~scope": "fin" });
            } catch (e: any) {
                mismatchRefused = e?.name === "StackScopeMismatchError";
            }

            attacker.close();
            await attacker.db.destroy();
            return { sealedWriteRefused, mismatchRefused, attackerHrLocked, attackerFinOpen };
        });

        expect(result.sealedWriteRefused).toBe(true);
        expect(result.attackerHrLocked).toBe(true);
        expect(result.attackerFinOpen).toBe(true);
        expect(result.mismatchRefused).toBe(true);
    });

    it("normalizes policies: a long AND-chain balances so the scheme accepts it, and negation refuses", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const abe = (window as any).docstackAbe;
            // Four-deep AND-chain, unparenthesized: rabe's raw converter panics
            // on this, the normalizer must balance it.
            const normalized = abe.normalizePolicy('"a" and "b" and "c" and "d"');

            const { pk, msk } = await abe.setup();
            const cek = new Uint8Array(32).map((_: number, i: number) => i);
            const wrapped = await abe.wrapCek(pk, '"a" and "b" and "c" and "d"', cek);
            const full = await abe.keygen(msk, ["a", "b", "c", "d"]);
            const partial = await abe.keygen(msk, ["a", "b"]);
            const opened = await abe.decryptCek(full, wrapped);
            const denied = await abe.decryptCek(partial, wrapped);

            let negationRefused = false;
            try { abe.normalizePolicy('not "a"'); } catch { negationRefused = true; }

            return {
                normalized,
                openedLen: opened ? opened.length : -1,
                deniedIsNull: denied === null,
                negationRefused,
            };
        });

        // Balanced binary tree, every operator parenthesized.
        expect(result.normalized).toBe('(("a" and "b") and ("c" and "d"))');
        expect(result.openedLen).toBe(32);
        expect(result.deniedIsNull).toBe(true);
        expect(result.negationRefused).toBe(true);
    });
});
