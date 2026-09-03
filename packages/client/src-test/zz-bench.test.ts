import { test as it, expect } from './fixtures';

it.setTimeout(300000);

// Performance micro-benchmark. Skipped in normal suite runs; run with:
//   BENCH=1 npx playwright test zz-bench --reporter=list
// Reports timings (ms) and db.find call counts for the hot paths.
it.skip(!process.env.BENCH, "benchmark only - run with BENCH=1");
it("benchmarks core read/write/query paths", async ({ useDocStack }) => {
    const results = await useDocStack({
        name: `bench-${Date.now()}`,
        username: "bench-user",
        password: "bench-pass",
        evaluate: async ({ stack }) => {
            const { Class } = (window as any).docstack;
            const res: any = {};
            const now = () => performance.now();

            // Instrument db.find to count backend scans
            let findCalls = 0;
            const origFind = (stack as any).db.find.bind((stack as any).db);
            (stack as any).db.find = (...a: any[]) => { findCalls++; return origFind(...a); };
            const countFinds = async (fn: () => Promise<any>) => {
                const before = findCalls;
                const t0 = now();
                const out = await fn();
                return { ms: +(now() - t0).toFixed(1), finds: findCalls - before, out };
            };

            const N = 100;
            const CATS = ["alpha", "beta", "gamma", "delta"];

            // --- 1. Class creation ---
            let t0 = now();
            const itemClass = await Class.create(stack, "BenchItem", "class", "bench items", {
                name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true, maxLength: 200 } },
                category: { name: "category", type: "string", config: { maxLength: 50 } },
                value: { name: "value", type: "integer", config: { min: 0 } },
                secret: { name: "secret", type: "string", config: { encrypted: true, maxLength: 200 } },
            });
            res.classCreateMs = +(now() - t0).toFixed(1);

            const plainClass = await Class.create(stack, "BenchPlain", "class", "bench plain", {
                name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true, maxLength: 200 } },
                category: { name: "category", type: "string", config: { maxLength: 50 } },
                value: { name: "value", type: "integer", config: { min: 0 } },
            });

            // --- 2. Write throughput (addCard, encrypted class) ---
            let r = await countFinds(async () => {
                for (let i = 0; i < N; i++) {
                    await itemClass.addCard({
                        name: `item-${i}`,
                        category: CATS[i % CATS.length],
                        value: i,
                        secret: `secret-${i}`,
                    });
                }
            });
            res.addCardEncrypted = { totalMs: r.ms, perDocMs: +(r.ms / N).toFixed(1), findCalls: r.finds };

            // --- 2b. Write throughput (plain class) ---
            r = await countFinds(async () => {
                for (let i = 0; i < N; i++) {
                    await plainClass.addCard({ name: `plain-${i}`, category: CATS[i % CATS.length], value: i });
                }
            });
            res.addCardPlain = { totalMs: r.ms, perDocMs: +(r.ms / N).toFixed(1), findCalls: r.finds };

            // --- 3. findDocuments full class read (encrypted) ---
            // warmup
            await stack.findDocuments({ "~class": { $eq: "BenchItem" } });
            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchItem" } }));
            res.findDocsEncrypted = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            // --- 3b. findDocuments full class read (plain) ---
            await stack.findDocuments({ "~class": { $eq: "BenchPlain" } });
            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchPlain" } }));
            res.findDocsPlain = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            // --- 3c. findDocuments with explicit high limit (full read, no truncation) ---
            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchPlain" } }, undefined, undefined, 1000));
            res.findDocsPlainLimit1000 = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            // --- 3d. single-doc read cost ---
            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchPlain" }, name: { $eq: "plain-1" } }, undefined, undefined, 1));
            res.findDocsSingle = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            // --- 4. Filtered read ---
            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchPlain" }, category: { $eq: "alpha" }, value: { $gt: 10 } }));
            res.findDocsFiltered = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            // --- 4b. getCards with selector ---
            r = await countFinds(() => plainClass.getCards({ category: { $eq: "beta" } }));
            res.getCardsFiltered = { ms: r.ms, finds: r.finds, docs: r.out.length };

            // --- 5. Class fetching ---
            r = await countFinds(() => stack.getClass("BenchPlain", true)); // cold (bypass cache)
            res.getClassCold = { ms: r.ms, finds: r.finds };
            r = await countFinds(() => stack.getClass("BenchPlain")); // warm (cache)
            res.getClassWarm = { ms: r.ms, finds: r.finds };
            r = await countFinds(() => stack.getClassModel("BenchPlain"));
            res.getClassModel = { ms: r.ms, finds: r.finds };
            r = await countFinds(() => stack.getClassSnapshot("BenchPlain"));
            res.getClassSnapshot = { ms: r.ms, finds: r.finds };

            // --- 6. SQL query engine ---
            r = await countFinds(() => stack.query("SELECT b.name, b.value FROM BenchPlain AS b WHERE b.value >= 50;"));
            res.sqlWhere = { ms: r.ms, finds: r.finds, rows: r.out.rows ? r.out.rows.length : (r.out.length ?? -1) };

            r = await countFinds(() => stack.query("SELECT b.category, COUNT(*) AS c, SUM(b.value) AS s FROM BenchPlain AS b GROUP BY b.category;"));
            res.sqlGroupBy = { ms: r.ms, finds: r.finds };

            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5;"));
            res.sqlOrderLimit = { ms: r.ms, finds: r.finds };

            // --- 6b. Batch write path (addCards) ---
            r = await countFinds(() => plainClass.addCards(
                Array.from({ length: 100 }, (_, i) => ({ name: `bulk-${i}`, category: CATS[i % CATS.length], value: 1000 + i }))
            ));
            res.addCardsBatch100 = {
                totalMs: r.ms,
                perDocMs: +(r.ms / 100).toFixed(1),
                findCalls: r.finds,
                created: r.out.length,
                uniqueIds: new Set(r.out.map((d: any) => d._id)).size,
            };

            // --- 6c. Query pushdown: string literal, ? params, range, LIMIT ---
            r = await countFinds(() => stack.query("SELECT b.name, b.value FROM BenchPlain AS b WHERE b.name = 'plain-1';"));
            res.sqlStringLiteral = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b WHERE b.category = ? AND b.value >= ?;", "alpha", 10));
            res.sqlPlaceholders = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            r = await countFinds(() => stack.query("SELECT b.name, b.value FROM BenchPlain AS b WHERE b.value >= 20 AND b.value <= 40;"));
            res.sqlRangeSameColumn = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b LIMIT 5;"));
            res.sqlLimitPushdown = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            // --- diagnostic: what does the class actually contain post-batch? ---
            {
                const allPlain = await plainClass.getCards();
                const byName: any = {};
                for (const d of allPlain) byName[d.name] = (byName[d.name] || 0) + 1;
                const dups = Object.entries(byName).filter(([, c]: any) => c > 1).slice(0, 5);
                const inRange = allPlain.filter((d: any) => d.value >= 20 && d.value <= 40);
                res.diag = {
                    totalPlain: allPlain.length,
                    dupNames: dups,
                    inRangeCount: inRange.length,
                };
            }

            // --- 6d. Equi-joins (previously only the IN-array pattern matched) ---
            const orderClass = await Class.create(stack, "BenchOrder", "class", "bench orders", {
                buyer: { name: "buyer", type: "string", config: { maxLength: 200 } },
                amount: { name: "amount", type: "integer", config: { min: 0 } },
            });
            await orderClass.addCards(Array.from({ length: 20 }, (_, i) => ({
                buyer: `plain-${i % 10}`, amount: i,
            })));

            r = await countFinds(() => stack.query("SELECT o.amount, b.value FROM BenchOrder AS o JOIN BenchPlain AS b ON b.name = o.buyer;"));
            res.sqlEquiJoinInner = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            r = await countFinds(() => stack.query("SELECT b.name, o.amount FROM BenchPlain AS b LEFT JOIN BenchOrder AS o ON o.buyer = b.name;"));
            res.sqlEquiJoinLeft = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            // probe: what does a raw sorted find return?
            try {
                await (stack as any).ensureSortIndex("value");
                const probe = await (stack as any).db.find({
                    selector: { "~class": { $eq: "BenchPlain" }, active: true, value: { $gte: null } },
                    sort: [{ "~class": "desc" }, { value: "desc" }],
                    limit: 5,
                });
                res.probeSortedFind = { docs: probe.docs.map((d: any) => d.name), warning: probe.warning };
            } catch (e: any) {
                res.probeSortedFind = { error: e.message };
            }

            // --- 6e. ORDER BY + LIMIT pushdown through an on-demand sort index ---
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5;"));
            res.sqlTopK = { ms: r.ms, finds: r.finds, names: r.out.rows.map((x: any) => x.name) };

            // Repeat (index now exists and registry stamp is warm)
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5;"));
            res.sqlTopKWarm = { ms: r.ms, finds: r.finds, names: r.out.rows.map((x: any) => x.name) };

            // Soft-delete the current top row; it must vanish and the limit must refill.
            const bulk99 = (await plainClass.getCards({ name: { $eq: "bulk-99" } }))[0];
            await plainClass.deleteCard(bulk99._id);
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5;"));
            res.sqlTopKAfterDelete = { ms: r.ms, finds: r.finds, names: r.out.rows.map((x: any) => x.name) };

            // --- 6f. Sort-index cleanup round-trip ---
            const sweep = await (stack as any).cleanupSortIndexes({ olderThanMs: 0 });
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5;"));
            res.sortIndexCleanup = { removed: sweep.removed, rowsAfterRecreate: r.out.rows.map((x: any) => x.name) };

            // --- 6g. Projection pushdown on the encrypted class ---
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchItem AS b WHERE b.value >= 90;"));
            res.sqlProjectionEncrypted = {
                ms: r.ms, finds: r.finds, rows: r.out.rows.length,
                rowKeys: r.out.rows.length ? Object.keys(r.out.rows[0]) : [],
            };

            // --- 6h. OFFSET (windowed pagination) ---
            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b ORDER BY b.value DESC LIMIT 5 OFFSET 5;"));
            res.sqlOffsetPage2 = { ms: r.ms, finds: r.finds, names: r.out.rows.map((x: any) => x.name) };

            r = await countFinds(() => stack.query("SELECT b.name FROM BenchPlain AS b LIMIT 10 OFFSET 195;"));
            res.sqlOffsetTail = { ms: r.ms, finds: r.finds, rows: r.out.rows.length };

            // --- 6i. Streaming reads ---
            r = await countFinds(async () => {
                let count = 0;
                for await (const row of (stack as any).queryStream("SELECT b.name, b.value FROM BenchPlain AS b WHERE b.value >= 20;")) {
                    count++;
                }
                return count;
            });
            res.streamFullScan = { ms: r.ms, finds: r.finds, rows: r.out };

            r = await countFinds(async () => {
                const rows: any[] = [];
                for await (const row of (stack as any).queryStream("SELECT b.name FROM BenchPlain AS b WHERE b.value >= 20 LIMIT 7;")) {
                    rows.push(row);
                }
                return rows;
            });
            res.streamEarlyStop = { ms: r.ms, finds: r.finds, rows: r.out.length };

            r = await countFinds(async () => {
                const rows: any[] = [];
                for await (const row of (stack as any).queryStream("SELECT COUNT(*) AS c FROM BenchPlain AS b;")) {
                    rows.push(row);
                }
                return rows;
            });
            res.streamFallbackAgg = { rows: r.out.length, count: r.out[0]?.c };

            // --- 7. Policy overhead: allow-all policy targeting the plain class ---
            const policy = {
                _id: "Policy-BenchPlain-allow",
                "~class": "~Policy",
                rule: "return true;",
                description: "allow all (bench)",
                targetClass: [plainClass.getModel()._id],
            };
            await (stack as any).db.bulkDocs([policy]);

            r = await countFinds(() => stack.findDocuments({ "~class": { $eq: "BenchPlain" } }));
            res.findDocsWithPolicy = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            r = await countFinds(() => stack.query("SELECT b.name, b.value FROM BenchPlain AS b WHERE b.value >= 50;"));
            res.sqlWhereWithPolicy = { ms: r.ms, finds: r.finds };

            // --- 8. total docs in db for context ---
            const all = await (stack as any).db.allDocs();
            res.totalDocsInDb = all.total_rows;

            return res;
        },
    });

    console.log("BENCH RESULTS:\n" + JSON.stringify(results, null, 2));

    // Correctness gates, so a perf regression can't hide behind a semantics one.
    expect(results.findDocsPlain.docs).toBe(100);            // no default-limit truncation
    expect(results.addCardsBatch100.created).toBe(100);
    expect(results.addCardsBatch100.uniqueIds).toBe(100);    // batch ids don't collide
    expect(results.sqlStringLiteral.rows).toBe(1);
    expect(results.sqlPlaceholders.rows).toBe(47);           // 'alpha' & value>=10: 22 originals + 25 bulk
    expect(results.sqlRangeSameColumn.rows).toBe(21);        // both bounds of the range hold
    expect(results.sqlLimitPushdown.rows).toBe(5);
    expect(results.diag.totalPlain).toBe(200);
    expect(results.diag.dupNames).toEqual([]);
    expect(results.sqlEquiJoinInner.rows).toBe(20);          // plain equality joins match
    expect(results.sqlEquiJoinLeft.rows).toBe(210);          // 20 matched + 190 null-filled
    expect(results.sqlTopK.names).toEqual(["bulk-99", "bulk-98", "bulk-97", "bulk-96", "bulk-95"]);
    expect(results.sqlTopKWarm.names).toEqual(["bulk-99", "bulk-98", "bulk-97", "bulk-96", "bulk-95"]);
    expect(results.sqlTopKAfterDelete.names).toEqual(["bulk-98", "bulk-97", "bulk-96", "bulk-95", "bulk-94"]); // soft-deleted row gone, limit refilled
    expect(results.sortIndexCleanup.removed).toContain("value");
    expect(results.sortIndexCleanup.rowsAfterRecreate).toEqual(["bulk-98", "bulk-97", "bulk-96", "bulk-95", "bulk-94"]);
    expect(results.sqlProjectionEncrypted.rows).toBe(10);
    expect(results.sqlProjectionEncrypted.rowKeys).toEqual(["name"]);
    expect(results.sqlOffsetPage2.names).toEqual(["bulk-93", "bulk-92", "bulk-91", "bulk-90", "bulk-89"]); // rows 6-10 of the desc order
    expect(results.sqlOffsetTail.rows).toBe(4);                // 199 active docs, offset 195
    expect(results.streamFullScan.rows).toBe(179);             // plain 20..99 (80) + bulk 0..98 (99)
    expect(results.streamFullScan.finds).toBeLessThanOrEqual(3); // keyset pages, not per-row queries
    expect(results.streamEarlyStop.rows).toBe(7);
    expect(results.streamEarlyStop.finds).toBe(1);             // LIMIT stopped the scan after one page
    expect(results.streamFallbackAgg.rows).toBe(1);
    expect(results.streamFallbackAgg.count).toBe(199);         // aggregation falls back but still streams the API
});

