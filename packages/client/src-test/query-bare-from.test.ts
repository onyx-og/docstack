import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * A table name followed directly by a clause, or by a bare alias, parses.
 *
 * The FROM alias detector used to test the word after the candidate alias rather than
 * the candidate itself: `FROM Task ORDER BY title` took `ORDER` as the alias, `FROM
 * Task WHERE ...` took `WHERE`, and `FROM Task t WHERE ...` refused `t`. Every query in
 * the suites happened to write `AS t`, so the quickstart's own form never ran.
 */
describe("SQL: bare FROM", () => {
    it("parses a table followed by WHERE, ORDER BY, LIMIT, GROUP BY, and a bare alias", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `bare-from-${Date.now()}`;
            const stack = await ClientStack.create(`db-${name}`, { name, documentKey: "0".repeat(64) });
            const task = await Class.create(stack, "Task", "class", "Tasks", {
                title: { name: "title", type: "string", config: { mandatory: true } },
                done: { name: "done", type: "boolean", config: { defaultValue: false } },
                priority: { name: "priority", type: "string", config: {} },
            });
            await task.addCards([
                { title: "b", done: false, priority: "high" },
                { title: "a", done: true, priority: "high" },
                { title: "c", done: false, priority: "low" },
            ]);
            const rows = async (sql: string, ...params: any[]) => (await stack.query(sql, ...params)).rows;
            const out = {
                where: (await rows("SELECT title FROM Task WHERE done = FALSE")).map((r: any) => r.title).sort(),
                orderBy: (await rows("SELECT title FROM Task ORDER BY title")).map((r: any) => r.title),
                limit: (await rows("SELECT title FROM Task ORDER BY title LIMIT 1")).map((r: any) => r.title),
                whereParamOrder: (await rows("SELECT title FROM Task WHERE priority = ? ORDER BY title", "high")).map((r: any) => r.title),
                bareAlias: (await rows("SELECT t.title FROM Task t WHERE t.done = TRUE")).map((r: any) => r.title),
                groupBy: (await rows("SELECT priority, COUNT(*) AS n FROM Task GROUP BY priority ORDER BY priority")),
            };
            stack.close();
            await stack.db.destroy();
            return out;
        });
        expect(result.where).toEqual(["b", "c"]);
        expect(result.orderBy).toEqual(["a", "b", "c"]);
        expect(result.limit).toEqual(["a"]);
        expect(result.whereParamOrder).toEqual(["a", "b"]);
        expect(result.bareAlias).toEqual(["a"]);
        expect(result.groupBy).toEqual([{ priority: "high", n: 2 }, { priority: "low", n: 1 }]);
    });
});
