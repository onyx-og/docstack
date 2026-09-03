import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Named write transactions - ADR-0039.
 *
 * The stage lives above the plugin: writes through a handle validate at the call site
 * and stage in memory, nothing reaches the database until commit, and commit is one
 * `bulkDocs` through the full authoring pipeline. A refused commit persists nothing
 * and leaves the transaction open.
 */
describe("transactions", () => {
    it("the config flag gates the capability", async ({ useDocStack }) => {
        const withoutFlag = await useDocStack({
            name: "tx-gate-off",
            evaluate: async ({ stack }) => {
                try {
                    stack.beginTransaction();
                    return { threw: false };
                } catch (error: any) {
                    return { threw: true, name: error?.name, message: error?.message };
                }
            },
        });
        expect(withoutFlag.threw).toBe(true);
        expect(withoutFlag.name).toBe("TransactionsDisabledError");
        expect(withoutFlag.message).toContain("transactions: true");

        const withFlag = await useDocStack({
            name: "tx-gate-on",
            transactions: true,
            evaluate: async ({ stack }) => {
                const t = stack.beginTransaction();
                return { status: t.status, id: t.id, open: stack.transactionEngine.openCount() };
            },
        });
        expect(withFlag.status).toBe("open");
        expect(withFlag.id).toMatch(/^tx-/);
        expect(withFlag.open).toBe(1);
    });

    it("staging validates at the call site, and a failing batch stages nothing", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-sweep",
            username: "tx-user1",
            password: "tx-pass1",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await Class.create(stack, "SweepTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: {} },
                });

                const t = stack.beginTransaction();

                // A single invalid write refuses and stages nothing.
                let single: string | null = null;
                try {
                    await t.createDoc(null, "SweepTask", { notes: "no title" });
                } catch (error: any) {
                    single = error?.name;
                }
                const afterSingle = t.stagedCount();

                // A batch with one invalid document unwinds entirely.
                let batch: string | null = null;
                try {
                    await t.db.bulkDocs([
                        { _id: "SweepTask-a", "~class": "SweepTask", title: "a", active: true },
                        { _id: "SweepTask-b", "~class": "SweepTask", active: true }, // no title
                        { _id: "SweepTask-c", "~class": "SweepTask", title: "c", active: true },
                    ] as any);
                } catch (error: any) {
                    batch = error?.name;
                }
                const afterBatch = t.stagedCount();

                const stored = await stack.findDocuments({ "~class": { $eq: "SweepTask" } });
                return { single, afterSingle, batch, afterBatch, storedCount: stored.docs.length };
            },
        });

        expect(result.single).toBe("TransactionValidationError");
        expect(result.afterSingle).toBe(0);
        expect(result.batch).toBe("TransactionValidationError");
        expect(result.afterBatch).toBe(0);
        expect(result.storedCount).toBe(0);
    });

    it("nothing persists until commit, and commit lands the journal as one batch", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-commit",
            username: "tx-user2",
            password: "tx-pass2",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "CommitTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const counterBefore = (await stack.db.get("lastDocId") as any).value;

                const t = stack.beginTransaction();
                const first = await t.createDoc(null, "CommitTask", { title: "one" });
                await t.createDoc(null, "CommitTask", { title: "two" });
                await t.createDoc(null, "CommitTask", { title: "three" });

                const visibleMid = await stack.findDocuments({ "~class": { $eq: "CommitTask" } });
                const directMid = await stack.db.get(first._id).catch((error: any) => error?.name);

                const report = await stack.commit(t);

                const visibleAfter = await stack.findDocuments({ "~class": { $eq: "CommitTask" } });
                const counterAfter = (await stack.db.get("lastDocId") as any).value;

                return {
                    stagedMid: t.stagedCount(),
                    visibleMid: visibleMid.docs.length,
                    directMid,
                    status: t.status,
                    written: report.written.length,
                    failed: report.failed.length,
                    stagedCount: report.stagedCount,
                    duration: typeof report.durationMs,
                    adapterName: report.adapter.name,
                    atomicBatch: report.adapter.atomicBatch,
                    visibleAfter: visibleAfter.docs.length,
                    counterAdvance: counterAfter - counterBefore,
                };
            },
        });

        expect(result.visibleMid).toBe(0);
        expect(result.directMid).toBe("not_found");
        expect(result.status).toBe("committed");
        expect(result.written).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.stagedCount).toBe(3);
        expect(result.duration).toBe("number");

        // The browser adapter's honest answer: one bulkDocs, per-document results.
        expect(result.adapterName).toBe("idb");
        expect(result.atomicBatch).toBe(false);

        expect(result.visibleAfter).toBe(3);
        // The counter advances once, by the number of minted ids that landed.
        expect(result.counterAdvance).toBe(3);
    });

    it("a direct write underneath a staged document makes commit refuse cleanly", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-conflict",
            username: "tx-user3",
            password: "tx-pass3",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "RaceTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: {} },
                });
                const card = await taskClass.addCard({ title: "contested" });

                const t = stack.beginTransaction();
                await t.db.put({ ...(await t.db.get(card._id)), notes: "from transaction" } as any);

                // Mixed modes in parallel: the direct write lands immediately.
                await stack.db.put({ ...(await stack.db.get(card._id)), notes: "from direct write" } as any);

                let refusal: any = null;
                try {
                    await t.commit();
                } catch (error: any) {
                    refusal = { name: error?.name, conflictId: error?.conflicts?.[0]?.id };
                }

                const stored: any = await stack.db.get(card._id);
                return { refusal, status: t.status, notes: stored.notes, staged: t.stagedCount() };
            },
        });

        expect(result.refusal?.name).toBe("TransactionConflictError");
        expect(result.refusal?.conflictId).toBeTruthy();
        // Nothing persisted from the transaction; the direct write survives.
        expect(result.notes).toBe("from direct write");
        // The transaction stays open, journal intact, for re-staging or discard.
        expect(result.status).toBe("open");
        expect(result.staged).toBe(1);
    });

    it("class models, patches and _local documents are refused at stage time", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-unsupported",
            username: "tx-user4",
            password: "tx-pass4",
            transactions: true,
            evaluate: async ({ stack }) => {
                const t = stack.beginTransaction();
                const attempt = async (doc: any) => {
                    try {
                        await t.db.put(doc);
                        return "staged";
                    } catch (error: any) {
                        return error?.name;
                    }
                };
                return {
                    classModel: await attempt({ _id: "Rogue", "~class": "class", name: "Rogue", schema: {}, active: true }),
                    patch: await attempt({ _id: "~p1", "~class": "patch", version: "1.0.0", target: "app", docs: [] }),
                    local: await attempt({ _id: "_local/device-state", value: 1 }),
                    staged: t.stagedCount(),
                };
            },
        });

        expect(result.classModel).toBe("TransactionUnsupportedDocError");
        expect(result.patch).toBe("TransactionUnsupportedDocError");
        expect(result.local).toBe("TransactionUnsupportedDocError");
        expect(result.staged).toBe(0);
    });

    it("state machine: terminal handles refuse work, discard is idempotent", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-states",
            username: "tx-user5",
            password: "tx-pass5",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await Class.create(stack, "StateTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const t = stack.beginTransaction();
                await t.createDoc(null, "StateTask", { title: "doomed" });
                stack.discardTransaction(t);
                const statusAfterDiscard = t.status;
                stack.discardTransaction(t); // idempotent

                const readAfter = await t.db.get("anything").catch((error: any) => error?.name);
                const commitAfter = await stack.commit(t).catch((error: any) => error?.name);

                const t2 = stack.beginTransaction();
                await t2.createDoc(null, "StateTask", { title: "kept" });
                await t2.commit();
                const doubleCommit = await t2.commit().catch((error: any) => error?.name);

                const stored = await stack.findDocuments({ "~class": { $eq: "StateTask" } });
                return {
                    statusAfterDiscard,
                    readAfter,
                    commitAfter,
                    doubleCommit,
                    titles: stored.docs.map((d: any) => d.title),
                };
            },
        });

        expect(result.statusAfterDiscard).toBe("discarded");
        expect(result.readAfter).toBe("TransactionStateError");
        expect(result.commitAfter).toBe("TransactionStateError");
        expect(result.doubleCommit).toBe("TransactionStateError");
        // The discarded write never landed; the committed one did.
        expect(result.titles).toEqual(["kept"]);
    });

    it("a relation and its endpoint staged together commit in one batch", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-relations",
            username: "tx-user6",
            password: "tx-pass6",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;
                const personClass = await Class.create(stack, "TxPerson", "class", "People", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const projectClass = await Class.create(stack, "TxProject", "class", "Projects", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const domain = await Domain.create(
                    stack, null, "TxWorksOn", "domain", "1:N",
                    personClass, projectClass, "who works on what"
                );
                const person = await personClass.addCard({ name: "ada" });

                const t = stack.beginTransaction();
                // Endpoint and relation in one call, relation listed FIRST - staging
                // orders documents before relations, so order in the array is free.
                await t.db.bulkDocs([
                    {
                        _id: "TxWorksOn-r1", "~domain": "TxWorksOn", name: "r1",
                        sourceId: person._id, targetId: "TxProject-staged",
                        sourceClass: personClass.getId(), targetClass: projectClass.getId(),
                        active: true,
                    },
                    { _id: "TxProject-staged", "~class": "TxProject", title: "new engine", active: true },
                ] as any);

                const report = await t.commit();

                const relation: any = await stack.db.get("TxWorksOn-r1").catch(() => null);
                const endpoint: any = await stack.db.get("TxProject-staged").catch(() => null);
                return {
                    written: report.written.length,
                    failed: report.failed.length,
                    relationLanded: relation?.targetId,
                    endpointLanded: endpoint?.title,
                };
            },
        });

        expect(result.failed).toBe(0);
        expect(result.written).toBe(2);
        expect(result.relationLanded).toBe("TxProject-staged");
        expect(result.endpointLanded).toBe("new engine");
    });
});
