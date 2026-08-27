import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0027.
 *
 * Log records written before the `~log-` id prefix existed carry a bare UUID, no `~class`
 * and no `~domain`, so neither the id rules nor the class rules can see them and they
 * replicate. Measured on a real stack: 54 of 56 replicated documents were these, and their
 * fields are whatever the call site passed — `getCards - selector` carries the query
 * selector, so a query over user text would put that text on the remote in the clear.
 */
describe("log records", () => {
    it("ADR-0027: a bare-UUID log record is held back, prefix or not", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "log-shape",
            username: "log-user",
            password: "log-pass",
            evaluate: async ({ stack }) => {
                const { createReplicationFilter } = (window as any).docstack;
                const filter = createReplicationFilter();

                // Exactly the shape from the reported export: `db.post` with a bare `{log}`.
                const legacyRecord = {
                    _id: "25264562-4fc4-408e-95c1-b80295132b9f",
                    log: {
                        level: "info", message: "getCards - selector", module: "class",
                        className: "Task",
                        selector: { "~class": { $eq: "Task" }, active: true },
                    },
                };

                // And one carrying user text, which is the sharp version of the same thing.
                const sensitiveRecord = {
                    _id: "9f1c0a10-0000-4000-8000-abcdefabcdef",
                    log: {
                        level: "info", message: "getCards - selector", module: "class",
                        selector: { title: { $regex: "the user's private search phrase" } },
                    },
                };

                const prefixedRecord = {
                    _id: "~log-3b7c2f11-1111-4111-8111-222222222222",
                    log: { level: "warn", message: "slow query", ms: 1200 },
                };

                // Not a log record: an application document that happens to have a field
                // called `log`. It carries `~class`, so it must still replicate.
                const appDocument = {
                    _id: "Task-abc123", "~class": "Task", active: true,
                    title: "write it up",
                    log: { level: "info", message: "user typed this into a field" },
                };

                return {
                    legacyReplicates: filter(legacyRecord),
                    sensitiveReplicates: filter(sensitiveRecord),
                    prefixedReplicates: filter(prefixedRecord),
                    appDocumentReplicates: filter(appDocument),

                    // And the default no longer writes `info` into the database at all.
                    sinkLevel: await (async () => {
                        const before = (await stack.db.allDocs()).rows.length;
                        await stack.findDocuments({ "~class": { $eq: "~User" } });
                        await new Promise(r => setTimeout(r, 500));
                        const after = (await stack.db.allDocs()).rows.length;
                        return { before, after };
                    })(),
                };
            },
        });

        // The reported documents, both forms.
        expect(result.legacyReplicates).toBe(false);
        expect(result.sensitiveReplicates).toBe(false);
        expect(result.prefixedReplicates).toBe(false);

        // The rule must not be "has a field called log".
        expect(result.appDocumentReplicates).toBe(true);

        // A read used to write a `getCards - selector` record per call. At the `warn`
        // default it writes nothing.
        expect(result.sinkLevel.after).toBe(result.sinkLevel.before);
    });
});
