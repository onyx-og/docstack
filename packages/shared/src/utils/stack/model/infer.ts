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

/** Whether the attribute declares a default the engine will write on create. */
type Fills<TSpec> =
    Declares<TSpec, "defaultValue"> extends true
        // An array attribute's default is an ELEMENT default, because modifiers apply
        // `defaultValue` before `isArray`: `z.array(field.default(v))` defaults the
        // members, never the array. The engine therefore writes nothing for it.
        ? ConfigOf<TSpec> extends { isArray: true } ? false : true
        : false;

/**
 * Whether a **write** must carry the attribute.
 *
 * `mandatory` alone is not enough: a `defaultValue` makes the validator accept a write
 * that omits the attribute, because Zod applies the default while parsing. The array
 * exception holds here too - a mandatory array with a default still rejects `undefined`,
 * verified against Zod directly - so such an attribute stays required.
 */
type IsRequiredOnWrite<TSpec> =
    ConfigOf<TSpec> extends { mandatory: true }
        ? Fills<TSpec> extends true ? false : true
        : false;

/**
 * Whether a **stored document** is guaranteed to carry the attribute.
 *
 * Either it is `mandatory`, so no write without it validates, or it declares a default
 * the engine writes on create. Note what this promises: documents the current engine
 * creates. One written before declared defaults were applied on create may lack the
 * key, which is a migration concern rather than a typing one.
 */
type IsPresentOnRead<TSpec> =
    ConfigOf<TSpec> extends { mandatory: true }
        ? true
        : Fills<TSpec>;

type NamesWhere<TAttributes, TPredicate extends { [K in keyof TAttributes]: boolean }> = {
    [K in keyof TAttributes]: TPredicate[K] extends true ? K : never;
}[keyof TAttributes];

type RequiredOnWrite<TAttributes> = NamesWhere<TAttributes, {
    [K in keyof TAttributes]: IsRequiredOnWrite<TAttributes[K]>;
}>;

type PresentOnRead<TAttributes> = NamesWhere<TAttributes, {
    [K in keyof TAttributes]: IsPresentOnRead<TAttributes[K]>;
}>;

/**
 * The attribute half of a class's shape.
 *
 * `TPresent` names the keys that cannot be absent; every other key is optional and
 * accepts `null`, because `undefined` does not survive JSON serialization and `null` is
 * how a client clears a stored field.
 */
type AttributeFields<TAttributes, TPresent extends keyof TAttributes> = Prettify<
    { [K in TPresent]: AttributeShape<TAttributes[K]> } &
    { [K in Exclude<keyof TAttributes, TPresent>]?: AttributeShape<TAttributes[K]> | null }
>;

/** A class definition, as far as inference needs to see it. */
type WithAttributes = { attributes: Record<string, AttributeSpec> };

/**
 * What a read of this class returns: the stored shape.
 *
 * Typed by what the database holds. An attribute is present when it is `mandatory` or
 * when it declares a default the engine writes on create; an array attribute's default
 * is an element default, so it fills nothing and the key may be absent.
 *
 * @example
 * ```typescript
 * type TodoDoc = InferDoc<typeof Todo>;
 * // { _id: string; "~class": string; title: string; priority?: "low" | "high" | null; ... }
 * ```
 */
export type InferDoc<TClass extends WithAttributes> =
    Prettify<Document & AttributeFields<TClass["attributes"], PresentOnRead<TClass["attributes"]>>>;

/**
 * What a write of this class accepts.
 *
 * An attribute is required when it is `mandatory` and the engine will not fill it: a
 * write omitting a `mandatory` attribute that carries a default still validates, so it
 * is optional here, while a `mandatory` *array* with a default is not filled and stays
 * required. System fields are not part of the input; the engine stamps them.
 *
 * @example
 * ```typescript
 * type TodoInput = InferInput<typeof Todo>;
 * await todos.addCard({ title: "Ship" } satisfies TodoInput);
 * ```
 */
export type InferInput<TClass extends WithAttributes> =
    AttributeFields<TClass["attributes"], RequiredOnWrite<TClass["attributes"]>>;
