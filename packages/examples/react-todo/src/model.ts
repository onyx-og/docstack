import { a, defineClass, defineModel, type InferDoc, type InferInput } from "@docstack/client/model";

/**
 * A task to be completed.
 *
 * One declaration, three products: the TypeScript types below, the class document the
 * engine stores (`Todo.toClassModel()`), and the patch that installs it, which
 * `docstack revision --autogenerate` writes into `src/patches`.
 */
export const Todo = defineClass("Todo", {
    description: "A task to be completed",
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        // Declared with a default, so a read is guaranteed a boolean even though a write
        // may omit it: the engine fills it on the document's first write.
        completed: a.boolean({ defaultValue: false }),
        // Narrows to its own members, so `"urgent"` is a compile error rather than a
        // runtime rejection. No `as const` needed.
        priority: a.enum(["low", "normal", "high"], { defaultValue: "normal" }),
        // ISO-8601, date-only. A `Date` object is not the stored shape: a body
        // round-trips through JSON, so this reads back as the string it was written as.
        dueOn: a.date({ format: "date" }),
    },
});

/** A `Todo` as stored: what a read gives you. */
export type TodoDoc = InferDoc<typeof Todo>;
/** A `Todo` as written: required only where the engine will not fill it. */
export type TodoInput = InferInput<typeof Todo>;

/**
 * The application's model.
 *
 * `docstack revision` reads this export to decide what a patch has to carry; nothing
 * else needs it, so a one-class app can keep its model and its class in one file.
 */
export const model = defineModel({ classes: [Todo] });
