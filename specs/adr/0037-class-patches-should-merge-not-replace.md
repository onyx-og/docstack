# Proposal — a class patch should say what changed, not restate the class

Status: accepted in property, different shape — see ADR-0038 · Date: 2026-09-03

**For dispatch to the DocStack repository.** Written from a consumer that lost two
attributes off a class in a patch that had nothing to do with them, and did not find out
for three weeks.

**A patch that changes a class model replaces the whole model.** There is no way to add one
attribute without rewriting the other twenty, and the failure mode of getting that wrong is
silent, delayed, and destructive in exactly the place a schema is supposed to protect.

---

## What happens today

`applyPatch` hydrates each patch document by merging it over the one already stored:

```js
let doc = Object.assign({}, sourceDoc);
if (doc._rev === "auto") {
    delete doc._rev;
    const existingDoc = await this.db.get(doc._id);
    if (existingDoc) {
        doc = Object.assign(Object.assign({}, existingDoc), doc);   // ← shallow
    }
}
```

The merge is shallow and `schema` is one key, so a patch carrying

```ts
{ _id: 'Task', '~class': 'class', schema: { name: …, priority: … } }
```

leaves the class with exactly those two attributes. Everything the previous version
declared is gone.

That is a reasonable primitive. It is a poor **authoring interface**, because the thing a
patch is nearly always expressing is *"one more attribute"*, and expressing it requires
copying a definition that is already in the file three patches up.

## How it went wrong here

`ws-1.5.0` added `Task.priority` and a `TaskComment` class. It was written by copying the
most recent `Task` restatement the author had to hand — which was `ws-1.0.x`, from before
`ws-1.1.0` introduced boards. The patch therefore declared a `Task` **without `board` and
`bucket`**, which had been part of the model for four versions and are the whole of how
[boards](https://example.invalid) work in that product.

Nothing failed. Writes still carried the attributes, reads still found them, the board
views kept working, and a code review of the patch — which is a wall of forty lines that
look exactly like the forty lines above it — did not catch a two-line absence in the
middle.

What it cost was two loaded guns:

1. **`importContent` strips what the class does not declare.** Exporting the workspace and
   importing it back would have dropped every board membership in it, with one
   `unknown-attribute` issue per document in a list nobody reads on a successful import.
2. **Class-model propagation deletes the attribute from every existing document.**
   `applySchemaDelta` → `attributeEffect("delete")` → `delete doc[attribute.name]`. That
   this did not happen is luck, not design — see the companion finding on
   `applySchemaDelta`, which returns from inside its own loop and so applies at most one
   attribute's delta per document.

The consumer found it four weeks later, while checking a documentation table against the
source for an unrelated feature.

## What is proposed

**A patch should be able to express a change to a class rather than a replacement of one.**
The shape matters less than the property; one that fits the existing document model:

```ts
{
    _id: 'Task',
    '~class': 'class',
    _rev: 'auto',
    // Merged into the stored schema, attribute by attribute.
    addAttributes: { priority: int('priority', { min: 1, max: 3 }) },
    dropAttributes: ['kind'],
}
```

A patch carrying `schema` keeps today's meaning — full replacement — so nothing already
written changes behaviour. A patch carrying `addAttributes` / `dropAttributes` merges. The
two are mutually exclusive and a patch carrying both should be refused at load rather than
resolved by precedence.

### Deleting an attribute is the half that needs the care

This is the part a naive "just merge `schema`" gets wrong, and it is why the proposal is
not simply *make the merge deep*. Under a deep merge there is **no way to remove an
attribute at all** — and removal is a thing patches legitimately do. In this same consumer,
`ws-1.2.0` dropped `Task.kind` by restating the class without it; under a deep merge that
patch would silently have kept `kind` forever, which is the same class of bug in the
opposite direction.

So removal must be **explicit and named**, never inferred from an absence:

- **`dropAttributes` is a list of names**, so the intent is visible in a diff. An attribute
  disappearing from a model should be a line somebody wrote, not a line somebody forgot.
- **Dropping is destructive and should say so.** Today `attributeEffect("delete")` removes
  the attribute from every existing document as the model propagates. That is defensible as
  the meaning of *drop*, but it is currently reached by accident; reached deliberately it
  wants a second word in the patch — `dropAttributes` for the model alone, leaving the data
  in place as `002` describes for `kind` ("documents written before the patch keep the
  attribute and nothing reads it"), and something like `purgeAttributes` for the version
  that also rewrites documents.
- **A drop of an attribute that other patches later re-add** must be ordered by version and
  not by document order, which is already true of patch application and should be stated
  for attributes too.
- **A drop and an add of the same name in one patch** is a rename with no data movement,
  and should be refused rather than quietly meaning "delete then create empty".

### Why `getEmpty()` on add deserves a look at the same time

Re-adding an attribute propagates `attributeEffect("add")`, which does

```js
doc = Object.assign({}, doc, attribute.getEmpty());       // { board: null }
```

over documents that may already hold a value, and `null` is not a legal foreign key in this
schema. Under merge semantics, "add an attribute that some documents already carry" stops
being an exotic case and becomes the ordinary one — a repair patch restoring `board` is
exactly that — so `add` should leave an existing value alone and only stamp the empty onto
documents that lack the key.

## Why it is worth doing

The current interface makes the safest patch (adding one field) require the most dangerous
edit (rewriting a class definition from memory), and pays for a mistake in a currency the
author cannot see: the model diverges from the documents, everything keeps working, and the
bill arrives at the next import or the next propagation.

Merging inverts that. A patch that adds one attribute is one line, a patch that drops one
is one line, and a class model is no longer something each patch author has to reproduce
correctly from the file's own history.

## What the consumer did meanwhile

Corrected `ws-1.5.0` in place rather than shipping a repair patch, and recorded what that
does not fix: `applyPatches` skips any version at or below the one a device has recorded,
so a device that already applied the broken `1.5.0` keeps the broken model until something
else moves it. A repair patch would have reached those devices and would have needed the
`getEmpty()` question above answered first.

## Resolution (upstream)

Accepted in its property, declined in its vocabulary - see ADR-0038. The `schema` block
stays the only authoring surface: hydration now merges it attribute by attribute, an
absent attribute stays as stored, and an explicit `null` entry (`"kind": null`) is the
drop - as visible in a diff as `dropAttributes` would have been, without a parallel
vocabulary, and structurally incapable of the drop-plus-re-add rename footgun (one key
cannot hold both a model and `null`). Dropping propagates deletion to documents, which
is what the written `null` line states; a model-only retirement is achieved by not
patching. The `getEmpty()` question is answered as asked: `add` stamps the empty value
only onto documents that lack the key, so the repair patch this consumer needs is now
safe to ship - held `board`/`bucket` values survive and are validated. One migration
note: a *historical* patch that dropped an attribute by restatement no longer drops it
on a fresh replay; a deliberate drop must be restated as `null`.
