import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0025.
 *
 * A live SQL view has to know which classes to re-run for. The query already says so —
 * `stack.query()` returns the `ast` — but `from` and `joins` are typed `any[]`, so the walk
 * belongs beside the parser rather than in a consumer that would silently under-subscribe
 * the first time the engine grows a node shape it does not recognise.
 */
describe("collectQueryClasses", () => {
    it("ADR-0025: names the classes a query reads, including through joins and subqueries", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "query-classes",
            username: "qc-user",
            password: "qc-pass",
            evaluate: async ({ stack }) => {
                const { Class, collectQueryClasses } = (window as any).docstack;

                const authors = await Class.create(stack, "QCAuthor", "class", "Authors", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const books = await Class.create(stack, "QCBook", "class", "Books", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    author: { name: "author", type: "string", config: {} },
                });
                await authors.addCard({ name: "ada" });
                await books.addCard({ title: "engine", author: "ada" });

                const classesFor = async (sql: string) => {
                    const { ast } = await stack.query(sql);
                    return collectQueryClasses(ast);
                };

                return {
                    single: await classesFor("SELECT * FROM QCBook;"),
                    joined: (await classesFor(
                        "SELECT b.title FROM QCBook AS b JOIN QCAuthor AS a ON b.author = a.name;"
                    ))?.sort(),
                    // Built rather than executed: the parser emits these nesting shapes,
                    // but the executor rejects `IN (subquery)` with "Unsupported
                    // expression type: subquery", so the SQL cannot be run to obtain one.
                    // What matters here is that the walk reaches a nested select wherever
                    // it sits, which is exactly what these pin.
                    nestedInWhere: collectQueryClasses([{
                        type: "select", from: [{ table: "QCBook", as: "b" }], joins: [],
                        where: {
                            type: "binary_expr", operator: "IN",
                            left: { type: "column_ref", table: "b", column: "author" },
                            right: {
                                type: "subquery",
                                ast: { type: "select", from: [{ table: "QCAuthor", as: "a" }], joins: [] },
                            },
                        },
                    } as any]).sort(),
                    nestedInColumns: collectQueryClasses([{
                        type: "select", from: [{ table: "QCBook", as: "b" }], joins: [],
                        columns: [{
                            expr: {
                                type: "scalar_subquery",
                                ast: { type: "select", from: [{ table: "QCAuthor", as: "a" }], joins: [] },
                            },
                        }],
                    } as any]).sort(),
                    nestedExists: collectQueryClasses([{
                        type: "select", from: [{ table: "QCBook", as: "b" }], joins: [],
                        where: {
                            type: "exists_expr",
                            subquery: { type: "select", from: [{ table: "QCAuthor", as: "a" }], joins: [] },
                        },
                    } as any]).sort(),
                    // A nesting shape that does not exist yet: the walk is generic, so it
                    // is covered without being taught.
                    nestedUnknownShape: collectQueryClasses([{
                        type: "select", from: [{ table: "QCBook", as: "b" }], joins: [],
                        someFutureClause: {
                            type: "lateral_whatever",
                            body: { type: "select", from: [{ table: "QCAuthor", as: "a" }], joins: [] },
                        },
                    } as any]).sort(),
                    // Nothing to read, and that is knowable rather than unknown.
                    noSource: collectQueryClasses([]),
                    // Not an AST at all: the caller has to fail open.
                    unknown: collectQueryClasses(null),
                    // A source with no name — the shape a future subquery-in-FROM takes.
                    unnamedSource: collectQueryClasses([
                        { type: "select", from: [{ as: "x" }], joins: [] } as any,
                    ]),
                };
            },
        });

        expect(result.single).toEqual(["QCBook"]);
        expect(result.joined).toEqual(["QCAuthor", "QCBook"]);
        // A nested select is reached wherever it sits, because the walk looks for `select`
        // nodes rather than enumerating the clauses that may contain one. The last case is
        // the point: a node shape nobody has taught it is still covered, which is what
        // stops a future engine change from silently under-subscribing a live view.
        expect(result.nestedInWhere).toEqual(["QCAuthor", "QCBook"]);
        expect(result.nestedInColumns).toEqual(["QCAuthor", "QCBook"]);
        expect(result.nestedExists).toEqual(["QCAuthor", "QCBook"]);
        expect(result.nestedUnknownShape).toEqual(["QCAuthor", "QCBook"]);

        // `[]` and `null` must be distinguishable: one means "reads nothing", the other
        // "I cannot tell". Only the second should make a caller watch everything.
        expect(result.noSource).toEqual([]);
        expect(result.unknown).toBeNull();
        expect(result.unnamedSource).toBeNull();
    });

    it("ADR-0025: a query re-run on its own classes' changes sees new rows, and ignores others", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "query-live",
            username: "ql-user",
            password: "ql-pass",
            evaluate: async ({ stack }) => {
                const { Class, collectQueryClasses } = (window as any).docstack;

                const watchedClass = await Class.create(stack, "QLWatched", "class", "Watched", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const otherClass = await Class.create(stack, "QLOther", "class", "Other", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                await watchedClass.addCard({ title: "first" });

                const sql = "SELECT w.title FROM QLWatched AS w;";

                // Exactly what the hook does: run, derive the classes, subscribe.
                let runs = 0;
                const rerun = async () => { runs += 1; return stack.query(sql); };

                const initial = await rerun();
                const classes = collectQueryClasses(initial.ast);

                const target = new EventTarget();
                let notifications = 0;
                target.addEventListener("doc", () => { notifications += 1; });
                const subscriptions = classes.map((name: string) => stack.subscribeClassDocs(name, target));

                // A write to a class the query reads.
                await watchedClass.addCard({ title: "second" });
                await new Promise(r => setTimeout(r, 1200));
                const notificationsAfterWatched = notifications;
                const afterWatched = await rerun();

                // A write to a class it does not.
                await otherClass.addCard({ title: "unrelated" });
                await new Promise(r => setTimeout(r, 1200));
                const notificationsAfterOther = notifications;

                for (const subscription of subscriptions) stack.releaseListener(subscription);

                // Released: further writes must not notify.
                await watchedClass.addCard({ title: "third" });
                await new Promise(r => setTimeout(r, 1200));

                return {
                    classes,
                    rowsInitial: initial.rows.length,
                    rowsAfterWatched: afterWatched.rows.length,
                    notificationsAfterWatched,
                    notificationsAfterOther,
                    notificationsAfterRelease: notifications,
                    runs,
                };
            },
        });

        expect(result.classes).toEqual(["QLWatched"]);

        // The query genuinely sees the new row when re-run.
        expect(result.rowsInitial).toBe(1);
        expect(result.rowsAfterWatched).toBe(2);

        // A change to a watched class notifies...
        expect(result.notificationsAfterWatched).toBeGreaterThan(0);
        // ...and a change to an unrelated class does not. This is the whole point of
        // deriving the subscription from the AST rather than watching the whole stack.
        expect(result.notificationsAfterOther).toBe(result.notificationsAfterWatched);

        // Releasing really releases.
        expect(result.notificationsAfterRelease).toBe(result.notificationsAfterWatched);
    });
});
