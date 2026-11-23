import type { Patch } from "@docstack/client/model";

/**
 * The same schema change, written by hand in the ADR-0038 idiom.
 *
 * This is the patch a person writes for "add an encrypted attribute to a class that
 * exists": the merge marker, the one attribute, and nothing else, in the shape the patch
 * guide documents. Compare it with `./generated.ts` - the two differ in two ways, both of
 * which the equivalence test exists to show are behaviourally inert:
 *
 * 1. The generated delta restates `name: "Vault"`; this one does not. A delta merges
 *    shallowly onto the stored class document, so restating an unchanged field is a
 *    no-op - and omitting it must not orphan the document either.
 * 2. Key order: the generator sorts, a person writes in whatever order reads well.
 *
 * What it must *not* differ in is the merge marker. `_rev: "auto"` is the whole
 * difference between merging onto the stored class and replacing it, and a delta without
 * it conflicts (ADR-0037, ADR-0038).
 *
 * `./hand-written-no-id.ts` is the same patch with its own `_id` left off.
 */
const patch_1_1_0: Patch = {
    _id: "equivalence-app-1.1.0",
    "~class": "patch",
    target: "equivalence-app",
    version: "1.1.0",
    changelog: "seal the note body",
    docs: [{
        _id: "Vault",
        "~class": "class",
        _rev: "auto",
        schema: {
            body: {
                name: "body",
                type: "string",
                config: { encrypted: true, defaultValue: "redacted" },
            },
        },
    }],
};

export default patch_1_1_0;
