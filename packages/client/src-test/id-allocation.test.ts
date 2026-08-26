import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0023 finding 1.
 *
 * `_id` is minted as `${type}-${lastDocId + 1}` from a counter that only local writes
 * advance. A document that arrives by replication goes through `getReplicationHandle()`,
 * which bypasses that path by design — so the counter does not move, and the next local
 * write mints an id that is already taken. PouchDB then treats the two as revisions of one
 * document, and the new one is gone.
 *
 * `createDoc` swallows the resulting `conflict` and returns its in-memory draft, so the
 * caller receives a document-shaped value with no `_rev` and no error.
 *
 * Reproduced here without a remote: writing through the replication handle is exactly what
 * a pull does.
 */
describe("document id allocation", () => {
    it("ADR-0023: a locally created document survives alongside a replicated one", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "id-alloc",
            username: "id-user",
            password: "id-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const paperClass = await Class.create(stack, "IdPaper", "class", "Papers", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                // What a pull does: writes straight to the database, bypassing the counter.
                const replicationDb = stack.getReplicationHandle();
                const pulledId = `IdPaper-${stack.lastDocId + 1}`;
                await replicationDb.bulkDocs(
                    // `new_edits: false` is how replication writes: the caller owns the
                    // revision, so one has to be supplied.
                    [{
                        _id: pulledId, _rev: `1-${"a".repeat(32)}`,
                        "~class": "IdPaper", title: "from-another-device", active: true,
                    }],
                    { new_edits: false } as any
                );

                const counterAfterPull = stack.lastDocId;

                // Now a perfectly ordinary local write.
                const created = await paperClass.addCard({ title: "written-here" });

                const stored = await paperClass.getCards();

                return {
                    pulledId,
                    counterAfterPull,
                    createdId: created?._id ?? null,
                    // The tell from the report: a returned document with no revision.
                    createdHasRev: Boolean((created as any)?._rev),
                    titles: stored.map((d: any) => d.title).sort(),
                    count: stored.length,
                };
            },
        });

        // Both documents must exist. Today there is one, and it is the replicated one.
        expect(result.count).toBe(2);
        expect(result.titles).toEqual(["from-another-device", "written-here"]);

        // The local write must not reuse the replicated document's id.
        expect(result.createdId).not.toBe(result.pulledId);

        // And a write that landed has a revision.
        expect(result.createdHasRev).toBe(true);
    });

    it("ADR-0023: two independent stacks do not mint the same id", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "id-device-a",
            evaluate: async ({ docStack }) => {
                const { Class } = (window as any).docstack;

                const makeOne = async (stackName: string) => {
                    const stack = await docStack.addStack({ name: stackName });
                    await stack.authenticate({ username: "system", password: "system" });
                    const cls = await Class.create(stack, "IdShared", "class", "Shared", {
                        title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    });
                    const doc = await cls.addCard({ title: `from-${stackName}` });
                    return doc?._id ?? null;
                };

                // Two stacks that have never met, each writing its first document - the
                // two-device case, which no counter repair can fix.
                const first = await makeOne("id-device-one");
                const second = await makeOne("id-device-two");

                return { first, second };
            },
        });

        expect(result.first).toBeTruthy();
        expect(result.second).toBeTruthy();
        // Today both are `IdShared-<same number>`.
        expect(result.first).not.toBe(result.second);
    });

    it("ADR-0023: two instances converge on one class model and one default policy", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "id-converge-host",
            evaluate: async ({ docStack }) => {
                const { Class } = (window as any).docstack;

                const openDevice = async (name: string) => {
                    const stack = await docStack.addStack({ name });
                    await stack.authenticate({ username: "system", password: "system" });
                    await Class.create(stack, "ConvergeTask", "class", "Tasks", {
                        title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    });
                    const model = await stack.getClassModel("ConvergeTask");
                    const policies = (await stack.findDocuments({ "~class": { $eq: "~Policy" } })).docs
                        .filter((d: any) => (d.targetClass || []).includes(model?._id))
                        .map((d: any) => d._id);
                    return { classId: model?._id, policies };
                };

                // Two devices of one application, each building the same class locally.
                const deviceA = await openDevice("id-converge-a");
                const deviceB = await openDevice("id-converge-b");

                return { deviceA, deviceB };
            },
        });

        // Random document ids are right for documents, which have no natural key. A class
        // model does have one - its name - and deriving the id from it is what makes two
        // devices write the *same* document rather than two, so replication merges them
        // instead of leaving a duplicate class and a duplicate policy on both devices.
        expect(result.deviceA.classId).toBe("ConvergeTask");
        expect(result.deviceB.classId).toBe(result.deviceA.classId);

        expect(result.deviceA.policies).toEqual(["Policy-ConvergeTask"]);
        expect(result.deviceB.policies).toEqual(result.deviceA.policies);
    });
});
