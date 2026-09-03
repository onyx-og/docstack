# ADR-0038 — A class patch merges its schema, and an explicit `null` drops an attribute

Status: accepted · Date: 2026-09-03

Response to two consumer dispatches: the `applySchemaDelta` finding (ADR-0036) and the
merge-not-replace proposal (ADR-0037). The finding's fix is applied with improvements;
the proposal is accepted in its property but not its shape.

## Decision

1. **`applySchemaDelta` applies every entry in the delta.** The `return` inside its loop
   is gone; a schema change touching several attributes propagates to all of them.
2. **An in-place model edit is enforced through the nested delta branch.** jsondiffpatch
   recurses into object values, so editing one config flag on an existing attribute
   produces a *nested* delta, not the `[old, new]` array the old "edit" branch looked
   for - that branch was nearly dead code even before its condition bug. The nested
   branch validates every document against the full new model, taken from the schema
   being written (the delta alone carries only the changed fragment). The `[old, new]`
   branch survives for wholesale replacements and now passes the **new** model, not the
   one on its way out.
3. **"Just created" means no stored version to diff against, not a revision count.**
   Found while pinning the fix: the class branch skipped propagation whenever the
   stored class doc had exactly one revision (`_revisions.ids.length == 1`) - which is
   true right up until the *second* write, so the first schema change a class ever
   received propagated to nothing regardless of the loop bug. The gate is now the
   `not_found` on fetching the previous version. And per-document failures of the
   propagation write - which PouchDB reports in the resolved array, not by rejecting -
   now fail the class write loudly instead of silently dropping one document's
   propagation.
4. **`attributeEffect("add")` stamps `getEmpty()` only onto documents that lack the
   key.** A document already holding a value keeps it; validation still runs against it.
   Under merge semantics, re-declaring an attribute that documents already carry is the
   ordinary repair case, not an exotic one.
5. **Patch hydration merges `schema` attribute by attribute.** A patch states only the
   attributes it changes. An absent attribute stays exactly as stored. An explicit
   `null` entry - `"kind": null` - drops the attribute from the model, and the write's
   propagation then removes it from every document of the class.

## Why this shape and not `addAttributes` / `dropAttributes`

The proposal's property is kept in full: *a patch says what changed, and an omission
can no longer destroy anything*. The vocabulary is not. The traditional `schema` block
stays the only authoring surface:

- **Adding is writing the attribute; editing is restating it.** No second place to
  declare an attribute, no precedence question, no both-keys-present patch to refuse.
- **`null` satisfies "removal must be explicit and named".** An attribute disappearing
  from a model is a line somebody wrote - `"kind": null` in a diff is exactly as
  visible as a `dropAttributes: ["kind"]` line, without a parallel vocabulary.
- **The rename footgun dissolves structurally.** A drop and an add of the same name in
  one patch cannot be written: one key holds either a model or `null`.

Dropping is destructive and stays so: the `null` line is the stated intent, and
propagation removes the attribute from documents as the model change lands. A
model-only retirement ("nothing reads it, existing documents keep it") is what *not*
patching achieves; a `purge` distinction is not carried.

## Consequences

- **Propagation is real for the first time.** Every patch shipped before this change
  was propagating at most one attribute per document - usually zero. This is a
  behavior change worth a release note, not a silent patch: a schema patch now does to
  documents what it says.
- **A historical patch that dropped an attribute by omission no longer drops it** on a
  fresh replay of patch history. That kind of patch was the accident this ADR exists
  to prevent (the consumer's `ws-1.2.0` dropped `Task.kind` by restatement - and its
  `ws-1.5.0` dropped `board`/`bucket` the same way without meaning to). A deliberate
  historical drop must be restated as `"attr": null` to keep its meaning for new
  devices.
- **System patch history is unaffected.** All seventeen auto-rev schema restatements in
  the system patches are strictly cumulative - attribute sets only ever grow - so each
  merges onto the stored schema with identical result. Audited, not assumed.
- **Repair patches are now safe.** Re-declaring an attribute the model lost stamps
  `getEmpty()` only onto documents missing the key; held values survive and are
  validated.
- **A model change documents cannot satisfy is refused.** Tightening an attribute to
  mandatory over documents that lack a value rejects the patch and leaves the model
  unchanged - enforcement, previously skipped with the rest of propagation, now runs.

Pinned by `src-test/schema-propagation.test.ts`: multi-attribute propagation, merge
retention, `null` dropping model and documents, value survival on re-add, and the
nested-delta edit in both its benign and refused directions.
