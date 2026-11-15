/**
 * Type-level tests for the code-defined model's inference (`proposal.md` §5).
 *
 * These assert *types*, not behaviour, so nothing here runs. They fail by failing to
 * compile, which means they only count if something typechecks them:
 *
 * ```bash
 * npm run test:types -w @docstack/client
 * ```
 *
 * They deliberately resolve `@docstack/shared` through its built declarations, so what
 * is asserted is what a consumer actually sees.
 */
import { a, defineClass, defineModel, InferDoc, InferInput } from "@docstack/shared";

/** Compiles only when `T` is exactly `true`. */
type Expect<T extends true> = T;

/** Exact type equality, invariant in both directions (so `any` cannot slip through). */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Whether `K` may be omitted from `T`. */
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

// One attribute per row of the mapping table, each mandatory so the value type is the
// only thing under test.
const Row = defineClass("Row", {
    attributes: {
        text: a.string({ mandatory: true }),
        whole: a.integer({ mandatory: true }),
        fraction: a.decimal({ mandatory: true, precision: 2 }),
        flag: a.boolean({ mandatory: true }),
        blob: a.object({ mandatory: true }),
        when: a.date({ mandatory: true }),
        day: a.date({ mandatory: true, format: "date" }),
        owner: a.foreignKey({ mandatory: true, targetClass: "User" }),
        link: a.reference({ mandatory: true, domain: "Ownership" }),
        priority: a.enum(["low", "mid", "high"], { mandatory: true }),
    },
});
type RowInput = InferInput<typeof Row>;

export type _string = Expect<Equal<RowInput["text"], string>>;
export type _integer = Expect<Equal<RowInput["whole"], number>>;
export type _decimal = Expect<Equal<RowInput["fraction"], number>>;
export type _boolean = Expect<Equal<RowInput["flag"], boolean>>;
export type _object = Expect<Equal<RowInput["blob"], Record<string, unknown>>>;
// A date is an ISO-8601 string, not a `Date`: that is what a document body holds.
export type _date = Expect<Equal<RowInput["when"], string>>;
export type _dateOnly = Expect<Equal<RowInput["day"], string>>;
export type _foreignKey = Expect<Equal<RowInput["owner"], string>>;
export type _reference = Expect<Equal<RowInput["link"], string>>;
// An enum narrows to its members, which is the whole point of declaring it in code.
export type _enum = Expect<Equal<RowInput["priority"], "low" | "mid" | "high">>;

// Modifiers, in the order the validator applies them.
const Mods = defineClass("Mods", {
    attributes: {
        tags: a.string({ mandatory: true, isArray: true }),
        maybeTags: a.string({ isArray: true }),
        loose: a.string(),
        withDefault: a.boolean({ defaultValue: false }),
        mandatoryWithDefault: a.boolean({ mandatory: true, defaultValue: true }),
        required: a.string({ mandatory: true }),
        arrayWithDefault: a.string({ mandatory: true, isArray: true, defaultValue: "x" }),
        optionalArrayWithDefault: a.string({ isArray: true, defaultValue: "x" }),
    },
});
type ModsInput = InferInput<typeof Mods>;
type ModsDoc = InferDoc<typeof Mods>;

export type _array = Expect<Equal<ModsInput["tags"], string[]>>;
export type _optionalArray = Expect<Equal<ModsInput["maybeTags"], string[] | null | undefined>>;
// Not mandatory means the key may be omitted and `null` is accepted: `undefined` does
// not survive JSON, so `null` is how a client clears a stored field.
export type _optionalKey = Expect<Equal<IsOptional<ModsInput, "loose">, true>>;
export type _optionalValue = Expect<Equal<ModsInput["loose"], string | null | undefined>>;
export type _requiredKey = Expect<Equal<IsOptional<ModsInput, "required">, false>>;

// `mandatory` with a `defaultValue` is NOT required on a write: the validator accepts
// the omission, because Zod applies the default while parsing.
export type _mandatoryWithDefaultIsOptionalOnInput =
    Expect<Equal<IsOptional<ModsInput, "mandatoryWithDefault">, true>>;
// ...and it IS present on a read, because the engine writes the default on create.
export type _mandatoryWithDefaultIsPresentOnDoc =
    Expect<Equal<IsOptional<ModsDoc, "mandatoryWithDefault">, false>>;
export type _defaultIsOptionalOnInput = Expect<Equal<IsOptional<ModsInput, "withDefault">, true>>;
export type _defaultIsPresentOnDoc = Expect<Equal<IsOptional<ModsDoc, "withDefault">, false>>;

// The array exception, verified against Zod itself: modifiers apply `defaultValue`
// before `isArray`, so the default belongs to the members. A mandatory array with a
// default still rejects `undefined`, so it stays required on a write and present on a
// read; an optional one is filled by nothing, so the key may be absent.
export type _mandatoryArrayWithDefaultStaysRequired =
    Expect<Equal<IsOptional<ModsInput, "arrayWithDefault">, false>>;
export type _optionalArrayWithDefaultIsNotFilled =
    Expect<Equal<IsOptional<ModsDoc, "optionalArrayWithDefault">, true>>;

// A read carries the stored document's own fields as well as the declared attributes.
export type _docHasId = Expect<Equal<ModsDoc["_id"], string>>;
export type _docHasClass = Expect<Equal<ModsDoc["~class"], string>>;
export type _docKeepsAttributes = Expect<Equal<ModsDoc["required"], string>>;
// An input is attributes only: the engine stamps everything else.
export type _inputHasNoId = Expect<Equal<"_id" extends keyof ModsInput ? true : false, false>>;

// Nothing collapses to `any`: `Equal` is invariant, so this fails if inference gives up.
export type _notAny = Expect<Equal<Equal<RowInput["text"], any>, false>>;

// A model composes classes and exposes the hashes the datamodel gate compares.
const model = defineModel({ classes: [Row, Mods] });
export type _modelCanonical = Expect<Equal<ReturnType<typeof model.canonical>, string>>;
export type _modelHash = Expect<Equal<ReturnType<typeof model.hash>, Promise<string>>>;
export type _classHashes =
    Expect<Equal<ReturnType<typeof model.classHashes>, Promise<Record<string, string>>>>;
