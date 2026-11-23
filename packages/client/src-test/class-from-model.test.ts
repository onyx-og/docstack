import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * `Class.buildFromModel` for a model the database has never seen.
 *
 * Two branches: a stored model (it has a `_rev`) is instantiated detached, and a
 * rev-less one is instantiated *and written*, because a caller handing in a model the
 * stack does not have is asking for the class to exist. The engine itself avoids that
 * second branch - `transaction-engine/sweep.ts` and `plugins/pouchdb.ts` both build
 * detached with `Class.get` + `setModel` rather than let it write - so the only callers
 * reaching it are the ones that do want the write.
 *
 * What they were getting was a reduced class document, because the branch routed the
 * model through `Class.create(stack, name, type, description, schema)` with
 * `classModel["~class"]` in the description's place.
 */
describe("a class built from a model the stack does not hold", () => {
    it("is persisted as the model states it, and honours subscribe: false", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "class-from-model",
            username: "cfm-user",
            password: "cfm-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // A model as an application would hand one over: no `_rev`, because the
                // stack has never stored it.
                const model = {
                    _id: "Ledger",
                    "~class": "class",
                    name: "Ledger",
                    description: "Entries, and what they were for",
                    active: true,
                    schema: {
                        label: { name: "label", type: "string", config: { mandatory: true } },
                        amount: { name: "amount", type: "decimal", config: { precision: 2 } },
                    },
                    triggers: [{
                        name: "stampLabel",
                        order: "before",
                        run: "document.label = String(document.label).trim();",
                    }],
                };

                const built = await Class.buildFromModel(stack, model, { subscribe: false });

                // What actually landed in the database, read back rather than taken from
                // the instance: the instance's own model is re-set from the argument
                // afterwards, so it looks right whatever was written.
                const stored: any = await stack.getClassModel("Ledger");

                return {
                    storedDescription: stored?.description,
                    storedTriggerNames: (stored?.triggers ?? []).map((trigger: any) => trigger.name),
                    storedSchemaKeys: Object.keys(stored?.schema ?? {}).sort(),
                    // `subscribe: false` is the caller saying "schema only, nothing to
                    // release". The branch dropped the options object entirely.
                    subscribed: (built as any).docSubscription !== undefined,
                    // The instance agrees with what was stored.
                    instanceDescription: built.getDescription(),
                    instanceTriggerNames: built.triggers.map((trigger: any) => trigger.name),
                    // And the class works: it is a real class in the stack now.
                    wrote: (await built.addCard({ label: "  rent  ", amount: 12.5 })).label,
                };
            },
        });

        // The declaration's description, not the word "class".
        expect(result.storedDescription).toBe("Entries, and what they were for");
        // Its triggers, not an empty list - `Class.create` never saw them.
        expect(result.storedTriggerNames).toEqual(["stampLabel"]);
        expect(result.storedSchemaKeys).toEqual(["amount", "label"]);
        // No live feed, because the caller asked for none.
        expect(result.subscribed).toBe(false);

        expect(result.instanceDescription).toBe("Entries, and what they were for");
        expect(result.instanceTriggerNames).toEqual(["stampLabel"]);
        // The trigger that was persisted is the trigger that runs.
        expect(result.wrote).toBe("rent");
    });
});
