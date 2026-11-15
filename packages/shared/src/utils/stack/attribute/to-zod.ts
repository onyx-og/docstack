import { z } from "zod";
import { AttributeModel } from "../../../types.js";

/**
 * Options for {@link attributeSpecToZod}.
 */
export type AttributeSpecToZodOptions = {
    /**
     * Existence check for the document(s) a `foreign_key` names.
     *
     * This package cannot reach a stack, so the check stays with the caller that can
     * (`@docstack/client`'s `Attribute`, which closes over its class and stack).
     * Omitted, a foreign key validates as a string and nothing more.
     *
     * @param ids - The ids to check. An array attribute validates one element per call.
     * @param targetClass - The class the ids are expected to belong to.
     * @returns `true` when every id resolves.
     */
    foreignKeyExists?: (ids: string[], targetClass: string) => Promise<boolean>;
};

/**
 * Whether a number carries no more than `precision` decimal places.
 *
 * Pattern: Strategy - handed to Zod's `refine` for `decimal` attributes.
 *
 * @param precision - Maximum number of decimal places allowed.
 * @returns A predicate for `refine`; non-numbers pass, since the base type already
 * rejected them.
 */
const withinPrecision = (precision: number) => (value: unknown): boolean => {
    if (typeof value !== "number") return true;
    const decimals = value.toString().split(".")[1];
    return (decimals ? decimals.length : 0) <= precision;
};

/**
 * The validator for an `enum` attribute.
 *
 * Values are strings. `z.enum` accepts strings only: handed numbers it builds without
 * complaint and then rejects *every* input, so a numeric enum has never accepted a
 * value and nothing can be relying on one. The config is narrowed to what the
 * validator always enforced rather than left to fail silently (`2.0.md` §3,
 * `proposal.md` §8 defect 2).
 *
 * @param name - Attribute name, for error messages.
 * @param config - The attribute's config.
 * @returns The Zod schema for the attribute's base type.
 * @throws If `values` is missing, empty, or holds a non-string value.
 */
const enumField = (name: string, config: AttributeModel["config"]): z.ZodType => {
    const values = config.values;
    if (!values || !Array.isArray(values) || values.length === 0) {
        throw new Error(
            `Attribute '${name}' of type 'enum' must have a non-empty 'values' array in its config.`
        );
    }
    const resolved = values.map((entry: { value: unknown }) => entry?.value);
    const offender = resolved.findIndex(value => typeof value !== "string");
    if (offender !== -1) {
        throw new Error(
            `Attribute '${name}' of type 'enum' accepts string values only; ` +
            `'values[${offender}]' is ${typeof resolved[offender]} (${JSON.stringify(resolved[offender])}).`
        );
    }
    return z.enum(resolved as [string, ...string[]]);
};

/**
 * The validator for a `date` attribute.
 *
 * Dates are stored as **ISO-8601 strings in UTC**, not as `Date` objects. A document
 * body round-trips through JSON, so a `Date` written here reads back as a string, and
 * `z.date()` rejects that string - a read-modify-write would fail on the document's own
 * data. Offsets are not accepted either, so lexicographic order matches chronological
 * order for range queries and for the byte-ordered keys the stores require (android
 * ADR-0001). `config.format: "date"` selects a date-only value (`YYYY-MM-DD`).
 *
 * `min` and `max` are ISO-8601 strings and are compared as instants, not as text.
 *
 * @param name - Attribute name, for error messages.
 * @param config - The attribute's config.
 * @returns The Zod schema for the attribute's base type.
 * @throws If `min` or `max` is present but is not an ISO-8601 string.
 */
const dateField = (name: string, config: AttributeModel["config"]): z.ZodType => {
    const base = config.format === "date" ? z.iso.date() : z.iso.datetime();
    const bound = (value: unknown, label: string): number | null => {
        if (value === undefined || value === null) return null;
        const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
        if (Number.isNaN(parsed)) {
            throw new Error(
                `Attribute '${name}' of type 'date' has a '${label}' that is not an ` +
                `ISO-8601 string: ${JSON.stringify(value)}.`
            );
        }
        return parsed;
    };
    const min = bound(config.min, "min");
    const max = bound(config.max, "max");
    if (min === null && max === null) return base;
    const describe = [
        min === null ? null : `on or after ${new Date(min).toISOString()}`,
        max === null ? null : `on or before ${new Date(max).toISOString()}`,
    ].filter(Boolean).join(" and ");
    return base.refine(
        (value: string) => {
            const at = Date.parse(value);
            return (min === null || at >= min) && (max === null || at <= max);
        },
        { message: `Attribute '${name}' must be ${describe}.` }
    );
};

