import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The write path replication uses, and the guard that keeps applications off it -
 * ported from the jest suite `core/__tests__/replication-write-path.integration.test.ts`.
 *
 * `stack.db` is the guarded handle: `new_edits: false` writes through it are refused
 * (StackWriteGuardError), because a revision-owning write that ran the authoring path
 * would validate, trigger and re-rev documents that already have a history (ADR-0001).
 * Replication reaches the plugin's own `bulkDocs` beneath the guard, where those writes
 * store verbatim.
 */
describe("replication write path", () => {
    it("the guard on stack.db refuses revision-owning writes and leaves authoring alone", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "guard-writes",
            username: "guard-user",
            password: "guard-pass",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const rev = (generation: number) => `${generation}-0123456789abcdef0123456789abcdef`;
                const guardName = async (attempt: () => Promise<any>) => {
                    try { await attempt(); return null; } catch (error: any) { return error?.name ?? String(error); }
                };

                const viaBody = await guardName(() => (stack.db.bulkDocs as any)({
                    docs: [{ _id: "smuggled-1", _rev: rev(1), "~class": "Nope" }],
                    new_edits: false,
                }));
                const viaOptions = await guardName(() => (stack.db.bulkDocs as any)(
                    [{ _id: "smuggled-2", _rev: rev(1), "~class": "Nope" }],
                    { new_edits: false },
                ));
                const viaPut = await guardName(() => (stack.db.put as any)(
                    { _id: "smuggled-3", _rev: rev(1), "~class": "Nope" },
                    { new_edits: false },
                ));

                const classObj = await Class.create(stack, "Forced", "class", "force test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                const created = await classObj.addCard({ title: "Original" });
                // PouchDB rewrites `force: true` into new_edits: false; the guard reads through it.
                const viaForce = await guardName(() => (stack.db.put as any)(
                    { ...created, title: undefined },
                    { force: true },
                ));

                // The adapter methods that sit below the plugin throw synchronously.
                const adapterMethods: Record<string, string | null> = {};
                for (const method of ["_bulkDocs", "_put", "_remove", "_bulkGet"]) {
                    try {
                        (stack.db as any)[method]({ docs: [] }, {}, () => {});
                        adapterMethods[method] = null;
                    } catch (error: any) {
                        adapterMethods[method] = error?.name ?? String(error);
                    }
                }

                // Ordinary writes are untouched, validation included.
                const allowed = await classObj.addCard({ title: "Allowed" });
                let validationMessage = "";
                await stack.db.bulkDocs([{ _id: "Forced-invalid", "~class": "Forced" }]).catch((error: any) => {
                    validationMessage = String(error?.message || error);
                });

                return {
                    viaBody, viaOptions, viaPut, viaForce, adapterMethods,
                    allowedId: allowed?._id ?? null,
                    validationMessage,
                };
            },
        });

        expect(result.viaBody).toBe("StackWriteGuardError");
        expect(result.viaOptions).toBe("StackWriteGuardError");
        expect(result.viaPut).toBe("StackWriteGuardError");
        expect(result.viaForce).toBe("StackWriteGuardError");
        for (const name of Object.values(result.adapterMethods)) {
            expect(name).toBe("StackWriteGuardError");
        }
        expect(result.allowedId).toBeTruthy();
        expect(result.validationMessage).toMatch(/not valid for its Class schema/);
    });

    it("writes that own their revisions store verbatim: no validation, no triggers, no re-rev", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "new-edits-writes",
            username: "newedits-user",
            password: "newedits-pass",
            evaluate: async ({ stack }) => {
                const { Class, Attribute, Domain } = (window as any).docstack;
                const rev = (generation: number, hash = "0123456789abcdef0123456789abcdef") => `${generation}-${hash}`;
                // The plugin's bulkDocs as PouchDB sees it, beneath the guard - the
                // surface replication arriving from outside DocStack lands on.
                const pluginBulkDocs = (docs: any, options?: any) => (stack as any).rawDb.bulkDocs(docs, options);

                // A peer one patch ahead: mandatory field absent, unknown field present.
                const schemaClass = await Class.create(stack, "Replicated", "class", "new_edits test");
                await Attribute.create(schemaClass, "title", "string", "Title", { mandatory: true });
                const schemaDefying = {
                    _id: "Replicated-from-peer", _rev: rev(1), "~class": "Replicated",
                    summary: "authored by a newer build", active: true,
                };
                await pluginBulkDocs({ docs: [schemaDefying], new_edits: false });
                const storedDefying = await stack.db.get(schemaDefying._id);

                // A class this device has never heard of.
                const unknown = { _id: "Unknown-from-peer", _rev: rev(1), "~class": "ClassThisDeviceHasNeverHeardOf" };
                await pluginBulkDocs({ docs: [unknown], new_edits: false });
                const storedUnknown = await stack.db.get(unknown._id);

                // A relation whose endpoints have not arrived yet: batches carry no
                // dependency ordering, so this lands routinely.
                const sourceClass = await Class.create(stack, "RelSource", "class", "source");
                const targetClass = await Class.create(stack, "RelTarget", "class", "target");
                await Attribute.create(sourceClass, "title", "string", "Title", { mandatory: false });
                await Attribute.create(targetClass, "title", "string", "Title", { mandatory: false });
                await Domain.create(stack, null, "RelDomain", "domain", "1:N", sourceClass, targetClass, "ordering test");
                const relation = {
                    _id: "RelDomain-orphan", _rev: rev(1), "~domain": "RelDomain",
                    sourceClass: sourceClass.getId(), targetClass: targetClass.getId(),
                    sourceId: "RelSource-missing", targetId: "RelTarget-missing",
                };
                let authoredRefusal = "";
                const { _rev, ...unrevisioned } = relation;
                await stack.db.bulkDocs([{ ...unrevisioned, _id: "RelDomain-orphan-authored" }]).catch((error: any) => {
                    authoredRefusal = String(error?.message || error);
                });
                await pluginBulkDocs({ docs: [relation], new_edits: false });
                const storedRelation = await stack.db.get(relation._id);

                // After-triggers run for authored writes only: a trigger re-put inside a
                // new_edits: false write would fork the revision tree.
                const triggered = await Class.create(stack, "Triggered", "class", "trigger bypass");
                await Attribute.create(triggered, "title", "string", "Title", { mandatory: false });
                await Attribute.create(triggered, "audit", "integer", "Audit", { mandatory: false });
                await triggered.addTrigger("after:audit", {
                    name: "afterAudit",
                    order: "after",
                    run: `document.audit = (typeof document.audit === "number" ? document.audit : 0) + 1; return document;`,
                });
                const authored = await triggered.addCard({ title: "Authored here" });
                const authoredDoc = await stack.db.get(authored._id);
                const incoming = {
                    _id: "Triggered-from-peer", _rev: rev(4, "abcdef0123456789abcdef0123456789"),
                    "~class": "Triggered", title: "Authored elsewhere", active: true,
                };
                await pluginBulkDocs({ docs: [incoming], new_edits: false });
                const replicated = await stack.db.get(incoming._id);

                // The flag is read from the options object as well as the body.
                const optionsForm = { _id: "OptionsForm-1", _rev: rev(1), "~class": "ClassThisDeviceHasNeverHeardOf" };
                await pluginBulkDocs([optionsForm], { new_edits: false });
                const storedOptionsForm = await stack.db.get(optionsForm._id);

                return {
                    defyingRev: storedDefying._rev, defyingSummary: storedDefying.summary,
                    unknownClass: storedUnknown["~class"],
                    authoredRefusal,
                    relationSource: storedRelation.sourceId, relationRev: storedRelation._rev,
                    authoredAudit: authoredDoc.audit,
                    replicatedAudit: replicated.audit ?? null, replicatedRev: replicated._rev,
                    expectedIncomingRev: incoming._rev,
                    optionsFormRev: storedOptionsForm._rev,
                };
            },
        });

        expect(result.defyingRev).toBe("1-0123456789abcdef0123456789abcdef");
        expect(result.defyingSummary).toBe("authored by a newer build");
        expect(result.unknownClass).toBe("ClassThisDeviceHasNeverHeardOf");
        expect(result.authoredRefusal).toMatch(/does not exist/);
        expect(result.relationSource).toBe("RelSource-missing");
        expect(result.relationRev).toBe("1-0123456789abcdef0123456789abcdef");
        expect(result.authoredAudit).toBe(1);
        expect(result.replicatedAudit).toBeNull();
        expect(result.replicatedRev).toBe(result.expectedIncomingRev);
        expect(result.optionsFormRev).toBe("1-0123456789abcdef0123456789abcdef");
    });

    it("the handle replication actually uses bypasses the plugin, and is memoised", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "replication-handle",
            username: "handle-user",
            password: "handle-pass",
            evaluate: async ({ stack }) => {
                const handle = stack.getReplicationHandle();
                const incoming = {
                    _id: "Handle-doc", _rev: "1-0123456789abcdef0123456789abcdef",
                    "~class": "ClassThisDeviceHasNeverHeardOf", payload: "verbatim",
                };
                await (handle.bulkDocs as any)({ docs: [incoming], new_edits: false });
                const round = await (handle.bulkGet as any)({ docs: [{ id: incoming._id, rev: incoming._rev }] });
                const returned = round.results[0].docs[0].ok;

                return {
                    payload: returned.payload,
                    rev: returned._rev,
                    memoised: stack.getReplicationHandle() === handle,
                    notTheGuardedDb: stack.getReplicationHandle() !== stack.db,
                    sameName: stack.getReplicationHandle().name === stack.db.name,
                };
            },
        });

        expect(result.payload).toBe("verbatim");
        expect(result.rev).toBe("1-0123456789abcdef0123456789abcdef");
        expect(result.memoised).toBe(true);
        expect(result.notTheGuardedDb).toBe(true);
        expect(result.sameName).toBe(true);
    });
});
