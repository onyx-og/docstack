import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("typed read and write surface", () => {
    it("writes and reads a declared class through the typed wrapper", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "typed-surface",
            evaluate: async ({ stack }) => {
                const { defineClass, defineModel, a, typed, Class } = (window as any).docstack;

                const Todo = defineClass(`Todo-${Math.random().toString(16).slice(2)}`, {
                    attributes: {
                        title: a.string({ mandatory: true, maxLength: 200 }),
                        priority: a.enum(["low", "high"]),
                        done: a.boolean({ defaultValue: false }),
                    },
                });
                const model = defineModel({ classes: [Todo] });

                // The class has to exist in the stack; in a real app its patch installs
                // it. The wrapper resolves it lazily, so wrapping before it exists is
                // fine and only a call would fail.
                const db = typed(stack, model);
                await Class.buildFromModel(stack, Todo.toClassModel(), { subscribe: false });

                const created = await db[Todo.name].addCard({ title: "Ship", priority: "high" });
                const fetched = await db[Todo.name].get(created._id);
                const all = await db[Todo.name].getCards();
                const updated = await db[Todo.name].updateCard(created._id, { done: true });
                const projected = await db[Todo.name].getCards(undefined, ["title"]);
                const untypedIsReal = typeof (await db[Todo.name].untyped()).getCards === "function";

                let missing: string | null = null;
                try {
                    const Absent = defineClass("NeverDeclared", { attributes: { x: a.string() } });
                    await typed(stack, defineModel({ classes: [Absent] })).NeverDeclared.getCards();
                } catch (e: any) {
                    missing = String(e?.message ?? e);
                }

                return {
                    createdTitle: created?.title,
                    // The declared default is written on create, so a read finds it.
                    createdDone: created?.done,
                    fetchedTitle: fetched?.title,
                    fetchedPriority: fetched?.priority,
                    count: all.length,
                    updatedDone: updated?.done,
                    // A projection returns only what was asked for, plus the engine's
                    // own fields.
                    projectedHasTitle: "title" in (projected[0] ?? {}),
                    projectedHasPriority: "priority" in (projected[0] ?? {}),
                    untypedIsReal,
                    missing,
                    keys: Object.keys(db),
                    // Validation still runs underneath: the wrapper adds types, not a
                    // second set of rules.
                    rejectsBadEnum: await db[Todo.name].validate({ title: "x", priority: "urgent" }),
                    acceptsGood: await db[Todo.name].validate({ title: "x", priority: "low" }),
                };
            },
        });

        expect(result.createdTitle).toBe("Ship");
        expect(result.createdDone).toBe(false);
        expect(result.fetchedTitle).toBe("Ship");
        expect(result.fetchedPriority).toBe("high");
        expect(result.count).toBe(1);
        expect(result.updatedDone).toBe(true);
        expect(result.projectedHasTitle).toBe(true);
        expect(result.projectedHasPriority).toBe(false);
        expect(result.untypedIsReal).toBe(true);
        expect(result.keys).toHaveLength(1);
        expect(result.rejectsBadEnum).toBe(false);
        expect(result.acceptsGood).toBe(true);
        // A class the stack does not have names itself and points at the check command,
        // rather than failing as an undefined property somewhere deeper.
        expect(result.missing).toContain("NeverDeclared");
        expect(result.missing).toContain("revision --check");
    });
});
