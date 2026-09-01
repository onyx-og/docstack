import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0020.
 *
 * `StackPlugin` decrypts in its `bulkGet` wrapper, which is what makes `getCards` and
 * `findDocuments` transparent. The changes feed does not go through it: `include_docs`
 * returns exactly what is stored, so a live listener received the raw `EncryptedPayload`
 * while every other read path returned plaintext. A React consumer renders the first
 * paint correctly (it came from `getCards`) and then throws on the first update.
 */
describe("class change events", () => {
    it("ADR-0020: a change event carries plaintext, not the encrypted payload", async ({ useDocStack }) => {
        const detail = await useDocStack({
            name: "change-plaintext",
            username: "change-user",
            password: "change-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const secretClass = await Class.create(stack, "ChangeSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                // `since: 'now'` — the listener only sees what happens after this point.
                const event = new Promise<any>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Listener timeout")), 8000);
                    const handler = (e: Event) => {
                        clearTimeout(timeout);
                        secretClass.removeEventListener("doc", handler as EventListener);
                        resolve((e as CustomEvent).detail);
                    };
                    secretClass.addEventListener("doc", handler as EventListener);
                });

                await secretClass.addCard({ title: "visible", secret: "classified" });
                const received = await event;

                return {
                    secret: received?.doc?.secret,
                    title: received?.doc?.title,
                    // Carried so a consumer can discard an out-of-order update.
                    hasSeq: received?.seq !== undefined,
                };
            },
        });

        // The whole finding in one line: this is an EncryptedPayload object today.
        expect(detail.secret).toBe("classified");
        expect(detail.title).toBe("visible");
        expect(detail.hasSeq).toBe(true);
    });

    it("ADR-0020: an unopenable value is nulled rather than emitted as ciphertext", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "change-locked",
            username: "change-user2",
            password: "change-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const secretClass = await Class.create(stack, "LockedChangeSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });
                await secretClass.addCard({ title: "visible", secret: "classified" });

                // Driven directly rather than through the feed: a locked stack refuses to
                // write a class carrying encrypted attributes (ADR-0018), so there is no
                // way to *produce* a change event while locked. This exercises the same
                // preparation the listener performs.
                // As stored, through the replication handle: `db.get` decrypts since
                // ADR-0032, so it can no longer show the at-rest ciphertext shape.
                const stored = await stack.getReplicationHandle().get(
                    (await stack.findDocuments({ "~class": { $eq: "LockedChangeSecret" } })).docs[0]._id
                ) as any;
                const wasEncryptedAtRest = stored.secret?.__enc === true;

                stack.clearAuthSession();

                const prepared = await stack.prepareChangeDocument(stored, secretClass);

                return {
                    wasEncryptedAtRest,
                    locked: stack.isLocked(),
                    secret: prepared?.secret ?? null,
                    stillCiphertext: prepared?.secret?.__enc === true,
                    title: prepared?.title,
                };
            },
        });

        // Precondition: it really is ciphertext on disk.
        expect(result.wasEncryptedAtRest).toBe(true);
        expect(result.locked).toBe(true);

        // Matches what a locked *read* does, so reads and change events agree.
        expect(result.secret).toBeNull();
        expect(result.stillCiphertext).toBe(false);
        // The event is not dropped, and unencrypted fields still arrive.
        expect(result.title).toBe("visible");
    });
});
