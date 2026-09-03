import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Class-model propagation and patch schema merging - ADR-0036 / ADR-0038.
 *
 * `applySchemaDelta` used to return from inside its loop, so a schema change
 * propagated to at most one attribute per document, chosen by key order - and its
 * "edit" branch tested the "add" condition, so an in-place model edit never applied
 * at all. Patch hydration used to shallow-merge, so a patch's `schema` replaced the
 * stored one and every patch had to restate the full attribute set or silently drop
 * what it forgot. These tests pin the repaired contracts.
 */
describe("schema propagation", () => {
    it("ADR-0036: a patch adding two attributes stamps both, and merges instead of replacing", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "schema-prop-add-two",
            username: "prop-user",
            password: "prop-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "PropTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    board: { name: "board", type: "string", config: {} },
                });
                const card = await taskClass.addCard({ title: "one", board: "b-1" });

                // The patch states only what it adds - `title` and `board` are not
                // restated, and must survive (ADR-0038).
                await stack.applyPatch({
                    "~class": "patch",
                    version: "1.0.1",
                    changelog: "two new optional attributes",
                    docs: [{
                        _id: taskClass.getId(),
                        "~class": "class",
                        _rev: "auto",
                        schema: {
                            alpha: { name: "alpha", type: "string", config: {} },
                            beta: { name: "beta", type: "string", config: {} },
                        },
                    }],
                });

                const model = await stack.db.get(taskClass.getId());
                const doc = await stack.db.get(card._id);

                return {
                    modelAttributes: Object.keys(model.schema ?? {}).sort(),
                    // Both new keys stamped - the old code stamped whichever came first.
                    hasAlpha: "alpha" in doc,
                    hasBeta: "beta" in doc,
                    board: doc.board,
                    title: doc.title,
                };
            },
        });

        // Merge, not replace: the unstated attributes are still declared.
        expect(result.modelAttributes).toEqual(["alpha", "beta", "board", "title"]);

        // Every attribute in the delta propagates, not just the first.
        expect(result.hasAlpha).toBe(true);
        expect(result.hasBeta).toBe(true);

        // Existing values untouched.
        expect(result.board).toBe("b-1");
        expect(result.title).toBe("one");
    });

    it("ADR-0038: an explicit null drops the attribute from the model and its documents", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "schema-prop-null-drop",
            username: "drop-user",
            password: "drop-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "DropTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    kind: { name: "kind", type: "string", config: {} },
                    extra: { name: "extra", type: "string", config: {} },
                });
                const card = await taskClass.addCard({ title: "one", kind: "chore", extra: "keep" });

                await stack.applyPatch({
                    "~class": "patch",
                    version: "1.0.2",
                    changelog: "drop kind",
                    docs: [{
                        _id: taskClass.getId(),
                        "~class": "class",
                        _rev: "auto",
                        // Removal is a line somebody wrote, never an absence.
                        schema: { kind: null },
                    }],
                });

                const model = await stack.db.get(taskClass.getId());
                const doc = await stack.db.get(card._id);

                return {
                    modelAttributes: Object.keys(model.schema ?? {}).sort(),
                    hasKind: "kind" in doc,
                    extra: doc.extra,
                };
            },
        });

        // Dropped from the model, and only what was named.
        expect(result.modelAttributes).toEqual(["extra", "title"]);

        // Dropping propagates: the attribute leaves the documents too.
        expect(result.hasKind).toBe(false);
        expect(result.extra).toBe("keep");
    });

    it("ADR-0038: re-adding an attribute leaves values documents already hold", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "schema-prop-repair",
            username: "repair-user",
            password: "repair-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "RepairTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: {} },
                });
                const card = await taskClass.addCard({ title: "one", notes: "held" });

                // Manufacture the damage a mis-written patch used to cause under
                // replace semantics: the model loses `notes` while documents keep
                // their values. Written through the replication handle so no
                // propagation runs - exactly a device that replicated the broken
                // model in.
                const handle = stack.getReplicationHandle();
                const classDoc = await handle.get(taskClass.getId(), { revs: true }) as any;
                const damagedSchema = { ...classDoc.schema };
                delete damagedSchema.notes;
                const revNumber = parseInt(classDoc._rev.split("-")[0], 10);
                const revId = "0123456789abcdef0123456789abcdef";
                const { _revisions, ...bare } = classDoc;
                await handle.bulkDocs([{
                    ...bare,
                    schema: damagedSchema,
                    _rev: `${revNumber + 1}-${revId}`,
                    _revisions: { start: revNumber + 1, ids: [revId, ..._revisions.ids] },
                }], { new_edits: false } as any);

                // The repair patch re-declares only the missing attribute.
                await stack.applyPatch({
                    "~class": "patch",
                    version: "1.0.3",
                    changelog: "repair: restore notes",
                    docs: [{
                        _id: taskClass.getId(),
                        "~class": "class",
                        _rev: "auto",
                        schema: { notes: { name: "notes", type: "string", config: {} } },
                    }],
                });

                const model = await stack.db.get(taskClass.getId());
                const doc = await stack.db.get(card._id);

                return {
                    modelHasNotes: "notes" in (model.schema ?? {}),
                    notes: doc.notes,
                };
            },
        });

        expect(result.modelHasNotes).toBe(true);

        // The held value survives the "add": getEmpty() only stamps documents that
        // lack the key.
        expect(result.notes).toBe("held");
    });

    it("ADR-0036: an in-place model edit arrives as a nested delta and is enforced", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "schema-prop-nested",
            username: "nested-user",
            password: "nested-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "TightenTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    nick: { name: "nick", type: "string", config: {} },
                });
                await taskClass.addCard({ title: "one" }); // no nick

                // Benign in-place edit: jsondiffpatch recurses into the model object,
                // so this is a nested delta - the branch the old code silently skipped.
                await stack.applyPatch({
                    "~class": "patch",
                    version: "1.0.4",
                    changelog: "describe nick",
                    docs: [{
                        _id: taskClass.getId(),
                        "~class": "class",
                        _rev: "auto",
                        schema: { nick: { name: "nick", type: "string", description: "a nickname", config: {} } },
                    }],
                });
                const afterBenign = await stack.db.get(taskClass.getId());

                // Tightening `nick` to mandatory must be refused: the existing card
                // has no value to satisfy it.
                let refusal: string | null = null;
                try {
                    await stack.applyPatch({
                        "~class": "patch",
                        version: "1.0.5",
                        changelog: "tighten nick",
                        docs: [{
                            _id: taskClass.getId(),
                            "~class": "class",
                            _rev: "auto",
                            schema: { nick: { name: "nick", type: "string", description: "a nickname", config: { mandatory: true } } },
                        }],
                    });
                } catch (error: any) {
                    refusal = error?.message ?? String(error);
                }

                const afterRefused = await stack.db.get(taskClass.getId());

                return {
                    benignDescription: afterBenign.schema?.nick?.description,
                    refusal,
                    stillOptional: afterRefused.schema?.nick?.config?.mandatory !== true,
                };
            },
        });

        // The nested delta applied - under the old code this change vanished.
        expect(result.benignDescription).toBe("a nickname");

        // Enforcement is real: a model change documents cannot satisfy is refused...
        expect(result.refusal).toBeTruthy();
        expect(result.refusal).toMatch(/nick/);
        // ...and the model keeps its previous definition.
        expect(result.stillOptional).toBe(true);
    });
});
