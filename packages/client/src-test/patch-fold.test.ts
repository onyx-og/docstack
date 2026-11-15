import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The fold and the diff are pure, but they are exercised through the browser bundle
 * like everything else in this suite, so what is tested is what a consumer imports.
 */
describe("patch chain fold and model diff", () => {
    it("folds a chain in semver order, merging per attribute", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "fold-order",
            evaluate: async () => {
                const { foldPatchChain } = (window as any).docstack;

                const classDoc = (schema: any, rev?: string) => ({
                    _id: "Todo", "~class": "class", name: "Todo",
                    ...(rev ? { _rev: rev } : {}), schema,
                });
                const attr = (name: string, type = "string", config: any = {}) =>
                    ({ name, type, config });

                // Deliberately out of order, and 0.10.0 must fold after 0.9.0 rather
                // than before it, which is what string ordering would do.
                const chain = [
                    {
                        _id: "p3", "~class": "patch", target: "app", version: "0.10.0",
                        docs: [classDoc({ priority: attr("priority") }, "auto")],
                    },
                    {
                        _id: "p1", "~class": "patch", target: "app", version: "0.9.0",
                        docs: [classDoc({ title: attr("title"), pages: attr("pages", "integer") })],
                    },
                    {
                        _id: "p2", "~class": "patch", target: "app", version: "0.9.1",
                        docs: [classDoc({ title: attr("title", "string", { mandatory: true }) }, "auto")],
                    },
                ];

                const folded = foldPatchChain(chain);
                return {
                    versions: folded.versions,
                    version: folded.version,
                    schemaKeys: Object.keys(folded.classes.Todo.schema).sort(),
                    // The ADR-0037 scenario: patch 0.9.1 restates only `title`, and
                    // `pages` must survive it. A wholesale replace loses it.
                    pagesSurvived: !!folded.classes.Todo.schema.pages,
                    titleIsMandatory: folded.classes.Todo.schema.title.config.mandatory,
                    revStripped: !("_rev" in folded.classes.Todo),
                };
            },
        });

        expect(result.versions).toEqual(["0.9.0", "0.9.1", "0.10.0"]);
        expect(result.version).toBe("0.10.0");
        expect(result.schemaKeys).toEqual(["pages", "priority", "title"]);
        expect(result.pagesSurvived).toBe(true);
        expect(result.titleIsMandatory).toBe(true);
        expect(result.revStripped).toBe(true);
    });

    it("drops an attribute on a null entry, and replaces without the auto marker", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "fold-null-drop",
            evaluate: async () => {
                const { foldPatchChain } = (window as any).docstack;
                const attr = (name: string) => ({ name, type: "string", config: {} });

                const dropped = foldPatchChain([
                    {
                        _id: "p1", "~class": "patch", target: "app", version: "1.0.0",
                        docs: [{ _id: "Todo", "~class": "class", name: "Todo", schema: { title: attr("title"), note: attr("note") } }],
                    },
                    {
                        _id: "p2", "~class": "patch", target: "app", version: "1.1.0",
                        docs: [{ _id: "Todo", "~class": "class", name: "Todo", _rev: "auto", schema: { note: null } }],
                    },
                ]);

                // Without `_rev: "auto"` a patch document is a fresh insert, so it
                // replaces rather than merges - the engine's own distinction.
                const replaced = foldPatchChain([
                    {
                        _id: "p1", "~class": "patch", target: "app", version: "1.0.0",
                        docs: [{ _id: "Todo", "~class": "class", name: "Todo", schema: { title: attr("title"), note: attr("note") } }],
                    },
                    {
                        _id: "p2", "~class": "patch", target: "app", version: "1.1.0",
                        docs: [{ _id: "Todo", "~class": "class", name: "Todo", schema: { only: attr("only") } }],
                    },
                ]);

                const deleted = foldPatchChain([
                    {
                        _id: "p1", "~class": "patch", target: "app", version: "1.0.0",
                        docs: [{ _id: "Gone", "~class": "class", name: "Gone", schema: {} }],
                    },
                    {
                        _id: "p2", "~class": "patch", target: "app", version: "1.1.0",
                        docs: [{ _id: "Gone", _deleted: true }],
                    },
                ]);

                let badVersion: string | null = null;
                try {
                    foldPatchChain([{ _id: "p", "~class": "patch", target: "app", version: "oops", docs: [] }]);
                } catch (e: any) {
                    badVersion = String(e?.message ?? e);
                }

                return {
                    droppedKeys: Object.keys(dropped.classes.Todo.schema),
                    replacedKeys: Object.keys(replaced.classes.Todo.schema),
                    deletedGone: !("Gone" in deleted.classes),
                    badVersion,
                };
            },
        });

        expect(result.droppedKeys).toEqual(["title"]);
        expect(result.replacedKeys).toEqual(["only"]);
        expect(result.deletedGone).toBe(true);
        expect(result.badVersion).toContain("not valid semver");
    });

    it("diffs a code model against the folded chain", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "model-diff",
            evaluate: async () => {
                const { foldPatchChain, diffModel, defineClass, defineModel, a } = (window as any).docstack;

                const Todo = defineClass("Todo", {
                    attributes: {
                        title: a.string({ mandatory: true }),
                        priority: a.enum(["low", "high"]),
                    },
                });
                const User = defineClass("User", { attributes: { email: a.string({ mandatory: true }) } });
                const model = defineModel({ classes: [Todo, User] });

                // A chain that knows Todo with a stale `title` and an attribute the
                // model has dropped, knows a class the model no longer declares, and
                // has never heard of User.
                const chain = [{
                    _id: "p1", "~class": "patch", target: "app", version: "1.0.0",
                    docs: [
                        {
                            _id: "Todo", "~class": "class", name: "Todo", schema: {
                                title: { name: "title", type: "string", config: {} },
                                legacy: { name: "legacy", type: "string", config: {} },
                            },
                        },
                        { _id: "Retired", "~class": "class", name: "Retired", schema: {} },
                    ],
                }];

                const diff = diffModel(foldPatchChain(chain), model);
                const byId: Record<string, any> = {};
                for (const doc of diff.docs) byId[doc._id] = doc;

                const identical = diffModel(foldPatchChain([{
                    _id: "p1", "~class": "patch", target: "app", version: "1.0.0",
                    docs: [Todo.toClassModel(), User.toClassModel()],
                }]), model);

                return {
                    emitted: diff.docs.map((doc: any) => doc._id),
                    todoIsDelta: byId.Todo?._rev === "auto",
                    todoDeltaKeys: Object.keys(byId.Todo?.schema ?? {}).sort(),
                    // A dropped attribute emits `null`, which is how a patch removes it.
                    legacyDropped: byId.Todo?.schema?.legacy === null,
                    titleRestated: byId.Todo?.schema?.title?.config?.mandatory,
                    // An attribute the chain has never seen arrives in full, inside the
                    // delta for a class that already exists.
                    priorityAdded: byId.Todo?.schema?.priority?.type,
                    priorityValues: byId.Todo?.schema?.priority?.config?.values,
                    // A class the chain has never produced arrives whole, not as a delta.
                    userIsWhole: byId.User && !("_rev" in byId.User) && !!byId.User.schema.email,
                    warnings: diff.warnings,
                    identicalEmits: identical.docs.length,
                    identicalUnchanged: identical.unchanged.sort(),
                };
            },
        });

        expect(result.emitted).toEqual(["Todo", "User"]);
        expect(result.todoIsDelta).toBe(true);
        expect(result.todoDeltaKeys).toEqual(["legacy", "priority", "title"]);
        expect(result.legacyDropped).toBe(true);
        expect(result.titleRestated).toBe(true);
        expect(result.priorityAdded).toBe("enum");
        expect(result.priorityValues).toEqual([{ value: "low" }, { value: "high" }]);
        expect(result.userIsWhole).toBe(true);
        // A class the model stopped declaring is reported, never auto-removed.
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain("Retired");
        // The guard `revision --check` relies on: model and chain agree, nothing to emit.
        expect(result.identicalEmits).toBe(0);
        expect(result.identicalUnchanged).toEqual(["Todo", "User"]);
    });
});
