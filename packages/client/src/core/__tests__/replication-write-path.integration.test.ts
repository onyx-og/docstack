import { Attribute, Class, Domain } from "../index.js";
import { StackWriteGuardError } from "../guarded-db.js";
import type { Document } from "@docstack/shared";
import { createTestDocStack } from "../test-utils/docstack";

jest.setTimeout(30000);

/** A syntactically valid PouchDB revision, as a replicated document would carry. */
const revision = (generation: number, hash = "0123456789abcdef0123456789abcdef") => `${generation}-${hash}`;

/**
 * The plugin's `bulkDocs` as PouchDB sees it, before the guard.
 *
 * Application code cannot reach this - {@link createGuardedDb} is what `stack.db`
 * hands out - but replication arriving from outside DocStack lands here, so its
 * behaviour has to be pinned down directly.
 */
const pluginBulkDocs = (stack: any) => (docs: any, options?: any) =>
    stack.rawDb.bulkDocs(docs, options);

describe("replication write path", () => {
    describe("the guard on stack.db", () => {
        it("refuses bulkDocs with new_edits: false in the request body", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-new-edits-body");
            try {
                await expect(
                    (stack.db.bulkDocs as any)({
                        docs: [{ _id: "smuggled-1", _rev: revision(1), "~class": "Nope" }],
                        new_edits: false,
                    })
                ).rejects.toBeInstanceOf(StackWriteGuardError);
            } finally {
                await cleanup();
            }
        });

        it("refuses bulkDocs with new_edits: false in the options", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-new-edits-opts");
            try {
                await expect(
                    (stack.db.bulkDocs as any)(
                        [{ _id: "smuggled-2", _rev: revision(1), "~class": "Nope" }],
                        { new_edits: false }
                    )
                ).rejects.toBeInstanceOf(StackWriteGuardError);
            } finally {
                await cleanup();
            }
        });

        it("refuses put with new_edits: false", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-put-new-edits");
            try {
                await expect(
                    (stack.db.put as any)(
                        { _id: "smuggled-3", _rev: revision(1), "~class": "Nope" },
                        { new_edits: false }
                    )
                ).rejects.toBeInstanceOf(StackWriteGuardError);
            } finally {
                await cleanup();
            }
        });

        it("refuses put with force, which PouchDB rewrites into new_edits: false", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-put-force");
            try {
                const className = `Forced-${Date.now()}`;
                const classObj = await Class.create(stack, className, "class", "force test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                const created = await classObj.addCard({ title: "Original" });

                await expect(
                    (stack.db.put as any)(
                        { ...(created as Document), title: undefined },
                        { force: true }
                    )
                ).rejects.toBeInstanceOf(StackWriteGuardError);
            } finally {
                await cleanup();
            }
        });

        it("refuses the adapter methods that sit below the plugin", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-adapter-methods");
            try {
                for (const method of ["_bulkDocs", "_put", "_remove", "_bulkGet"]) {
                    expect(() => (stack.db as any)[method]({ docs: [] }, {}, () => {}))
                        .toThrow(StackWriteGuardError);
                }
            } finally {
                await cleanup();
            }
        });

        it("leaves ordinary writes alone, validation included", async () => {
            const { stack, cleanup } = await createTestDocStack("guard-ordinary-writes");
            try {
                const className = `Guarded-${Date.now()}`;
                const classObj = await Class.create(stack, className, "class", "guard test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

                const created = await classObj.addCard({ title: "Allowed" });
                expect((created as Document)._id).toBeTruthy();

                await expect(
                    stack.db.bulkDocs([{ _id: `${className}-invalid`, "~class": className } as any])
                ).rejects.toThrow(/not valid for its Class schema/);
            } finally {
                await cleanup();
            }
        });
    });

    describe("writes that already own their revisions", () => {
        it("stores a document its class schema would reject", async () => {
            // A peer one patch ahead authors documents this device cannot validate yet.
            // Rejecting them would fail the whole batch, and every retry after it.
            const { stack, cleanup } = await createTestDocStack("new-edits-schema");
            try {
                const className = `Replicated-${Date.now()}`;
                const classObj = await Class.create(stack, className, "class", "new_edits test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

                const incoming = {
                    _id: `${className}-from-peer`,
                    _rev: revision(1),
                    "~class": className,
                    // 'title' is mandatory and absent; 'summary' is not in the schema at all.
                    summary: "authored by a newer build",
                    active: true,
                };

                await pluginBulkDocs(stack)({ docs: [incoming], new_edits: false });

                const stored = await stack.db.get<any>(incoming._id);
                expect(stored._rev).toBe(incoming._rev);
                expect(stored.summary).toBe("authored by a newer build");
            } finally {
                await cleanup();
            }
        });

        it("stores a document whose class is not known here at all", async () => {
            const { stack, cleanup } = await createTestDocStack("new-edits-unknown-class");
            try {
                const incoming = {
                    _id: `Unknown-${Date.now()}`,
                    _rev: revision(1),
                    "~class": "ClassThisDeviceHasNeverHeardOf",
                };

                await pluginBulkDocs(stack)({ docs: [incoming], new_edits: false });

                const stored = await stack.db.get<any>(incoming._id);
                expect(stored["~class"]).toBe("ClassThisDeviceHasNeverHeardOf");
            } finally {
                await cleanup();
            }
        });

        it("stores a relation whose endpoints have not arrived yet", async () => {
            // Replication batches carry no dependency ordering, so a relation routinely
            // lands before the documents it joins. On the authoring path that throws
            // "Source document ... does not exist" and takes the batch with it.
            const { stack, cleanup } = await createTestDocStack("new-edits-relation");
            try {
                const suffix = Date.now();
                const sourceClass = await Class.create(stack, `RelSource-${suffix}`, "class", "source");
                const targetClass = await Class.create(stack, `RelTarget-${suffix}`, "class", "target");
                await Attribute.create(sourceClass, "title", "string", "Title", { mandatory: false });
                await Attribute.create(targetClass, "title", "string", "Title", { mandatory: false });

                const domainName = `RelDomain-${suffix}`;
                await Domain.create(
                    stack, null, domainName, "domain", "1:N",
                    sourceClass, targetClass, "relation ordering test"
                );

                const relation = {
                    _id: `${domainName}-orphan`,
                    _rev: revision(1),
                    "~domain": domainName,
                    sourceClass: sourceClass.getId(),
                    targetClass: targetClass.getId(),
                    sourceId: `RelSource-${suffix}-missing`,
                    targetId: `RelTarget-${suffix}-missing`,
                };

                const { _rev, ...unrevisioned } = relation;

                // The authoring path refuses it...
                await expect(stack.db.bulkDocs([{ ...unrevisioned, _id: `${relation._id}-authored` } as any]))
                    .rejects.toThrow(/does not exist/);

                // ...and replication's write stores it, to be reconciled when its
                // endpoints arrive in a later batch.
                await pluginBulkDocs(stack)({ docs: [relation], new_edits: false });

                const stored = await stack.db.get<any>(relation._id);
                expect(stored.sourceId).toBe(relation.sourceId);
                expect(stored._rev).toBe(relation._rev);
            } finally {
                await cleanup();
            }
        });

        it("does not run after-triggers, which would mint a revision mid-write", async () => {
            const { stack, cleanup } = await createTestDocStack("new-edits-triggers");
            try {
                const className = `Triggered-${Date.now()}`;
                const classObj = await Class.create(stack, className, "class", "trigger bypass test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: false });
                await Attribute.create(classObj, "audit", "integer", "Audit", { mandatory: false });

                await classObj.addTrigger("after:audit", {
                    name: "afterAudit",
                    order: "after",
                    run: `
                        document.audit = (typeof document.audit === "number" ? document.audit : 0) + 1;
                        return document;
                    `,
                });

                // Control: the authoring path runs it.
                const authored = await classObj.addCard({ title: "Authored here" });
                const authoredDoc = await stack.db.get<any>((authored as Document)._id as string);
                expect(authoredDoc.audit).toBe(1);

                // Replication's write does not: the incoming revision is the one the
                // peer minted, and a trigger re-put would fork the revision tree.
                const incoming = {
                    _id: `${className}-from-peer`,
                    _rev: revision(4, "abcdef0123456789abcdef0123456789"),
                    "~class": className,
                    title: "Authored elsewhere",
                    active: true,
                };
                await pluginBulkDocs(stack)({ docs: [incoming], new_edits: false });

                const replicated = await stack.db.get<any>(incoming._id);
                expect(replicated.audit).toBeUndefined();
                expect(replicated._rev).toBe(incoming._rev);
            } finally {
                await cleanup();
            }
        });

        it("reads the flag from the options object as well as the body", async () => {
            const { stack, cleanup } = await createTestDocStack("new-edits-options-form");
            try {
                const incoming = {
                    _id: `OptionsForm-${Date.now()}`,
                    _rev: revision(1),
                    "~class": "ClassThisDeviceHasNeverHeardOf",
                };

                await pluginBulkDocs(stack)([incoming], { new_edits: false });

                const stored = await stack.db.get<any>(incoming._id);
                expect(stored._rev).toBe(incoming._rev);
            } finally {
                await cleanup();
            }
        });
    });

    describe("the handle replication actually uses", () => {
        it("bypasses the plugin on both bulkDocs and bulkGet", async () => {
            const { stack, cleanup } = await createTestDocStack("replication-handle");
            try {
                const handle = stack.getReplicationHandle();
                const incoming = {
                    _id: `Handle-${Date.now()}`,
                    _rev: revision(1),
                    "~class": "ClassThisDeviceHasNeverHeardOf",
                    payload: "verbatim",
                };

                await (handle.bulkDocs as any)({ docs: [incoming], new_edits: false });

                const round = await (handle.bulkGet as any)({ docs: [{ id: incoming._id, rev: incoming._rev }] });
                const returned = round.results[0].docs[0].ok;
                expect(returned.payload).toBe("verbatim");
                expect(returned._rev).toBe(incoming._rev);
            } finally {
                await cleanup();
            }
        });

        it("is the same handle every time, and is not the guarded one", async () => {
            const { stack, cleanup } = await createTestDocStack("replication-handle-identity");
            try {
                expect(stack.getReplicationHandle()).toBe(stack.getReplicationHandle());
                expect(stack.getReplicationHandle()).not.toBe(stack.db);
                expect(stack.getReplicationHandle().name).toBe(stack.db.name);
            } finally {
                await cleanup();
            }
        });
    });
});
