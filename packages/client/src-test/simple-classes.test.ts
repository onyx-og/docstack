import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0028's second half.
 *
 * A `simple` class stores documents as given: no schema, so no validation, no triggers, no
 * relation checks, no field encryption. The open question was the query engine — whether a
 * class with no attributes can still be queried. It can, and for a specific reason: the
 * engine keys on `~class` and the class model's *name*, never on its attributes.
 * `getCards` builds `{"~class": {$eq: name}}` and projects whatever columns the query
 * asked for, so the schema was never part of reading.
 */
describe("simple classes", () => {
    it("ADR-0028: a simple class holds heterogeneous documents and queries like any other", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "simple-query",
            username: "simple-user",
            password: "simple-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "SimpleEvent", "class", "Events", {});
                const model = await stack.getClassModel("SimpleEvent");
                await stack.db.put({ ...model, simple: true } as any);
                await stack.refreshSimpleClasses();

                // Documents of different shapes, which is the point of the thing.
                await stack.db.put({ _id: "SimpleEvent-1", "~class": "SimpleEvent", active: true,
                    kind: "click", at: 3, target: "button", nested: { deep: true } });
                await stack.db.put({ _id: "SimpleEvent-2", "~class": "SimpleEvent", active: true,
                    kind: "scroll", at: 1, distance: 420 });
                await stack.db.put({ _id: "SimpleEvent-3", "~class": "SimpleEvent", active: true,
                    kind: "click", at: 2 });

                // A schema'd class to join against.
                const targets = await Class.create(stack, "SimpleTarget", "class", "Targets", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                    label: { name: "label", type: "string", config: {} },
                });
                await targets.addCard({ name: "button", label: "The Button" });

                const rows = async (sql: string) => (await stack.query(sql)).rows;
                const col = (rs: any[], name: string) => rs.map(r => r[name] ?? r[`e.${name}`] ?? r[`t.${name}`]);

                return {
                    isSimple: stack.isSimpleClass("SimpleEvent"),
                    all: (await rows("SELECT e.kind FROM SimpleEvent AS e;")).length,
                    where: (await rows("SELECT e.kind FROM SimpleEvent AS e WHERE e.kind = 'click';")).length,
                    // ORDER BY over a field no schema declares.
                    ordered: col(await rows("SELECT e.at FROM SimpleEvent AS e ORDER BY e.at ASC;"), "at"),
                    limited: (await rows("SELECT e.at FROM SimpleEvent AS e ORDER BY e.at DESC LIMIT 2;")).length,
                    // A field only one document has.
                    sparse: col(await rows("SELECT e.distance FROM SimpleEvent AS e WHERE e.kind = 'scroll';"), "distance"),
                    // Joining a simple class to a schema'd one.
                    joined: col(await rows(
                        "SELECT t.label FROM SimpleEvent AS e JOIN SimpleTarget AS t ON e.target = t.name;"
                    ), "label"),
                    // And the class layer reads it too.
                    viaGetCards: (await (await stack.getClass("SimpleEvent"))!.getCards()).length,
                };
            },
        });

        expect(result.isSimple).toBe(true);

        // Reading is unaffected by the absence of a schema.
        expect(result.all).toBe(3);
        expect(result.where).toBe(2);
        expect(result.ordered).toEqual([1, 2, 3]);
        expect(result.limited).toBe(2);
        expect(result.sparse).toEqual([420]);
        expect(result.joined).toEqual(["The Button"]);
        expect(result.viaGetCards).toBe(3);
    });

    it("ADR-0028: a simple write does not load its class model", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "simple-cost",
            username: "cost-user",
            password: "cost-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "CostValidated", "class", "V", {
                    level: { name: "level", type: "string", config: { mandatory: true, primaryKey: true } },
                    message: { name: "message", type: "string", config: {} },
                });
                await Class.create(stack, "CostSimple", "class", "S", {});
                const simpleModel = await stack.getClassModel("CostSimple");
                await stack.db.put({ ...simpleModel, simple: true } as any);
                await stack.refreshSimpleClasses();

                // Counted rather than timed. The cost the flag removes is a class-model
                // lookup per written document - a database round trip - so counting those
                // measures the fast path directly, and does not turn into a flaky
                // assertion about wall-clock time on a loaded machine.
                const realSnapshot = stack.getClassSnapshot;
                let lookups = 0;
                stack.getClassSnapshot = (name: string) => { lookups += 1; return realSnapshot(name); };

                const count = async (fn: () => Promise<any>) => {
                    lookups = 0;
                    await fn();
                    return lookups;
                };

                const writeSimple = (from: number, to: number) => count(async () => {
                    for (let i = from; i < to; i++) {
                        await stack.db.put({ _id: `CostSimple-${i}`, "~class": "CostSimple",
                            active: true, level: "info", message: `m${i}` });
                    }
                });
                const writeSchemad = (from: number, to: number) => count(async () => {
                    for (let i = from; i < to; i++) {
                        await stack.db.put({ _id: `CostValidated-${i}`, "~class": "CostValidated",
                            active: true, level: "info", message: `m${i}` });
                    }
                });

                // Measured as growth rather than as an absolute: marking the class simple
                // above trips the class-model listener, whose `refreshSimpleClasses` does a
                // lookup of its own, and it lands whenever it lands. What matters is
                // whether lookups scale with the number of documents written.
                const simpleFew = await writeSimple(0, 10);
                const simpleMany = await writeSimple(100, 140);
                const schemadFew = await writeSchemad(0, 10);
                const schemadMany = await writeSchemad(100, 140);

                stack.getClassSnapshot = realSnapshot;

                // Readable afterwards, so the fast path is skipping the authoring work and
                // not the write itself.
                const simpleRows = (await stack.query("SELECT s.message FROM CostSimple AS s;")).rows.length;

                return {
                    simpleFew, simpleMany, schemadFew, schemadMany,
                    simpleRows, writtenSimple: 50,
                };
            },
        });

        // 4x the documents, and a simple class does not look up its model any more often:
        // the lookup is not per-document at all.
        expect(result.simpleMany).toBeLessThanOrEqual(result.simpleFew + 1);

        // A schema'd class does one per document, which is the cost that made logs avoid
        // having a class in the first place.
        expect(result.schemadMany - result.schemadFew).toBeGreaterThanOrEqual(20);

        // And the documents really are there.
        expect(result.simpleRows).toBe(result.writtenSimple);
    });
});
