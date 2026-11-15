import { ClassModel, TriggerModel } from "../../../types.js";
import { AttributeSpec } from "./attributes.js";
import { canonicalJson, sha256Hex } from "./canonical.js";

/**
 * What `defineClass` accepts beside its name.
 */
export type ClassDefinitionInput<TAttributes extends Record<string, AttributeSpec>> = {
    /** Human-readable description. Excluded from the canonical hash, being cosmetic. */
    description?: string;
    /** The class this one extends. */
    parentClass?: string;
    /**
     * Documents of this class describe this run of this client: emptied on the next
     * open, never replicated (ADR-0028).
     */
    ephemeral?: boolean;
    /** The attributes, keyed by name. */
    attributes: TAttributes;
    /**
     * Triggers, as the stored model carries them.
     *
     * Declared handlers (`defineHandler`, `proposal.md` §13) are a later slice; until
     * then a trigger is written the way the engine already accepts it.
     */
    triggers?: readonly TriggerModel[];
};

/**
 * A declared class: the definition, plus what the engine and the gates need from it.
 */
export type ClassDefinition<
    TName extends string = string,
    TAttributes extends Record<string, AttributeSpec> = Record<string, AttributeSpec>
> = {
    readonly name: TName;
    readonly description?: string;
    readonly parentClass?: string;
    readonly ephemeral?: boolean;
    readonly attributes: TAttributes;
    readonly triggers: readonly TriggerModel[];
    /**
     * The class document the engine consumes, exactly as a patch would carry it.
     *
     * @returns A `ClassModel` with no revision: a generated patch carries the delta,
     * and the engine merges it (ADR-0037, ADR-0038).
     */
    readonly toClassModel: () => ClassModel;
    /** The canonical serialization this class hashes to. Semantic fields only. */
    readonly canonical: () => string;
    /** SHA-256 of {@link canonical}, hex-encoded. */
    readonly hash: () => Promise<string>;
};

/**
 * The semantic shape of a class: what a hash is allowed to notice.
 *
 * Excludes revisions, timestamps and every description, so renaming a comment never
 * refuses a replication. A trigger contributes its name, order and reference, never its
 * body: bodies are code, versioned by the app build (`proposal.md` §8, §13).
 */
const semanticClass = (definition: {
    name: string;
    parentClass?: string;
    ephemeral?: boolean;
    attributes: Record<string, AttributeSpec>;
    triggers: readonly TriggerModel[];
}) => ({
    name: definition.name,
    parentClass: definition.parentClass,
    ephemeral: definition.ephemeral,
    attributes: Object.fromEntries(
        Object.entries(definition.attributes).map(([name, spec]) => {
            const { description, ...config } = spec.config as Record<string, unknown>;
            return [name, { type: spec.type, config }];
        })
    ),
    triggers: definition.triggers.map(trigger => ({
        name: trigger.name,
        order: trigger.order,
        jobId: trigger.jobId,
    })),
});

/**
 * Declares a class in code, from which its TypeScript types are inferred and its
 * stored model is emitted.
 *
 * One definition answers both: `InferDoc`/`InferInput` read the same specs that
 * {@link ClassDefinition.toClassModel} writes, so the types and the runtime cannot
 * drift (`proposal.md` §3).
 *
 * Pattern: Builder.
 *
 * @param name - The class name, which is also its document id.
 * @param definition - Attributes and flags; see {@link ClassDefinitionInput}.
 * @returns A frozen {@link ClassDefinition}.
 *
 * @example
 * ```typescript
 * export const Todo = defineClass("Todo", {
 *     description: "A task to be completed",
 *     attributes: {
 *         title: a.string({ mandatory: true, maxLength: 200 }),
 *         completed: a.boolean({ defaultValue: false }),
 *     },
 * });
 * export type TodoDoc = InferDoc<typeof Todo>;
 * ```
 */
export const defineClass = <
    const TName extends string,
    const TAttributes extends Record<string, AttributeSpec>
>(
    name: TName,
    definition: ClassDefinitionInput<TAttributes>
): ClassDefinition<TName, TAttributes> => {
    const triggers = Object.freeze([...(definition.triggers ?? [])]);
    const canonical = () => canonicalJson(semanticClass({
        name,
        parentClass: definition.parentClass,
        ephemeral: definition.ephemeral,
        attributes: definition.attributes,
        triggers,
    }));
    return Object.freeze({
        name,
        description: definition.description,
        parentClass: definition.parentClass,
        ephemeral: definition.ephemeral,
        attributes: Object.freeze({ ...definition.attributes }) as TAttributes,
        triggers,
        toClassModel: (): ClassModel => {
            const model = {
                _id: name,
                "~class": "class",
                name,
                active: true,
                schema: Object.fromEntries(
                    Object.entries(definition.attributes)
                        .map(([attributeName, spec]) => [attributeName, spec.toAttributeModel(attributeName)])
                ),
                triggers: [...triggers],
            } as unknown as ClassModel;
            if (definition.description !== undefined) model.description = definition.description;
            if (definition.parentClass !== undefined) model.parentClass = definition.parentClass;
            if (definition.ephemeral !== undefined) model.ephemeral = definition.ephemeral;
            return model;
        },
        canonical,
        hash: () => sha256Hex(canonical()),
    });
};

/** A declared model: the classes an application's schema is made of. */
export type ModelDefinition<TClasses extends readonly ClassDefinition[] = readonly ClassDefinition[]> = {
    readonly classes: TClasses;
    /** The declared classes by name, for lookup without scanning. */
    readonly byName: Readonly<Record<string, ClassDefinition>>;
    /** Every class document, in declaration order. */
    readonly toClassModels: () => ClassModel[];
    /** The canonical serialization of every class, class names sorted. */
    readonly canonical: () => string;
    /** SHA-256 of {@link canonical}, hex-encoded. */
    readonly hash: () => Promise<string>;
    /** Per-class hashes, which is the unit the datamodel gate compares (`ROADMAP.md`). */
    readonly classHashes: () => Promise<Record<string, string>>;
};

/**
 * Collects declared classes into one model.
 *
 * The whole-model hash is a cheap equality check; per-class hashes are the comparable
 * unit when two clients legitimately hold different class *sets*, which is difficulty
 * (3) of the datamodel-hash gate in `ROADMAP.md`.
 *
 * @param definition - The classes making up the model. Domains are a later addition.
 * @returns A frozen {@link ModelDefinition}.
 * @throws If two classes share a name.
 */
export const defineModel = <const TClasses extends readonly ClassDefinition[]>(
    definition: { classes: TClasses }
): ModelDefinition<TClasses> => {
    const byName: Record<string, ClassDefinition> = {};
    for (const declared of definition.classes) {
        if (byName[declared.name]) {
            throw new Error(`defineModel - class '${declared.name}' is declared twice.`);
        }
        byName[declared.name] = declared;
    }
    const canonical = () => canonicalJson(
        Object.fromEntries(
            Object.keys(byName).sort().map(name => [name, JSON.parse(byName[name].canonical())])
        )
    );
    return Object.freeze({
        classes: definition.classes,
        byName: Object.freeze(byName),
        toClassModels: () => definition.classes.map(declared => declared.toClassModel()),
        canonical,
        hash: () => sha256Hex(canonical()),
        classHashes: async () => Object.fromEntries(
            await Promise.all(
                Object.keys(byName).sort().map(async name => [name, await byName[name].hash()] as const)
            )
        ),
    });
};
