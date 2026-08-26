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
    expect(results.findDocsPlain.docs).toBeGreaterThan(0);
});