// Transactions (ADR-0039): staging cost, commit cost against the batch-write
// baseline, and the overlay's two prices - the empty-stage fast path (must be
// parity) and the merge path (paid only by queries over a staged class).
it("benchmarks the transaction write and overlay paths", async ({ useDocStack }) => {
    const results = await useDocStack({
        name: `bench-tx-${Date.now()}`,
        username: "bench-tx-user",
        password: "bench-tx-pass",
        transactions: true,
        evaluate: async ({ stack }) => {
            const { Class } = (window as any).docstack;
            const res: any = {};
            const now = () => performance.now();

            let findCalls = 0;
            const origFind = (stack as any).db.find.bind((stack as any).db);
            (stack as any).db.find = (...a: any[]) => { findCalls++; return origFind(...a); };
            const countFinds = async (fn: () => Promise<any>) => {
                const before = findCalls;
                const t0 = now();
                const out = await fn();
                return { ms: +(now() - t0).toFixed(1), finds: findCalls - before, out };
            };

            const N = 100;
            const CATS = ["alpha", "beta", "gamma", "delta"];
            const itemClass = await Class.create(stack, "TxBench", "class", "tx bench", {
                name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true, maxLength: 200 } },
                category: { name: "category", type: "string", config: { maxLength: 50 } },
                value: { name: "value", type: "integer", config: { min: 0 } },
            });

            // --- baseline: the non-transactional batch write, same environment ---
            let r = await countFinds(() => itemClass.addCards(
                Array.from({ length: N }, (_, i) => ({ name: `base-${i}`, category: CATS[i % CATS.length], value: i }))
            ));
            res.addCardsBatch100 = { totalMs: r.ms, perDocMs: +(r.ms / N).toFixed(2) };

            // --- staging: per-write sweep validation, no I/O beyond rev lookups ---
            const t = stack.beginTransaction();
            r = await countFinds(() => t.createDocs(
                Array.from({ length: N }, (_, i) => ({ docId: null, params: { name: `tx-${i}`, category: CATS[i % CATS.length], value: 1000 + i } })),
                "TxBench"
            ));
            res.txStage100 = { totalMs: r.ms, perDocMs: +(r.ms / N).toFixed(2), findCalls: r.finds };

            // --- overlay reads while 100 documents are staged ---
            // The merge path: the committed query runs unwindowed and the union is
            // sorted/windowed in memory.
            r = await countFinds(() => t.findDocuments({ "~class": { $eq: "TxBench" } }));
            res.overlayFindStage100 = { ms: r.ms, finds: r.finds, docs: r.out.docs.length };

            r = await countFinds(() => t.query("SELECT b.name FROM TxBench AS b ORDER BY b.value DESC LIMIT 5;"));
            res.txQueryOverlay = { ms: r.ms, finds: r.finds, names: r.out.rows.map((x: any) => x.name) };

            // The fast path: a second, empty transaction must query at parity - same
            // number of backend finds as the plain read.
            const cold = stack.beginTransaction();
            const plain = await countFinds(() => stack.findDocuments({ "~class": { $eq: "TxBench" } }));
            const overlayEmpty = await countFinds(() => cold.findDocuments({ "~class": { $eq: "TxBench" } }));
            res.overlayFindStage0 = {
                plainMs: plain.ms, overlayMs: overlayEmpty.ms,
                plainFinds: plain.finds, overlayFinds: overlayEmpty.finds,
                sameDocs: plain.out.docs.length === overlayEmpty.out.docs.length,
            };
            cold.discard();

            // --- commit: one bulkDocs through the full pipeline ---
            const commitStart = now();
            const report = await t.commit();
            res.txCommit100 = {
                totalMs: +(now() - commitStart).toFixed(1),
                reportMs: +report.durationMs.toFixed(1),
                perDocMs: +(report.durationMs / N).toFixed(2),
                written: report.written.length,
                failed: report.failed.length,
                adapter: report.adapter,
            };

            // --- refused commit: conflict pre-flight, nothing persisted ---
            const contested = (await itemClass.getCards({ name: { $eq: "base-0" } }))[0];
            const t2 = stack.beginTransaction();
            await t2.db.put({ ...(await t2.db.get(contested._id)), value: 9999 });
            await stack.db.put({ ...(await stack.db.get(contested._id)), value: 8888 });
            const before = (await (stack as any).db.allDocs()).total_rows;
            const refuseStart = now();
            const refusal = await t2.commit().catch((error: any) => error?.name);
            res.txRefusedCommit = {
                ms: +(now() - refuseStart).toFixed(1),
                refusal,
                docCountUnchanged: (await (stack as any).db.allDocs()).total_rows === before,
            };
            t2.discard();

            // --- discard cost ---
            const t3 = stack.beginTransaction();
            await t3.createDocs(
                Array.from({ length: N }, (_, i) => ({ docId: null, params: { name: `drop-${i}`, value: i } })),
                "TxBench"
            );
            const dropStart = now();
            t3.discard();
            res.txDiscard100 = { ms: +(now() - dropStart).toFixed(2) };

            const stored = await stack.findDocuments({ "~class": { $eq: "TxBench" } });
            res.storedAfter = stored.docs.length;
            return res;
        },
    });

    console.log("TX BENCH RESULTS:\n" + JSON.stringify(results, null, 2));

    // Correctness gates, so a perf regression can't hide behind a semantics one.
    expect(results.txCommit100.written).toBe(100);
    expect(results.txCommit100.failed).toBe(0);
    expect(results.overlayFindStage100.docs).toBe(200);            // 100 committed + 100 staged
    expect(results.txQueryOverlay.names).toEqual(["tx-99", "tx-98", "tx-97", "tx-96", "tx-95"]); // staged rows win the ORDER BY
    expect(results.overlayFindStage0.overlayFinds).toBe(results.overlayFindStage0.plainFinds); // empty stage = fast path
    expect(results.overlayFindStage0.sameDocs).toBe(true);
    expect(results.txRefusedCommit.refusal).toBe("TransactionConflictError");
    expect(results.txRefusedCommit.docCountUnchanged).toBe(true);  // a refused commit writes nothing
    expect(results.storedAfter).toBe(200);                          // baseline + committed tx; discarded stage gone
});
