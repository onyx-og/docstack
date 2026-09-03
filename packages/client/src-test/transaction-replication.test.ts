import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Transactions and replication - ADR-0039.
 *
 * Replication reads through the pristine handle and never sees a stage: staged
 * documents cannot leak to a remote, and a revision replicated in underneath a
 * staged document surfaces as a clean commit conflict, not a silent overwrite.
 */
describe("transactions and replication", () => {
    it("staged documents never replicate; committed ones do", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-repl-out",
            username: "txr-user1",
            password: "txr-pass1",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "ReplTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                await taskClass.addCard({ title: "committed" });

                const t = stack.beginTransaction();
                const draft = await t.createDoc(null, "ReplTask", { title: "staged" });

                const remote = new (window as any).PouchDB(`tx-remote-${Date.now()}`);
                const push = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await push.waitForConvergence();
                const preCommit = await remote.allDocs();
                const preCommitIds = preCommit.rows.map((row: any) => row.id);

                await t.commit();
                const pushAgain = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await pushAgain.waitForConvergence();
                const postCommit = await remote.allDocs();
                const postCommitIds = postCommit.rows.map((row: any) => row.id);

                await remote.destroy();
                return {
                    stagedLeaked: preCommitIds.includes(draft._id),
                    committedArrived: preCommitIds.some((id: string) => id.startsWith("ReplTask-") && id !== draft._id),
                    stagedArrivedAfterCommit: postCommitIds.includes(draft._id),
                };
            },
        });

        expect(result.stagedLeaked).toBe(false);
        expect(result.committedArrived).toBe(true);
        expect(result.stagedArrivedAfterCommit).toBe(true);
    });

    it("a revision replicated in underneath a staged document refuses the commit", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-repl-in",
            username: "txr-user2",
            password: "txr-pass2",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "InboundTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: {} },
                });
                const card = await taskClass.addCard({ title: "shared", notes: "v1" });

                // A remote holding a newer revision of the same document.
                const remote = new (window as any).PouchDB(`tx-remote-in-${Date.now()}`);
                const seed = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await seed.waitForConvergence();
                const remoteDoc = await remote.get(card._id);
                await remote.put({ ...remoteDoc, notes: "from the other device" });

                const t = stack.beginTransaction();
                await t.db.put({ ...(await t.db.get(card._id)), notes: "from this transaction" } as any);

                const pull = await stack.sync({ remote: () => remote, direction: "pull", live: false });
                await pull.waitForConvergence();

                let refusal: string | null = null;
                try {
                    await t.commit();
                } catch (error: any) {
                    refusal = error?.name;
                }
                const stored: any = await stack.db.get(card._id);

                await remote.destroy();
                return { refusal, status: t.status, notes: stored.notes };
            },
        });

        expect(result.refusal).toBe("TransactionConflictError");
        expect(result.status).toBe("open");
        // The replicated revision stands; the transaction overwrote nothing.
        expect(result.notes).toBe("from the other device");
    });
});
