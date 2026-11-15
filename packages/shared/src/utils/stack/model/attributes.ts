import { AttributeModel, AttributeType } from "../../../types.js";

/**
 * Config keys every attribute accepts, whatever its type.
 *
 * `description` is lifted out of the config when the stored {@link AttributeModel} is
 * built, because the model keeps it beside the config rather than inside it.
 */
export type CommonAttributeConfig = {
    /** Human-readable description, stored on the attribute model. */
    description?: string;
    /** A write must carry this attribute. Absent or `false` makes it optional. */
    mandatory?: boolean;
    /** The attribute holds an array of its type rather than a single value. */
    isArray?: boolean;
    /** Part of the class's uniqueness key. */
    primaryKey?: boolean;
    /** The value is sealed before it leaves the client (ADR-0045). */
    encrypted?: boolean;
    /**
     * Value used when a write omits the attribute.
     *
     * Narrowed per type by each builder. Note that nothing fills defaults on create -
     * the validator merely accepts the omission - so a stored document may simply have
     * no such key. See `./infer.js`.
     */
    defaultValue?: unknown;
};

/**
 * One declared attribute: the type, and the literal config it was declared with.
 *
 * The config's literal type is what the inference in `./infer.js` reads, so builders
 * capture it with `const` type parameters rather than widening it.
 */
export type AttributeSpec<
    TType extends AttributeType["type"] = AttributeType["type"],
    TConfig extends object = object
> = {
    readonly type: TType;
    readonly config: TConfig;
    /**
     * The stored attribute model for this spec.
     *
     * @param name - The attribute's name, which the class supplies as its key.
     * @returns The `AttributeModel` the engine consumes.
     */
    readonly toAttributeModel: (name: string) => AttributeModel;
};

/**
 * Builds an {@link AttributeSpec}, splitting `description` out of the config.
 *
 * Pattern: Factory.
 *
 * @param type - The attribute type.
 * @param config - The declared config, captured literally.
 * @returns A frozen spec.
 */
const spec = <TType extends AttributeType["type"], TConfig extends object>(
    type: TType,
    config: TConfig
): AttributeSpec<TType, TConfig> => Object.freeze({
    type,
    config: Object.freeze(config),
    toAttributeModel: (name: string): AttributeModel => {
        const { description, ...rest } = config as CommonAttributeConfig & Record<string, unknown>;
        const model: AttributeModel = {
            name,
            type,
            config: rest as AttributeModel["config"],
        };
        if (description !== undefined) model.description = description;
        return model;
    },
});

/** Config for `a.string`. */
export type StringConfig = CommonAttributeConfig & { maxLength?: number; defaultValue?: string };
/** Config for `a.integer` and `a.decimal`. */
export type NumberConfig = CommonAttributeConfig & { min?: number; max?: number; defaultValue?: number };
/** Config for `a.decimal`, which adds a decimal-places limit. */
export type DecimalConfig = NumberConfig & { precision?: number };
/** Config for `a.boolean`. */
export type BooleanConfig = CommonAttributeConfig & { defaultValue?: boolean };
/** Config for `a.object`. */
export type ObjectConfig = CommonAttributeConfig & { defaultValue?: Record<string, unknown> };
/**
 * Config for `a.date`.
 *
 * Values are ISO-8601 strings in UTC; `format: "date"` selects a date-only value.
 * `min` and `max` are ISO-8601 strings compared as instants.
 */
export type DateConfig = CommonAttributeConfig & {
    format?: "date" | "datetime";
    min?: string;
    max?: string;
    defaultValue?: string;
};
/** Config for `a.foreignKey`. */
export type ForeignKeyConfig = CommonAttributeConfig & { targetClass: string; defaultValue?: string };
/** Config for `a.reference`. */
export type ReferenceConfig = CommonAttributeConfig & { domain: string; defaultValue?: string };
/** Config for `a.enum`; the values themselves are the builder's first argument. */
export type EnumConfig = CommonAttributeConfig & { defaultValue?: string };

/**
 * The attribute builders a model is declared with.
 *
 * Each returns an {@link AttributeSpec} that keeps its config's literal type, so
 * `InferDoc` and `InferInput` can read `mandatory`, `isArray`, `defaultValue` and an
 * enum's members without a codegen step (`proposal.md` §4).
 *
 * @example
 * ```typescript
 * const Todo = defineClass("Todo", {
 *     attributes: {
 *         title: a.string({ mandatory: true, maxLength: 200 }),
 *         priority: a.enum(["low", "mid", "high"]),
 *         owner: a.foreignKey({ targetClass: "User" }),
 *     },
 * });
 * ```
 */
export const a = {
    /** A string attribute. */
    string: <const TConfig extends StringConfig>(config: TConfig = {} as TConfig) =>
        spec("string", config),

    /**
     * A whole-number attribute. A decimal is rejected, so the declared type is the
     * enforced one.
     */
    integer: <const TConfig extends NumberConfig>(config: TConfig = {} as TConfig) =>
        spec("integer", config),

    /** A decimal-number attribute, optionally limited to `precision` decimal places. */
    decimal: <const TConfig extends DecimalConfig>(config: TConfig = {} as TConfig) =>
        spec("decimal", config),

    /** A boolean attribute. */
    boolean: <const TConfig extends BooleanConfig>(config: TConfig = {} as TConfig) =>
        spec("boolean", config),

    /** An arbitrary JSON object attribute. */
    object: <const TConfig extends ObjectConfig>(config: TConfig = {} as TConfig) =>
        spec("object", config),

    /** An ISO-8601 date attribute, stored as a string in UTC. */
    date: <const TConfig extends DateConfig>(config: TConfig = {} as TConfig) =>
        spec("date", config),

    /**
     * An attribute restricted to a fixed set of string members.
     *
     * @param values - The members, in declaration order. Strings only, which is what
     * the validator has always enforced.
     * @param config - The rest of the attribute's config.
     */
    enum: <const TValues extends readonly [string, ...string[]], const TConfig extends EnumConfig>(
        values: TValues,
        config: TConfig = {} as TConfig
    ) => spec("enum", {
        ...config,
        values: values.map(value => ({ value })) as unknown as { value: TValues[number] }[],
    } as TConfig & { values: { value: TValues[number] }[] }),

    /** A reference to a document of another class, by id. */
    foreignKey: <const TConfig extends ForeignKeyConfig>(config: TConfig) =>
        spec("foreign_key", config),

    /** A reference into a domain. */
    reference: <const TConfig extends ReferenceConfig>(config: TConfig) =>
        spec("reference", config),
};
