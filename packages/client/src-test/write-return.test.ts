import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * A write returns the document it wrote.
 *
 * It did not. `pouchdb-core`'s `put` clones the document before handing it on, so
 * everything the write pipeline adds - a filled `defaultValue`, the `~createdBy` /
 * `~updatedBy` attribution, before-trigger output - landed on a copy the caller never
 * saw, and `createDoc` returned a draft that was missing all of it while reporting
 * success. `createDocs`, the batch sibling, used `bulkDocs` and therefore never had the
 * defect: `bulkDocs` passes the caller's objects through and the pipeline enriches them
 * in place. `createDoc` takes that route now.
 *
 * The second test pins the failure shape, because switching away from `put` meant
 * reimplementing what `put` did with a failed result (`yankError`): a per-document error
 * in a results array has to become a rejection for a single-document write, or a conflict
 * becomes a silent success - the failure ADR-0023 exists to prevent.
 *
 * What is NOT covered here is a conflict arriving *through* `createDoc`, because making
 * one deterministically needs a revision to land between that method's own read and its
 * own write. Two attempts are recorded in case someone tries again: stubbing
 * `stack.db.bulkDocs` cannot work - `stack.db` is the guarded Proxy, whose `get` trap
 * returns its own closure, so the assignment lands on the raw instance and the restore
 * makes the guard call itself forever - and racing two real `updateCard` calls on one
 * document crashes the renderer, which is a pre-existing defect recorded in `ROADMAP.md`
 * and not this path's fault.
 *
 * The third test covers `createRelationDoc`, which had the same defect in a smaller form:
 * it returned the draft it had prepared, so the result carried no `_rev` at all. That one
 * keeps `put` and only stamps the response, because the pipeline validates a relation
 * document and returns without touching it - no schema, so nothing for a clone to hide.
 */
describe("what a write returns", () => {
    it("returns the stored document, not the draft that was sent", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "write-return",
            evaluate: async ({ stack }) => {
                const { defineClass, a, Class } = (window as any).docstack;

                const Note = defineClass(`Note-${Math.random().toString(16).slice(2)}`, {
                    attributes: {
                        title: a.string({ mandatory: true }),
                        pinned: a.boolean({ defaultValue: false }),
                        rank: a.integer({ defaultValue: 7 }),
                    },
                });
                const classObj = await Class.buildFromModel(stack, Note.toClassModel(), { subscribe: false });

                const created = await classObj.addCard({ title: "Ship" });
                const storedAfterCreate = await classObj.get(created._id);

                const updated = await classObj.updateCard(created._id, { title: "Shipped" });
                const storedAfterUpdate = await classObj.get(created._id);

                return {
                    // The filled defaults are on the value the write returned, which is
                    // the whole point: a caller that uses it does not need a second read.
                    createdPinned: created.pinned,
                    createdRank: created.rank,
                    createdHasTimestamp: typeof created["~createTimestamp"] === "number",
                    // Same document, same revision - so it IS what was written rather
                    // than something that merely looks similar.
                    createdRevMatchesStored: created._rev === storedAfterCreate._rev,
                    createdKeys: Object.keys(created).sort().join(","),
                    storedKeys: Object.keys(storedAfterCreate).sort().join(","),
                    // An update returns the updated document at its new revision, and
                    // does not resurrect a default over the caller's own value.
                    updatedTitle: updated.title,
                    updatedPinned: updated.pinned,
                    updatedRevMatchesStored: updated._rev === storedAfterUpdate._rev,
                    updatedRevIsNew: updated._rev !== created._rev,
                };
            },
        });

        expect(result.createdPinned).toBe(false);
        expect(result.createdRank).toBe(7);
        expect(result.createdHasTimestamp).toBe(true);
        expect(result.createdRevMatchesStored).toBe(true);
        expect(result.createdKeys).toBe(result.storedKeys);
        expect(result.updatedTitle).toBe("Shipped");
        expect(result.updatedPinned).toBe(false);
        expect(result.updatedRevMatchesStored).toBe(true);
        expect(result.updatedRevIsNew).toBe(true);
    });

    it("a failed write is a result entry, which is why the single-document path checks", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "write-return-failure-shape",
            evaluate: async ({ stack }) => {
                const { defineClass, a, Class } = (window as any).docstack;

                const Note = defineClass(`Stale-${Math.random().toString(16).slice(2)}`, {
                    attributes: { title: a.string({ mandatory: true }) },
                });
                const classObj = await Class.buildFromModel(stack, Note.toClassModel(), { subscribe: false });
                const created = await classObj.addCard({ title: "first" });

                // A stale revision, written through the pipeline exactly as `createDoc`
                // writes. This pins the contract the single-document path depends on:
                // `bulkDocs` reports a failure as an **entry in the results array**, not
                // as a rejection. `put` used to convert that into a rejection
                // (`yankError`); `createDoc` does it itself now, and if a future PouchDB
                // ever started throwing instead, this is the test that says so.
                const results = await stack.db.bulkDocs([{
                    _id: created._id, _rev: `1-${"a".repeat(32)}`,
                    "~class": Note.name, active: true, title: "stale",
                }]);
                const entry = (results as any[])[0] ?? {};
                const stored = await classObj.get(created._id);

                return {
                    threw: false,
                    isEntry: entry.error === true,
                    name: entry.name ?? null,
                    status: entry.status ?? null,
                    namesTheDocument: entry.id === created._id,
                    // And the failed write changed nothing.
                    storedTitle: stored.title,
                };
            },
        });

        expect(result.threw).toBe(false);
        expect(result.isEntry).toBe(true);
        expect(result.name).toBe("conflict");
        expect(result.status).toBe(409);
        expect(result.namesTheDocument).toBe(true);
        expect(result.storedTitle).toBe("first");
    });

    it("a relation document comes back with the revision it was written at", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "write-return-relation",
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;

                const personClass = await Class.create(stack, "WRPerson", "class", "People", {
                    name: { name: "name", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const projectClass = await Class.create(stack, "WRProject", "class", "Projects", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const person = await personClass.addCard({ name: "ada" });
                const project = await projectClass.addCard({ title: "engine" });
                const domain = await Domain.create(
                    stack, null, "WRWorksOn", "domain", "1:N",
                    personClass, projectClass, "Who works on what"
                );

                const relation = await domain.addRelation(project, person._id);
                const stored = await stack.getDocument(relation._id);

                return {
                    // `createRelationDoc` returned the draft it had prepared, so this
                    // was `undefined`: a relation that landed looked exactly like one
                    // that did not.
                    hasRev: typeof relation._rev === "string",
                    revMatchesStored: relation._rev === stored._rev,
                    // And the elaboration the write applied is on it.
                    hasTimestamp: typeof relation["~updateTimestamp"] === "number",
                    sourceId: relation.sourceId,
                    targetId: relation.targetId,
                };
            },
        });

        expect(result.hasRev).toBe(true);
        expect(result.revMatchesStored).toBe(true);
        expect(result.hasTimestamp).toBe(true);
        expect(result.sourceId).toBeTruthy();
        expect(result.targetId).toBeTruthy();
    });
});