/**
 * Builds the Zod validator for one attribute model.
 *
 * This is the single source of truth for what an attribute accepts. The runtime
 * validator (`@docstack/client`'s `Attribute.setField`) delegates here, so the engine
 * and anything deriving static types from the same model cannot drift apart
 * (`proposal.md` §5).
 *
 * Pattern: Factory.
 *
 * Modifiers are applied after the base type, in an order that is load-bearing and must
 * not be rearranged:
 * 1. `defaultValue`
 * 2. `isArray` wraps the field in an array
 * 3. anything not `mandatory` becomes nullable *and* optional - `undefined` does not
 *    survive JSON serialization, so `null` is the only way a client can express "clear
 *    this field" on a stored document.
 *
 * @param spec - The attribute's name, type and config.
 * @param options - Hooks the pure mapping cannot supply itself; see
 * {@link AttributeSpecToZodOptions}.
 * @returns The validator for the attribute.
 * @throws If the type is unsupported, or the config is unusable for that type.
 *
 * @example
 * ```typescript
 * const field = attributeSpecToZod({
 *     name: "priority", type: "enum",
 *     config: { values: [{ value: "low" }, { value: "high" }], mandatory: true },
 * });
 * field.safeParse("low").success;  // true
 * field.safeParse("urgent").success; // false
 * ```
 */
export const attributeSpecToZod = (
    spec: Pick<AttributeModel, "name" | "type" | "config">,
    options?: AttributeSpecToZodOptions
): z.ZodType => {
    const { name, type, config } = spec;
    let field: z.ZodType;

    switch (type) {
        case "string": {
            let base = z.string();
            if (config.maxLength !== undefined) base = base.max(config.maxLength);
            field = base;
            break;
        }

        case "integer": {
            // Deliberately not `.int()`: decimals have always passed this validator, so
            // adding it rejects data already stored. Recorded as a 2.0 decision still to
            // be taken (`2.0.md` §3, `proposal.md` §8 defect 3), not taken here.
            let base = z.number();
            if (typeof config.min === "number") base = base.min(config.min);
            if (typeof config.max === "number") base = base.max(config.max);
            field = base;
            break;
        }

        case "decimal": {
            let base = z.number();
            if (typeof config.min === "number") base = base.min(config.min);
            if (typeof config.max === "number") base = base.max(config.max);
            field = typeof config.precision === "number" && config.precision >= 0
                ? base.refine(
                    withinPrecision(config.precision),
                    `Number cannot have more than ${config.precision} decimals.`
                )
                : base;
            break;
        }

        case "boolean":
            field = z.boolean();
            break;

        case "object":
            // Not `z.object({})`, which strips every unknown key on parse and so empties
            // an arbitrary object whenever the parse output is used (`proposal.md` §8
            // defect 4).
            field = z.looseObject({});
            break;

        case "date":
            field = dateField(name, config);
            break;

        case "enum":
            field = enumField(name, config);
            break;

        case "foreign_key": {
            if (!config.targetClass) {
                throw new Error(
                    `Attribute '${name}' of type 'foreign_key' is missing a 'targetClass' in its config.`
                );
            }
            const targetClass = config.targetClass as string;
            const exists = options?.foreignKeyExists;
            field = exists
                ? z.string().refine(
                    async (documentIdOrIds: string | string[]) => {
                        const ids = Array.isArray(documentIdOrIds)
                            ? documentIdOrIds
                            : [documentIdOrIds];
                        if (ids.length === 0) return true;
                        return exists(ids, targetClass);
                    },
                    { message: `One or more documents not found in class '${targetClass}'.` }
                )
                : z.string();
            break;
        }

        case "reference":
            field = z.string().min(1);
            break;

        default:
            throw new Error(`Unsupported schema type: '${type}' for field '${name}'`);
    }

    if (config.defaultValue !== undefined) {
        field = field.default(config.defaultValue);
    }
    if (config.isArray === true) {
        field = z.array(field);
    }
    if (config.mandatory !== true) {
        field = field.nullable().optional();
    }

    return field;
};

export default attributeSpecToZod;
