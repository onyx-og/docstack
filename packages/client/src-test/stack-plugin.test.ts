import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Regression cover for ADR-0019.
 *
 * `StackPlugin` used to capture `pouch.prototype.bulkDocs`, which is `undefined` on the
 * supported PouchDB — the core document methods are installed per instance. The branch
 * was dead for as long as its result was thrown away and replaced by a later capture;
 * collapsing those invocations into one made it load-bearing, and every write began
 * failing with `Cannot read properties of undefined (reading 'call')`.
 *
 * The suite did not catch it because the workspace had a broken `pouchdb-browser@9`
 * install — an empty `lib/` — so resolution fell through to a hoisted `7.3.1`, where the
 * prototype *does* carry `bulkDocs`. The first test below fails on that arrangement too,
 * which is the point: it pins the assumption rather than the symptom.
 */
describe("StackPlugin database method capture", () => {
    it("ADR-0019: PouchDB.prototype.bulkDocs is not a valid capture source", async ({ docStackPage }) => {
        const shape = await docStackPage.evaluate(async () => {
            const PouchDB = (window as any).PouchDB;

            // Where the methods really live, if anywhere on the chain.
            let cursor = PouchDB.prototype;
            let foundOnChain = false;
            while (cursor) {
                if (Object.getOwnPropertyDescriptor(cursor, "bulkDocs")) { foundOnChain = true; break; }
                cursor = Object.getPrototypeOf(cursor);
            }

            const instance = new PouchDB(`proto-assumption-${Date.now()}`);
            const instanceHasOwn = !!Object.getOwnPropertyDescriptor(instance, "bulkDocs");
            await instance.destroy();

            return {
                version: PouchDB.version,
                protoBulkDocs: typeof PouchDB.prototype.bulkDocs,
                protoBulkGet: typeof PouchDB.prototype.bulkGet,
                foundOnChain,
                instanceHasOwn,
            };
        });

        // The supported line. A hoisted 7.x would fail here, which is deliberate: the
        // tests must run against the version the package declares a peer dependency on.
        expect(shape.version.startsWith("9.")).toBe(true);

        // The assumption the old code rested on, asserted so the next person who reaches
        // for `pouch.prototype` is stopped by a red test rather than by a consumer.
        expect(shape.protoBulkDocs).toBe("undefined");
        expect(shape.protoBulkGet).toBe("undefined");
        expect(shape.foundOnChain).toBe(false);

        // And where they actually are.
        expect(shape.instanceHasOwn).toBe(true);
    });

    it("ADR-0019: a stack writes immediately after create()", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `first-write-${Date.now()}`;

            // The smallest reproduction: nothing but create, then write. This is the path
            // that threw `Cannot read properties of undefined (reading 'call')`.
            const stack = await ClientStack.create(`db-${name}`, { documentKey: "0".repeat(64) });
            try {
                await stack.authenticate({ username: "system", password: "system" });

                const noteClass = await Class.create(stack, "FirstWriteNote", "class", "Notes", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const created = await noteClass.addCard({ title: "written" });
                const readBack = await stack.getDocument(created._id);

                return { id: created._id, title: (readBack as any)?.title };
            } finally {
                await stack.db.destroy();
            }
        });

        expect(result.id).toBeTruthy();
        expect(result.title).toBe("written");
    });
});
