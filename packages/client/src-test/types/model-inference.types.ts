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
 *
 * The classes come from `../model-agreement/fixtures.ts` rather than being declared here,
 * because `../model-agreement.test.ts` builds its runtime validator from the same two
 * declarations and runs the same values through Zod. That is `proposal.md` §11's
 * agreement criterion: one shared fixture set, two readers. Declaring them twice would
 * let the type and the validator drift apart while both tests went on passing.
 */
import { defineModel, InferDoc, InferInput } from "@docstack/shared";
import { Mods, Row } from "../model-agreement/fixtures.js";

/** Compiles only when `T` is exactly `true`. */
type Expect<T extends true> = T;

/** Exact type equality, invariant in both directions (so `any` cannot slip through). */
type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Whether `K` may be omitted from `T`. */
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;

// `Row` declares one attribute per row of the mapping table, each mandatory so the value
// type is the only thing under test. Its fixture values live beside the declaration.
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

// `Mods` declares every modifier combination, in the order the validator applies them.
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

// The array exception: modifiers apply `defaultValue` before `isArray`, so the default
// belongs to the members. A mandatory array with a default still rejects `undefined`, so
// it stays required on a write and present on a read; an optional one is filled by
// nothing, so the key may be absent. Both halves are asserted against the real validator
// and a real write in `../model-agreement.test.ts`, which reads the same declaration.
export type _mandatoryArrayWithDefaultStaysRequired =
    Expect<Equal<IsOptional<ModsInput, "arrayWithDefault">, false>>;
export type _optionalArrayWithDefaultIsNotFilled =
    Expect<Equal<IsOptional<ModsDoc, "optionalArrayWithDefault">, true>>;

// A read carries the stored document's own fields as well as the declared attributes.
export type _docHasId = Expect<Equal<ModsDoc["_id"], string>>;

/**
 * The same claim at the value level, because `Equal` cannot see `any`.
 *
 * `Equal<any, string>` does not reliably evaluate to `false` - `any extends string` is
 * both branches at once - so every assertion in this file passes vacuously if the
 * inferred document collapses to `any`. It did: `Document` was declared through the
 * ambient `PouchDB` namespace, which is absent from a program that sets
 * `compilerOptions.types`, and `skipLibCheck` hid the cause. An assignment is immune to
 * that, because `any` is assignable to `number` and a `string` is not: this line errors
 * while the type is real, and `@ts-expect-error` turns the error *going away* into the
 * failure. Keep it paired with `"types": []` in `tsconfig.types-test.json`, which is what
 * reproduces the consumer that found this.
 */
declare const storedDoc: ModsDoc;
// @ts-expect-error - `_id` is a string, so this assignment must not be allowed.
export const _docIdIsNotAny: number = storedDoc._id;
// @ts-expect-error - and a declared attribute is its declared type, not `any`.
export const _attributeIsNotAny: number = storedDoc.required;
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
