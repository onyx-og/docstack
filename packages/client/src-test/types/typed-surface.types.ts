/**
 * Type-level tests for the typed read and write surface (`proposal.md` §7).
 *
 * Nothing here runs; it fails by failing to compile. Checked by:
 *
 * ```bash
 * npm run test:types -w @docstack/client
 * ```
 */
import { a, defineClass, defineModel, typed, typedClass } from "@docstack/client";
import type { Stack } from "@docstack/shared";

/** Compiles only when `T` is exactly `true`. */
type Expect<T extends true> = T;

/** Exact type equality, invariant in both directions. */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const Todo = defineClass("Todo", {
    attributes: {
        title: a.string({ mandatory: true }),
        priority: a.enum(["low", "high"]),
        done: a.boolean({ defaultValue: false }),
    },
});
const User = defineClass("User", { attributes: { email: a.string({ mandatory: true }) } });
const model = defineModel({ classes: [Todo, User] });

// Never constructed: this file is only ever typechecked.
declare const stack: Stack;

const db = typed(stack, model);
const todos = typedClass(stack, Todo);

// The model's classes arrive keyed by their declared names, not as an array to search.
export type _keys = Expect<Equal<keyof typeof db, "Todo" | "User">>;

// Asserted at the call sites rather than through `ReturnType`, which resolves an
// overloaded function to its LAST signature - here the projection one - and would quietly
// test the wrong overload.
export const readShapes = async () => {
    const all = await db.Todo.getCards();
    const projected = await db.Todo.getCards(undefined, ["title"]);
    const one = await todos.get("Todo-1");

    // A read is the stored shape: mandatory is present, the enum narrows to its members,
    // and `done` is present because it declares a default the engine writes on create.
    type _title = Expect<Equal<(typeof all)[number]["title"], string>>;
    type _enum = Expect<Equal<(typeof all)[number]["priority"], "low" | "high" | null | undefined>>;
    type _filled = Expect<Equal<(typeof all)[number]["done"], boolean>>;
    type _id = Expect<Equal<(typeof all)[number]["_id"], string>>;

    // A projected read cannot promise whole documents, so every field goes optional.
    type _projected = Expect<Equal<(typeof projected)[number]["title"], string | undefined>>;

    // One document, or none.
    type _oneTitle = Expect<Equal<NonNullable<typeof one>["title"], string>>;
    type _oneNullable = Expect<Equal<null extends typeof one ? true : false, true>>;

    return [all, projected, one] as [typeof all, typeof projected, typeof one];
};

// A write takes the declared attributes and nothing else.
export type _writeAccepts = Expect<
    Parameters<typeof db.Todo.addCard>[0] extends { title: string } ? true : false
>;
export type _writeHasNoId = Expect<
    Equal<"_id" extends keyof Parameters<typeof db.Todo.addCard>[0] ? true : false, false>
>;
// An update is a partial of the same thing.
export type _updateIsPartial = Expect<
    Equal<Parameters<typeof db.Todo.updateCard>[0], string>
>;

// The untyped class stays reachable, which is what the escape hatches need.
export type _untypedEscapeHatch = Expect<
    Awaited<ReturnType<typeof todos.untyped>> extends { getCards: unknown } ? true : false
>;

// These are the real assertions: each line is a call the compiler must reject.
export const mustReject = () => {
    // @ts-expect-error - `title` is mandatory and nothing fills it.
    void db.Todo.addCard({});
    // @ts-expect-error - not a member of the declared enum.
    void db.Todo.addCard({ title: "Ship", priority: "urgent" });
    // @ts-expect-error - wrong primitive for a boolean attribute.
    void db.Todo.addCard({ title: "Ship", done: "yes" });
    // @ts-expect-error - not a declared attribute of this class.
    void db.Todo.addCard({ title: "Ship", nonsense: 1 });
    // @ts-expect-error - the model declares no such class.
    void db.Nonexistent;
    // @ts-expect-error - `User` wants an email, not a title.
    void db.User.addCard({ title: "Ship" });
};

// And these must be accepted, so the rejections above are not just strictness.
export const mustAccept = async () => {
    await db.Todo.addCard({ title: "Ship" });
    await db.Todo.addCard({ title: "Ship", priority: "high", done: true });
    await db.Todo.updateCard("Todo-1", { done: true });
    await db.Todo.updateCard("Todo-1", { priority: null });
    await db.Todo.getCards({ done: { $eq: false } });
    await db.Todo.getCards(undefined, ["title"]);
    await db.User.addCard({ email: "a@b.c" });
};
