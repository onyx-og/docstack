import { AttributeModel, ClassModel } from "../../../types.js";
import { canonicalJson } from "./canonical.js";
import { ClassDefinition, ModelDefinition } from "./define.js";
import { FoldedChain } from "./fold.js";

/** What a generated patch should carry, and what the generator refuses to decide. */
export type ModelDiff = {
    /**
     * The documents a patch should carry, class names in sorted order so the generated
     * file is stable across runs.
     *
     * A class the chain has never seen arrives as a full model; one it already produces
     * arrives as a **delta** carrying `_rev: "auto"`, which is how the engine merges it
     * (ADR-0038).
     */
    docs: ClassModel[];
    /** Declared classes the chain already produces identically. */
    unchanged: string[];
    /**
     * What the generator will not emit, with the reason.
     *
     * A class the chain produces and the code model no longer declares is the case that
     * lands here: removing a class has no defined semantics yet, so it is reported for a
     * human rather than guessed at (`proposal.md` §6.2).
     */
    warnings: string[];
};

/** Class-level fields a delta may restate; `schema` is handled per attribute. */
const CLASS_FIELDS = ["description", "parentClass", "ephemeral"] as const;

/**
 * The attribute-level delta between a stored schema and a declared one.
 *
 * @param stored - The schema the folded chain produces.
 * @param declared - The schema the code model declares.
 * @returns Entries to write: a full {@link AttributeModel} for an attribute that is new
 * or changed, and `null` for one the model no longer declares, which is how a patch
 * drops it. Empty when the two agree.
 */
const schemaDelta = (
    stored: ClassModel["schema"],
    declared: ClassModel["schema"]
): Record<string, AttributeModel | null> => {
    const delta: Record<string, AttributeModel | null> = {};
    for (const name of Object.keys(declared).sort()) {
        // Compared canonically and in full, descriptions included: unlike the model
        // hash, which ignores cosmetic fields because it gates replication, a patch has
        // to carry a changed description or the stored model never gets it.
        if (canonicalJson(stored?.[name]) !== canonicalJson(declared[name])) {
            delta[name] = declared[name];
        }
    }
    for (const name of Object.keys(stored ?? {}).sort()) {
        if (!(name in declared)) delta[name] = null;
    }
    return delta;
};

/**
 * Diffs a code-defined model against a folded patch chain and reports what a patch
 * should carry.
 *
 * Pattern: Strategy - the emission rules live here, so the CLI only writes files
 * (`proposal.md` §6.2).
 *
 * @param folded - The baseline, from `foldPatchChain`.
 * @param model - The model the application declares in code.
 * @returns The documents to emit, what was unchanged, and what was refused.
 *
 * @example
 * ```typescript
 * const diff = diffModel(foldPatchChain(PATCHES), model);
 * if (!diff.docs.length) console.log("model and chain agree");
 * ```
 */
export const diffModel = (folded: FoldedChain, model: ModelDefinition): ModelDiff => {
    const docs: ClassModel[] = [];
    const unchanged: string[] = [];
    const warnings: string[] = [];

    const declaredByName: Record<string, ClassDefinition> = {};
    for (const declared of model.classes) declaredByName[declared.name] = declared;

    for (const name of Object.keys(declaredByName).sort()) {
        const declared = declaredByName[name];
        const next = declared.toClassModel();
        const stored = folded.classes[name];

        if (!stored) {
            // A class the chain has never produced: the whole model, as an insert.
            docs.push(next);
            continue;
        }

        const delta = schemaDelta(stored.schema ?? {}, next.schema ?? {});
        const changedFields = CLASS_FIELDS.filter(
            field => canonicalJson((stored as any)[field]) !== canonicalJson((next as any)[field])
        );

        if (!Object.keys(delta).length && !changedFields.length) {
            unchanged.push(name);
            continue;
        }

        // `_rev: "auto"` is the engine's marker for "merge me over what is stored"; a
        // delta written without it would be a fresh insert and would conflict.
        const doc: Record<string, unknown> = {
            _id: next._id,
            _rev: "auto",
            "~class": next["~class"],
            name: next.name,
        };
        for (const field of changedFields) doc[field] = (next as any)[field];
        if (Object.keys(delta).length) doc.schema = delta;
        docs.push(doc as unknown as ClassModel);
    }

    for (const name of Object.keys(folded.classes).sort()) {
        if (name in declaredByName) continue;
        warnings.push(
            `Class '${name}' is produced by the patch chain but the model no longer declares it. ` +
            "Class removal has no defined semantics yet, so nothing is emitted for it: " +
            "drop it by hand if that is what you mean."
        );
    }

    return { docs, unchanged, warnings };
};
