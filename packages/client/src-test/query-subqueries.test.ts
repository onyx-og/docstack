import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0026.
 *
 * The parser has produced `subquery` and `exists_expr` nodes since the SQL engine landed,
 * and emits `NOT IN` as an operator — but `evalExpression` had a case for none of them, so
 * every such query died at the default arm with `Unsupported expression type: subquery` or
 * `Unsupported operator NOT IN`. The SQL parsed, planned, and then failed to run.
 */
describe("subquery expressions", () => {
    it("ADR-0026: IN, NOT IN and EXISTS over a subquery all execute", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "subquery-exec",
            username: "sq-user",
            password: "sq-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const authors = await Class.create(stack, "SQAuthor", "class", "Authors", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                    active: { name: "active", type: "boolean", config: {} },
                });
                const books = await Class.create(stack, "SQBook", "class", "Books", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    author: { name: "author", type: "string", config: {} },
                });

                await authors.addCards([{ name: "ada" }, { name: "grace" }]);
                await books.addCards([
                    { title: "engine", author: "ada" },
                    { title: "compiler", author: "grace" },
                    { title: "orphan", author: "nobody" },
                ]);

                const titles = async (sql: string) => {
                    const { rows } = await stack.query(sql);
                    return rows.map((r: any) => r.title ?? r["b.title"]).sort();
                };

                const attempt = async (sql: string) => {
                    try { return { ok: true, titles: await titles(sql) }; }
                    catch (e: any) { return { ok: false, error: e?.message ?? String(e) }; }
                };

                return {
                    inSubquery: await attempt(
                        "SELECT b.title FROM SQBook AS b WHERE b.author IN (SELECT a.name FROM SQAuthor AS a);"
                    ),
                    notInSubquery: await attempt(
                        "SELECT b.title FROM SQBook AS b WHERE b.author NOT IN (SELECT a.name FROM SQAuthor AS a);"
                    ),
                    existsSubquery: await attempt(
                        "SELECT b.title FROM SQBook AS b WHERE EXISTS (SELECT a.name FROM SQAuthor AS a WHERE a.name = b.author);"
                    ),
                    notExistsSubquery: await attempt(
                        "SELECT b.title FROM SQBook AS b WHERE NOT EXISTS (SELECT a.name FROM SQAuthor AS a WHERE a.name = b.author);"
                    ),
                };
            },
        });

        // Every one of these threw before the fix.
        expect(result.inSubquery.ok).toBe(true);
        expect(result.notInSubquery.ok).toBe(true);
        expect(result.existsSubquery.ok).toBe(true);
        expect(result.notExistsSubquery.ok).toBe(true);

        // And the answers are right, not merely non-throwing.
        expect(result.inSubquery.titles).toEqual(["compiler", "engine"]);
        expect(result.notInSubquery.titles).toEqual(["orphan"]);

        // EXISTS here is correlated — it reads `b.author` from the outer row.
        expect(result.existsSubquery.titles).toEqual(["compiler", "engine"]);
        expect(result.notExistsSubquery.titles).toEqual(["orphan"]);
    });
});
