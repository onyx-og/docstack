import { Document } from "../../../types.js";
import { AttributeSpec } from "./attributes.js";

/**
 * Flattens an intersection so editors show one object instead of `A & B`.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

/** The config an {@link AttributeSpec} was declared with. */
type ConfigOf<TSpec> = TSpec extends { config: infer TConfig } ? TConfig : never;

/** Whether the declared config carries `TKey` at all. */
type Declares<TSpec, TKey extends string> = TKey extends keyof ConfigOf<TSpec> ? true : false;

/** The value one member of an `enum` attribute can hold. */
type EnumMember<TSpec> =
    ConfigOf<TSpec> extends { values: readonly { value: infer TValue }[] }
        ? TValue
        : string;

/**
 * The value an attribute holds, before `isArray` and optionality are applied.
 *
 * Mirrors `attributeSpecToZod`: a `date` is an ISO-8601 **string**, not a `Date`,
 * because that is what a document body round-trips to; ids are plain strings, since
 * branded ids are still an open question (`proposal.md` §9).
 */
export type AttributeValue<TSpec> =
    TSpec extends { type: "string" } ? string :
    TSpec extends { type: "integer" } ? number :
    TSpec extends { type: "decimal" } ? number :
    TSpec extends { type: "boolean" } ? boolean :
    TSpec extends { type: "object" } ? Record<string, unknown> :
    TSpec extends { type: "date" } ? string :
    TSpec extends { type: "foreign_key" } ? string :
    TSpec extends { type: "reference" } ? string :
    TSpec extends { type: "enum" } ? EnumMember<TSpec> :
    never;

/** The attribute's value with `isArray` applied. */
export type AttributeShape<TSpec> =
    ConfigOf<TSpec> extends { isArray: true }
        ? AttributeValue<TSpec>[]
        : AttributeValue<TSpec>;

/**
 * Whether an attribute is guaranteed to be present.
 *
 * `mandatory` alone is not enough. A `defaultValue` makes the validator accept a write
 * that omits the attribute (Zod applies the default during parse), and **nothing fills
 * defaults on create** - `Attribute.getEmpty` is only used by schema propagation - so
 * the stored document simply has no such key. Measured against the engine on
 * 2026-11-15; `proposal.md` §5 raised it as the question this answers.
 */
type IsRequired<TSpec> =
    ConfigOf<TSpec> extends { mandatory: true }
        ? Declares<TSpec, "defaultValue"> extends true ? false : true
        : false;

type RequiredNames<TAttributes> = {
    [K in keyof TAttributes]: IsRequired<TAttributes[K]> extends true ? K : never;
}[keyof TAttributes];

type OptionalNames<TAttributes> = Exclude<keyof TAttributes, RequiredNames<TAttributes>>;

/** The attribute half of a class's shape, with requiredness and nullability applied. */
type AttributeFields<TAttributes> = Prettify<
    { [K in RequiredNames<TAttributes>]: AttributeShape<TAttributes[K]> } &
    { [K in OptionalNames<TAttributes>]?: AttributeShape<TAttributes[K]> | null }
>;

/** A class definition, as far as inference needs to see it. */
type WithAttributes = { attributes: Record<string, AttributeSpec> };

/**
 * What a read of this class returns: the stored shape.
 *
 * Typed by what the database holds, not by what the validator would produce. Zod's
 * parse output is discarded by `Class.validate`, so defaults never reach storage and an
 * attribute carrying one may be absent however it is declared.
 *
 * @example
 * ```typescript
 * type TodoDoc = InferDoc<typeof Todo>;
 * // { _id: string; "~class": string; title: string; priority?: "low" | "high" | null; ... }
 * ```
 */
export type InferDoc<TClass extends WithAttributes> =
    Prettify<Document & AttributeFields<TClass["attributes"]>>;

/**
 * What a write of this class accepts.
 *
 * An attribute is required only when it is `mandatory` **and** carries no
 * `defaultValue`, for the same reason {@link InferDoc} may omit it: a write without it
 * validates. System fields are not part of the input; the engine stamps them.
 *
 * @example
 * ```typescript
 * type TodoInput = InferInput<typeof Todo>;
 * await todos.addCard({ title: "Ship" } satisfies TodoInput);
 * ```
 */
export type InferInput<TClass extends WithAttributes> =
    AttributeFields<TClass["attributes"]>;
