import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0028.
 *
 * `ephemeral` on a class model says its documents describe *this run of this client*:
 * emptied when the stack next opens, and never replicated. A property of the class,
 * declared once — rather than a shape the sync filter has to recognise document by
 * document, which is what log records needed before and what every future kind of derived
 * local state would have needed again.
 */
describe("ephemeral classes", () => {
    it("ADR-0028: ~Log is ephemeral, and its documents do not replicate", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "ephemeral-log",
            username: "eph-user",
            password: "eph-pass",
            evaluate: async ({ stack }) => {
                const { createReplicationFilter } = (window as any).docstack;

                const logModel = await stack.getClassModel("~Log");
                const ephemeral = await stack.getEphemeralClassNames();

                // Given the ephemeral set the way `sync()` gives it.
                const filter = createReplicationFilter({ ephemeralClasses: ephemeral });

                const record = {
                    _id: "~log-eph-1", "~class": "~Log", active: true,
                    level: "warn", message: "slow query",
                    fields: { selector: { title: { $regex: "a user's private phrase" } } },
                };
                const ordinary = { _id: "Task-1", "~class": "Task", active: true, title: "real" };

                return {
                    logClassExists: Boolean(logModel),
                    logClassIsEphemeral: (logModel as any)?.ephemeral === true,
                    ephemeral,
                    logReplicates: filter(record),
                    ordinaryReplicates: filter(ordinary),
                };
            },
        });

        expect(result.logClassExists).toBe(true);
        expect(result.logClassIsEphemeral).toBe(true);
        expect(result.ephemeral).toContain("~Log");

        // Structural, not shape-sniffed: the class says so.
        expect(result.logReplicates).toBe(false);
        expect(result.ordinaryReplicates).toBe(true);
    });

    it("ADR-0028: an application declares its own ephemeral class, and it is emptied on open", async ({ useDocStack, docStackPage }) => {
        const stackName = "ephemeral-app";

        const written = await useDocStack({
            name: stackName,
            username: "eph-user2",
            password: "eph-pass2",
            evaluate: async ({ stack }) => {
                const { Class, createReplicationFilter } = (window as any).docstack;

                // A cache: derived, local, no business reaching a peer. Exactly what a
                // redux-like store would want.
                const cache = await Class.create(stack, "EphCache", "class", "Derived", {
                    key: { name: "key", type: "string", config: { mandatory: true, primaryKey: true } },
                    value: { name: "value", type: "string", config: {} },
                });
                const model = await stack.getClassModel("EphCache");
                await stack.db.put({ ...model, ephemeral: true } as any);

                const durable = await Class.create(stack, "EphDurable", "class", "Durable", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                await cache.addCard({ key: "k1", value: "v1" });
                await cache.addCard({ key: "k2", value: "v2" });
                await durable.addCard({ title: "keep me" });

                const ephemeral = await stack.getEphemeralClassNames();
                const filter = createReplicationFilter({ ephemeralClasses: ephemeral });

                return {
                    ephemeral,
                    cached: (await cache.getCards()).length,
                    durable: (await durable.getCards()).length,
                    cacheReplicates: filter({ _id: "EphCache-1", "~class": "EphCache", active: true, key: "k1" }),
                    durableReplicates: filter({ _id: "EphDurable-1", "~class": "EphDurable", active: true, title: "t" }),
                };
            },
        });

        expect(written.ephemeral).toContain("EphCache");
        expect(written.cached).toBe(2);
        expect(written.durable).toBe(1);
        // Declared by the application, honoured without DocStack knowing about it.
        expect(written.cacheReplicates).toBe(false);
        expect(written.durableReplicates).toBe(true);

        // Reopen the same database in a fresh page: "one run" ends at stack open.
        await docStackPage.reload({ waitUntil: 'load' });

        const reopened = await useDocStack({
            name: stackName,
            evaluate: async ({ stack }) => {
                await stack.authenticate({ username: "system", password: "system" });
                const cache = await stack.getClass("EphCache");
                const durable = await stack.getClass("EphDurable");
                return {
                    cached: (await cache!.getCards()).length,
                    durable: (await durable!.getCards()).length,
                };
            },
        });

        // Emptied on open...
        expect(reopened.cached).toBe(0);
        // ...and the ordinary class is untouched.
        expect(reopened.durable).toBe(1);
    });
});
