/**
 * The shared fixture set behind `proposal.md` §11's last criterion: *the Zod schema built
 * at runtime from `toClassModel()` and the static type agree on a shared fixture set for
 * every attribute type and modifier combination.*
 *
 * One declaration, one set of values, two readers:
 *
 * - `../types/model-inference.types.ts` asserts what the **static type** makes of them.
 *   It compiles under `compilerOptions.types: []` and fails by failing to compile.
 * - `../model-agreement.test.ts` builds the class from `toClassModel()` in a real stack
 *   and asserts what **Zod** makes of the same values.
 *
 * Both sides reading one module is the point. Two fixture sets would let the type and the
 * validator drift apart attribute by attribute while each test went on passing, which is
 * exactly the drift `attributeSpecToZod` was extracted into `@docstack/shared` to prevent
 * (`proposal.md` §5).
 *
 * The three sets are not symmetric, on purpose:
 *
 * | Set | The static type | Zod |
 * | --- | --- | --- |
 * | `*Accepted` | admits it | accepts it |
 * | `*TypeRejects` | refuses it (each `@ts-expect-error` *is* that assertion) | rejects it |
 * | `*RefinedOnly` | admits it | rejects it |
 *
 * The third set is the asymmetry stated rather than hidden. TypeScript cannot express
 * `maxLength`, integer-ness, decimal precision, numeric or date bounds, an ISO-8601
 * shape, or "a non-empty string", so for those the type is knowingly coarser than the
 * validator. Everything the type *can* express - the value type, optionality,
 * nullability, arrayness, default filling and enum membership - it has to agree on, and
 * the first two sets are where that is checked.
 */
import { a, defineClass, type InferDoc, type InferInput } from "@docstack/shared";

/** One fixture: a name for the failure message, and the value. */
export type Case<T> = { name: string; value: T };

/** The class a `foreign_key` fixture points into. */
export const TARGET_CLASS = "AgreementTarget";

/**
 * A document id the runtime test really creates.
 *
 * `foreign_key` is the one attribute whose validator needs a live stack: it resolves
 * every id through `stack.db.get`, so an accepted fixture has to name a document that
 * exists and a rejected one a document that does not.
 */
export const TARGET_ID = `${TARGET_CLASS}-present`;

/** A document id the runtime test deliberately does not create. */
export const MISSING_TARGET_ID = `${TARGET_CLASS}-absent`;

/**
 * One attribute per type, every one mandatory, so the value type is the only variable.
 *
 * The constraints (`maxLength`, `min`/`max`, `precision`, `format`) are here to give the
 * `*RefinedOnly` set something to violate: a type whose declared constraint nothing
 * tested would be a constraint nobody enforces, which is `proposal.md` §8's defect 3 in
 * miniature.
 */
export const Row = defineClass("AgreementRow", {
    description: "One attribute per declared type",
    attributes: {
        text: a.string({ mandatory: true, maxLength: 8 }),
        whole: a.integer({ mandatory: true, min: 0, max: 10 }),
        fraction: a.decimal({ mandatory: true, precision: 2 }),
        flag: a.boolean({ mandatory: true }),
        blob: a.object({ mandatory: true }),
        when: a.date({ mandatory: true }),
        day: a.date({ mandatory: true, format: "date" }),
        owner: a.foreignKey({ mandatory: true, targetClass: TARGET_CLASS }),
        link: a.reference({ mandatory: true, domain: "Ownership" }),
        priority: a.enum(["low", "mid", "high"], { mandatory: true }),
    },
});

/**
 * The modifier combinations, in the order `attributeSpecToZod` applies them:
 * `defaultValue`, then `isArray`, then nullable-and-optional for anything not mandatory.
 *
 * The order is load-bearing and the last two rows are why: a default applies to an
 * array's *members*, not to the array, so a mandatory array with a default is still
 * required on a write and an optional one is filled by nothing.
 */
