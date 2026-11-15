import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("code-defined model round trip", () => {
    it("declares a class, builds it from its own model, and validates through it", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "model-roundtrip",
            evaluate: async ({ stack }) => {
                const { defineClass, defineModel, a, Class } = (window as any).docstack;

                const Todo = defineClass(`Todo-${Math.random().toString(16).slice(2)}`, {
                    description: "A task to be completed",
                    attributes: {
                        title: a.string({ mandatory: true, maxLength: 200, description: "Title" }),
                        completed: a.boolean({ defaultValue: false }),
                        priority: a.enum(["low", "mid", "high"]),
                        tags: a.string({ isArray: true }),
                        estimate: a.decimal({ precision: 2, min: 0 }),
                        dueOn: a.date(),
                    },
                });

                // The declaration emits exactly the document the engine consumes, and the
                // engine builds a working class straight from it - no codegen, no second
                // description of the same schema.
                const model = Todo.toClassModel();
                const built = await Class.buildFromModel(stack, model, { subscribe: false });

                const fixtures = {
                    minimal: await built.validate({ title: "Ship" }),
                    full: await built.validate({
                        title: "Ship",
                        completed: true,
                        priority: "high",
                        tags: ["a", "b"],
                        estimate: 1.25,
                        dueOn: "2026-11-15T14:10:03.567Z",
                    }),
                    missingMandatory: await built.validate({ completed: true }),
                    badEnum: await built.validate({ title: "Ship", priority: "urgent" }),
                    tooLong: await built.validate({ title: "x".repeat(201) }),
                    badPrecision: await built.validate({ title: "Ship", estimate: 1.234 }),
                    belowMin: await built.validate({ title: "Ship", estimate: -1 }),
                    badDate: await built.validate({ title: "Ship", dueOn: "15/11/2026" }),
                    nulledOptional: await built.validate({ title: "Ship", priority: null }),
                };

                // The hash notices a schema change and ignores a cosmetic one.
                const renamedDescription = defineClass(Todo.name, {
                    description: "Totally different prose",
                    attributes: { ...Todo.attributes },
                });
                const extraAttribute = defineClass(Todo.name, {
                    attributes: { ...Todo.attributes, extra: a.string() },
                });

                const single = defineModel({ classes: [Todo] });

                return {
                    fixtures,
                    modelId: model._id,
                    modelClass: model["~class"],
                    schemaKeys: Object.keys(model.schema).sort(),
                    titleModel: model.schema.title,
                    enumValues: model.schema.priority.config.values,
                    hashIgnoresDescription: (await Todo.hash()) === (await renamedDescription.hash()),
                    hashNoticesAttribute: (await Todo.hash()) !== (await extraAttribute.hash()),
                    hashIsHex: /^[0-9a-f]{64}$/.test(await Todo.hash()),
                    classHashMatchesModel: (await single.classHashes())[Todo.name] === (await Todo.hash()),
                };
            },
        });

        expect(result.fixtures.minimal).toBe(true);
        expect(result.fixtures.full).toBe(true);
        expect(result.fixtures.missingMandatory).toBe(false);
        expect(result.fixtures.badEnum).toBe(false);
        expect(result.fixtures.tooLong).toBe(false);
        expect(result.fixtures.badPrecision).toBe(false);
        expect(result.fixtures.belowMin).toBe(false);
        expect(result.fixtures.badDate).toBe(false);
        // An optional attribute accepts `null`: that is how a client clears a field.
        expect(result.fixtures.nulledOptional).toBe(true);

        expect(result.modelClass).toBe("class");
        expect(result.modelId).toBe(result.modelId);
        expect(result.schemaKeys).toEqual(["completed", "dueOn", "estimate", "priority", "tags", "title"]);
        // `description` is lifted out of the config, where the stored model keeps it.
        expect(result.titleModel).toMatchObject({
            name: "title", type: "string", description: "Title",
            config: { mandatory: true, maxLength: 200 },
        });
        expect(result.enumValues).toEqual([{ value: "low" }, { value: "mid" }, { value: "high" }]);

        expect(result.hashIgnoresDescription).toBe(true);
        expect(result.hashNoticesAttribute).toBe(true);
        expect(result.hashIsHex).toBe(true);
        expect(result.classHashMatchesModel).toBe(true);
    });
});
