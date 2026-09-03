import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Transactions and encryption - ADR-0039 with ADR-0018/0020/0032.
 *
 * The stage holds authored plaintext; encryption runs once, at commit, inside the
 * unchanged pipeline. A locked stack refuses to *stage* an encrypting write - the
 * same refusal it makes for a direct one - because a stage that could not commit
 * without landing plaintext is a trap, not a buffer.
 */
describe("transactions and encryption", () => {
    it("stages plaintext, encrypts at commit, decrypts on read", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-crypto",
            username: "txc-user1",
            password: "txc-pass1",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await Class.create(stack, "TxSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                const t = stack.beginTransaction();
                const draft = await t.createDoc(null, "TxSecret", { title: "one", secret: "classified" });

                // Overlay reads serve the authored plaintext - no crypto work pre-commit.
                const overlaid: any = await t.db.get(draft._id);

                await t.commit();

                // As stored: ciphertext, via the replication handle (ADR-0032).
                const raw: any = await stack.getReplicationHandle().get(draft._id);
                // As read: plaintext, through the ordinary decrypting path.
                const read: any = await stack.getDocument(draft._id);

                return {
                    overlaidSecret: overlaid.secret,
                    atRestEncrypted: raw.secret?.__enc === true,
                    readSecret: read.secret,
                };
            },
        });

        expect(result.overlaidSecret).toBe("classified");
        expect(result.atRestEncrypted).toBe(true);
        expect(result.readSecret).toBe("classified");
    });

    it("a locked stack refuses to stage encrypting writes, and re-authenticating lets commit through", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-locked",
            username: "txc-user2",
            password: "txc-pass2",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await Class.create(stack, "TxLockedSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });

                const t = stack.beginTransaction();
                // Staged while unlocked: fine.
                await t.createDoc(null, "TxLockedSecret", { title: "early", secret: "s1" });

                stack.clearAuthSession(); // locks the stack - the key goes with the session

                // Staging while locked: refused at the call site.
                let stagedLocked: string | null = null;
                try {
                    await t.createDoc(null, "TxLockedSecret", { title: "late", secret: "s2" });
                } catch (error: any) {
                    stagedLocked = error?.name;
                }

                // Committing while locked: the commit-time sweep refuses; nothing lands.
                let committedLocked: string | null = null;
                try {
                    await t.commit();
                } catch (error: any) {
                    committedLocked = error?.name;
                }
                const statusWhileLocked = t.status;

                await stack.authenticate({ username: "txc-user2", password: "txc-pass2" });
                const report = await t.commit();
                const stored = await stack.findDocuments({ "~class": { $eq: "TxLockedSecret" } });

                return {
                    stagedLocked,
                    committedLocked,
                    statusWhileLocked,
                    written: report.written.length,
                    titles: stored.docs.map((d: any) => d.title),
                };
            },
        });

        expect(result.stagedLocked).toBe("StackLockedError");
        expect(result.committedLocked).toBe("StackLockedError");
        // The refused commit persisted nothing and left the journal intact...
        expect(result.statusWhileLocked).toBe("open");
        // ...so the unlocked commit lands exactly the one staged document.
        expect(result.written).toBe(1);
        expect(result.titles).toEqual(["early"]);
    });
});