export const Mods = defineClass("AgreementMods", {
    description: "Every modifier combination",
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

export type RowInput = InferInput<typeof Row>;
export type ModsInput = InferInput<typeof Mods>;
export type ModsDoc = InferDoc<typeof Mods>;

/** A valid value for every attribute of `Row`, which the cases below vary one key of. */
export const rowBase: RowInput = {
    text: "ok",
    whole: 3,
    fraction: 1.25,
    flag: true,
    blob: { any: "json", nested: { deep: true } },
    when: "2026-11-23T10:00:00.000Z",
    day: "2026-11-23",
    owner: TARGET_ID,
    link: "Ownership-1",
    priority: "mid",
};

/**
 * Names a case whose value the static type must refuse.
 *
 * The parameter's type is the assertion: the `@ts-expect-error` at each call site fails
 * to compile if the type turns out to *admit* the value.
 */
const refused = (name: string, value: RowInput): Case<RowInput> => ({ name, value });

/** The same, for `Mods`. */
const refusedMods = (name: string, value: ModsInput): Case<ModsInput> => ({ name, value });

export const rowAccepted: Case<RowInput>[] = [
    { name: "every type at its declared shape", value: rowBase },
    { name: "an object attribute holding arbitrary json", value: { ...rowBase, blob: { a: [1, 2], b: null } } },
    { name: "the first enum member", value: { ...rowBase, priority: "low" } },
    { name: "the last enum member", value: { ...rowBase, priority: "high" } },
    { name: "an integer at its lower bound", value: { ...rowBase, whole: 0 } },
    { name: "a decimal at its declared precision", value: { ...rowBase, fraction: 0.5 } },
    { name: "a date-only value for a date-only attribute", value: { ...rowBase, day: "2000-01-01" } },
];

export const rowTypeRejects: Case<RowInput>[] = [
    refused("a number where a string is declared", {
        ...rowBase,
        // @ts-expect-error - `text` is a string.
        text: 123,
    }),
    refused("a string where a number is declared", {
        ...rowBase,
        // @ts-expect-error - `whole` is a number.
        whole: "3",
    }),
    refused("a string where a decimal is declared", {
        ...rowBase,
        // @ts-expect-error - `fraction` is a number.
        fraction: "1.25",
    }),
    refused("a string where a boolean is declared", {
        ...rowBase,
        // @ts-expect-error - `flag` is a boolean.
        flag: "true",
    }),
    refused("a string where an object is declared", {
        ...rowBase,
        // @ts-expect-error - `blob` is an object.
        blob: "json",
    }),
    refused("a Date where a date attribute is declared", {
        ...rowBase,
        // @ts-expect-error - a date is an ISO-8601 *string*: a `Date` written here reads
        // back as a string, so the type never admitted one.
        when: new Date("2026-11-23T10:00:00.000Z"),
    }),
    refused("a number where a foreign key is declared", {
        ...rowBase,
        // @ts-expect-error - `owner` is a document id, which is a string.
        owner: 42,
    }),
    refused("a number where a reference is declared", {
        ...rowBase,
        // @ts-expect-error - `link` is a string.
        link: 42,
    }),
    refused("a value outside the enum's members", {
        ...rowBase,
        // @ts-expect-error - `priority` narrows to its declared members.
        priority: "urgent",
    }),
    refused("null for a mandatory attribute", {
        ...rowBase,
        // @ts-expect-error - only a non-mandatory attribute is nullable.
        text: null,
    }),
    // @ts-expect-error - `text` is mandatory with no default, so omitting it is not an
    // input. The error is on the call, not on a property, because the missing key is.
    refused("a mandatory attribute omitted", {
        whole: 3, fraction: 1.25, flag: true, blob: {},
        when: "2026-11-23T10:00:00.000Z", day: "2026-11-23",
        owner: TARGET_ID, link: "Ownership-1", priority: "mid",
    }),
];

export const rowRefinedOnly: Case<RowInput>[] = [
    { name: "a string longer than maxLength", value: { ...rowBase, text: "far too long" } },
    { name: "a decimal where an integer is declared", value: { ...rowBase, whole: 1.5 } },
    { name: "an integer above its max", value: { ...rowBase, whole: 99 } },
    { name: "an integer below its min", value: { ...rowBase, whole: -1 } },
    { name: "a decimal beyond its precision", value: { ...rowBase, fraction: 1.234 } },
    { name: "a string that is not a date", value: { ...rowBase, when: "not a date" } },
    { name: "a datetime where a date-only attribute is declared", value: { ...rowBase, day: "2026-11-23T10:00:00.000Z" } },
    { name: "an empty string for a reference", value: { ...rowBase, link: "" } },
    // The one refinement that needs a live stack rather than the value alone.
    { name: "a foreign key naming a document that does not exist", value: { ...rowBase, owner: MISSING_TARGET_ID } },
];

/** A valid write for `Mods`, stating only what has to be stated. */
export const modsBase: ModsInput = {
    tags: ["a", "b"],
    required: "x",
    arrayWithDefault: ["x"],
};

export const modsAccepted: Case<ModsInput>[] = [
    {
        name: "only the attributes that must be stated",
        value: modsBase,
    },
    {
        name: "a mandatory attribute with a default, omitted - the default fills it",
        // `mandatoryWithDefault` is absent from `modsBase`, which is the case: `mandatory`
        // with a `defaultValue` is not required on a write, because Zod applies the
        // default while parsing.
        value: modsBase,
    },
    {
        name: "null for an optional attribute - how a client clears a stored field",
        value: { ...modsBase, loose: null },
    },
    {
        name: "null for an optional array",
        value: { ...modsBase, maybeTags: null },
    },
    {
        name: "null for an optional attribute that has a default",
        value: { ...modsBase, withDefault: null },
    },
    {
        name: "every attribute stated",
        value: {
            tags: ["a"], maybeTags: ["b"], loose: "c", withDefault: true,
            mandatoryWithDefault: false, required: "d",
            arrayWithDefault: ["e"], optionalArrayWithDefault: ["f"],
        },
    },
    {
        name: "an empty array for a mandatory array",
        value: { ...modsBase, tags: [] },
    },
];

export const modsTypeRejects: Case<ModsInput>[] = [
    // @ts-expect-error - `required` is mandatory with no default.
    refusedMods("a mandatory attribute omitted", { tags: ["a"], arrayWithDefault: ["x"] }),
    // @ts-expect-error - a mandatory array with a default stays required: the default
    // belongs to the members, so nothing fills the array itself.
    refusedMods("a mandatory array with a default, omitted", { tags: ["a"], required: "x" }),
    refusedMods("a bare value where an array is declared", {
        ...modsBase,
        // @ts-expect-error - `tags` is an array.
        tags: "a",
    }),
    refusedMods("null for a mandatory array", {
        ...modsBase,
        // @ts-expect-error - a mandatory attribute is not nullable.
        tags: null,
    }),
    refusedMods("the wrong member type inside an array", {
        ...modsBase,
        // @ts-expect-error - `tags` holds strings.
        tags: [1, 2],
    }),
];

/**
 * What a *read* must carry after a write that states only `modsBase`.
 *
 * The static side asserts the same thing as optionality on `InferDoc`: a defaulted
 * attribute is present on a read because the engine writes the default on create, and an
 * optional array with a default is *not*, because the default never applied to the array.
 */
export const modsDefaultsOnRead = {
    withDefault: false,
    mandatoryWithDefault: true,
    absent: ["optionalArrayWithDefault", "loose", "maybeTags"] as const,
};

/**
 * The class documents the runtime side builds from.
 *
 * Taken from the declarations above rather than restated, so the Zod under test is built
 * from the same model the type under test is inferred from - which is the criterion.
 */
export const classModels = {
    Row: Row.toClassModel(),
    Mods: Mods.toClassModel(),
};
