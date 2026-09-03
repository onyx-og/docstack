import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The transaction-scoped read overlay - ADR-0039.
 *
 * Reads through a handle see its staged writes overlaid on committed state; plain
 * stack reads, other handles, and live subscriptions see committed state only. The
 * database's indexes can never see a staged document, so merged queries compute
 * sort, window and projection after the union - these tests pin that the answers
 * come out as if the stage were already written.
 */
describe("transaction overlay", () => {
    it("staged state is visible through the handle and invisible everywhere else", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-visibility",
            username: "txo-user1",
            password: "txo-pass1",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "ViewTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    state: { name: "state", type: "string", config: {} },
                });
                const committed = await taskClass.addCard({ title: "committed", state: "old" });
                const doomed = await taskClass.addCard({ title: "doomed", state: "old" });

                const t = stack.beginTransaction();
                const other = stack.beginTransaction();

                await t.createDoc(null, "ViewTask", { title: "drafted" });
                await t.db.put({ ...(await t.db.get(committed._id)), state: "updated" } as any);
                await t.deleteDocument(doomed._id);

                const throughHandle = await t.findDocuments({ "~class": { $eq: "ViewTask" } });
                const throughStack = await stack.findDocuments({ "~class": { $eq: "ViewTask" } });
                const throughOther = await other.findDocuments({ "~class": { $eq: "ViewTask" } });
                const pointRead: any = await t.db.get(committed._id);
                const stackPoint: any = await stack.db.get(committed._id);
                const deletedThroughHandle = await t.findDocuments({ "~class": { $eq: "ViewTask" }, title: { $eq: "doomed" } });

                return {
                    handleTitles: throughHandle.docs.map((d: any) => `${d.title}:${d.state ?? ""}`).sort(),
                    stackTitles: throughStack.docs.map((d: any) => `${d.title}:${d.state ?? ""}`).sort(),
                    otherTitles: throughOther.docs.map((d: any) => d.title).sort(),
                    pointState: pointRead.state,
                    pointRev: pointRead._rev === stackPoint._rev,
                    stackState: stackPoint.state,
                    deletedVisible: deletedThroughHandle.docs.length,
                };
            },
        });

        // The handle's world: draft present, update applied, soft-delete gone.
        expect(result.handleTitles).toEqual(["committed:updated", "drafted:"]);
        // Everyone else's world: exactly the committed state.
        expect(result.stackTitles).toEqual(["committed:old", "doomed:old"]);
        expect(result.otherTitles).toEqual(["committed", "doomed"]);
        // A staged update reads back with the base revision - the one commit will replace.
        expect(result.pointState).toBe("updated");
        expect(result.pointRev).toBe(true);
        expect(result.stackState).toBe("old");
        expect(result.deletedVisible).toBe(0);
    });

    it("merged queries sort, window and project as if the stage were written", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-window",
            username: "txo-user2",
            password: "txo-pass2",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "WindowTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    rank: { name: "rank", type: "integer", config: {} },
                });
                for (const [title, rank] of [["b", 2], ["d", 4], ["f", 6]] as [string, number][]) {
                    await taskClass.addCard({ title, rank });
                }

                const t = stack.beginTransaction();
                await t.createDoc(null, "WindowTask", { title: "a", rank: 1 });
                await t.createDoc(null, "WindowTask", { title: "c", rank: 3 });
                await t.createDoc(null, "WindowTask", { title: "e", rank: 5 });

                // skip 1 / limit 3 over the merged, sorted set: b, c, d out of a..f.
                const windowed = await t.findDocuments(
                    { "~class": { $eq: "WindowTask" } },
                    undefined, 1, 3, [{ title: "asc" }] as any
                );

                // Projection applies after the merge; sort fields do not leak in.
                const projected = await t.findDocuments(
                    { "~class": { $eq: "WindowTask" }, rank: { $gte: 3 } },
                    ["title"], undefined, undefined, [{ rank: "desc" }] as any
                );

                // A class the stage never touched takes the untouched fast path.
                await Class.create(stack, "ColdClass", "class", "Cold", {
                    label: { name: "label", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const cold = await t.findDocuments({ "~class": { $eq: "ColdClass" } });

                return {
                    windowTitles: windowed.docs.map((d: any) => d.title),
                    projectedTitles: projected.docs.map((d: any) => d.title),
                    projectedKeys: [...new Set(projected.docs.flatMap((d: any) => Object.keys(d)))],
                    coldCount: cold.docs.length,
                };
            },
        });

        expect(result.windowTitles).toEqual(["b", "c", "d"]);
        expect(result.projectedTitles).toEqual(["f", "e", "d", "c"]);
        expect(result.projectedKeys).toEqual(["title"]);
        expect(result.coldCount).toBe(0);
    });

    it("SQL through the handle sees the transaction's view; plain SQL does not", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-sql",
            username: "txo-user3",
            password: "txo-pass3",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                await Class.create(stack, "SqlUser", "class", "Users", {
                    handle: { name: "handle", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const taskClass = await Class.create(stack, "SqlTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    assigneeId: { name: "assigneeId", type: "string", config: {} },
                    priority: { name: "priority", type: "integer", config: {} },
                });
                const userClass = await stack.getClass("SqlUser");
                const ada = await userClass.addCard({ handle: "ada" });
                await taskClass.addCard({ title: "committed-task", assigneeId: ada._id, priority: 2 });

                const t = stack.beginTransaction();
                await t.createDoc(null, "SqlTask", { title: "staged-task", assigneeId: ada._id, priority: 1 });

                const throughHandle = await t.query(
                    "SELECT t.title, u.handle FROM SqlTask AS t JOIN SqlUser AS u ON u._id = t.assigneeId ORDER BY t.priority ASC"
                );
                const throughStack = await stack.query("SELECT title FROM SqlTask");
                const filtered = await t.query("SELECT t.title FROM SqlTask AS t WHERE t.priority < ? ORDER BY t.title ASC", 2);

                return {
                    joined: throughHandle.rows.map((row: any) => `${row.title}@${row.handle}`),
                    plain: throughStack.rows.map((row: any) => row.title),
                    filtered: filtered.rows.map((row: any) => row.title),
                };
            },
        });

        // The staged task joins against a committed user, ordered across the merge.
        expect(result.joined).toEqual(["staged-task@ada", "committed-task@ada"]);
        expect(result.plain).toEqual(["committed-task"]);
        expect(result.filtered).toEqual(["staged-task"]);
    });

    it("no doc events fire for staged writes; commit produces the real ones", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "tx-events",
            username: "txo-user4",
            password: "txo-pass4",
            transactions: true,
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "EventTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const seen: string[] = [];
                const handler = (e: Event) => {
                    const doc = (e as CustomEvent).detail?.doc;
                    if (doc?.title) seen.push(doc.title);
                };
                taskClass.addEventListener("doc", handler as EventListener);

                const t = stack.beginTransaction();
                await t.createDoc(null, "EventTask", { title: "staged-quietly" });

                // A grace window: a staged write must produce silence.
                await new Promise(resolve => setTimeout(resolve, 700));
                const duringStage = [...seen];

                await t.commit();
                // The commit's write flows through the adapter's changes feed.
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("no event after commit")), 8000);
                    const check = () => {
                        if (seen.length > 0) { clearTimeout(timeout); resolve(); }
                        else setTimeout(check, 100);
                    };
                    check();
                });
                taskClass.removeEventListener("doc", handler as EventListener);

                return { duringStage, afterCommit: seen };
            },
        });

        expect(result.duringStage).toEqual([]);
        expect(result.afterCommit).toEqual(["staged-quietly"]);
    });
});
