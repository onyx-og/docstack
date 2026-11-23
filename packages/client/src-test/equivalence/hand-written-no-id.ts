import type { Patch } from "@docstack/client/model";

/**
 * The same hand-written delta with no `_id` of its own.
 *
 * The documented shape carries one (`./hand-written.ts`), and so does generated output -
 * but the engine never needs it: the ledger finds an entry by `~class`, `target` and
 * `version`, and records a new one with `db.post`, which is the "let the database name
 * it" call. Patches written this way are all over this repository's own suite, so the
 * tolerance is worth pinning rather than assuming: the only thing it changes is what the
 * ledger document ends up called.
 *
 * The cast is the point of the file. `Patch extends Document`, and a document's `_id` is
 * required, so the type describes the documented shape and this one is outside it while
 * the engine accepts it. Asserted, not fixed: narrowing the type would be a judgement
 * about the authored-versus-stored distinction that no ADR has made.
 */
const patch_1_1_0_no_id = {
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
} as unknown as Patch;

export default patch_1_1_0_no_id;
