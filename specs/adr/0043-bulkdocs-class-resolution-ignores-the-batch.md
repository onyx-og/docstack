# Finding — `bulkDocs` resolves class models with a database read, so a patch cannot introduce a class and seed its first document in one batch

Status: fixed · Date: 2026-09-04

**For dispatch to the DocStack repository.** Found in `@docstack/client` 0.2.0 while
replaying a deferred consumer patch on a fresh install; the failing patch carried a class
model and one document of that class in the same `docs` array.

## The defect

In the plugin's `bulkDocs` (`src/plugins/pouchdb.ts`), the document branch resolves the
class model like this:

```ts
classObj = classCache.get(className) || await stack.getClassSnapshot(className);
```

`getClassSnapshot` reads the database. When the class model is part of the **same
uncommitted batch** — which is precisely what `applyPatch` produces, since it writes a
patch's whole `docs` array in one `bulkDocs` call — the read finds nothing and the write
fails:

```
Class 'TaskSeries' not found for document 'TaskSeries-patch-marker'.
```

The relation branch a few lines above solved this exact problem for its endpoints, and
says why (ADR-0039): *"a relation written together with its documents in one bulkDocs —
which is exactly what a transaction commit is — checks the batch before declaring the
endpoint missing."* The document branch never got the same courtesy, so the batch is
transactional for relations and not for classes.

## Why it surfaces now and not before

The old `applyPatch` (0.1.8) rejected on a failed batch but **kept executing**, recording
the patch as applied — so a patch that hit this defect failed once, silently, and was
never retried: the schema quietly trailed, which is the ADR-0041 story. Under 0.2.0 the
ledger is truthful, the deferred entry stays dormant, and the replay retries on every
unlock — which turns this defect from an invisible one-time data loss into a visible
permanent failure. That is the correct direction; it just makes this the next defect in
line.

`~sys` patches dodge it by never seeding a document of a class born in the same patch
against the plugin's validation path (and the base classes exist before anything else
runs). Consumer patches have no such guarantee, and the transaction engine commits
arbitrary compositions through the same code.

## Proposed fix

Mirror the endpoint rule: when the cache and the store both miss, look for the class
model **in the batch being written** before failing —

```ts
let classObj = classCache.get(className) || await stack.getClassSnapshot(className).catch(() => null);
if (!classObj) {
    const mate = documentsToProcess.find(d => isClassModel(d) && (d.name ?? d._id) === className && !d._deleted);
    if (mate) classObj = new Class(stack, mate);          // however a snapshot is normally built
}
if (!classObj) throw new Error(`Class '${className}' not found for document '${doc._id}'.`);
```

Ordering within the batch does not matter with this rule (the search sees the whole
array), and a class model arriving in the batch is by construction the newest statement
of the schema, so validating against it is not a staleness risk. The one subtlety worth a
test: a batch that both *drops* an attribute (ADR-0038 `null`) and writes a document
still carrying it should behave the same whether the model change is in the batch or
already stored.

## Reproduction

One patch: `docs: [ <class model X>, <document of class X> ]`, applied through
`applyPatch` (directly, or as a deferred consumer patch replayed by `unlock`). Every
attempt fails with `Class 'X' not found`, and under ADR-0041 the ledger correctly keeps
the patch dormant forever.

## Consumer impact meanwhile

Tokido hit this through a patch that carried a (redundant, since 0.2.0) deferral-marker
document of the class the patch itself introduces; the marker is removed, so no shipped
Tokido patch composes a class with its own documents any more. The constraint is easy to
respect once known — *a patch may seed documents only of classes that already exist* —
but nothing states it, and the transaction engine invites exactly this composition.

## Resolution (upstream)

Fixed as proposed, with the resolution order sharpened: the document branch now
checks the **batch first** - not only on a store miss - because a class model riding
the batch is the newest statement of the schema and is what is about to be
committed; the search sees the whole array, so ordering within the batch does not
matter. The constraint dissolves: a patch may introduce a class and seed its
documents in one `docs` array.

On `_rev: "auto"`: patch vocabulary only, by ruling - it never reaches `bulkDocs`,
because `applyPatch` and the chain's staging both hydrate first, so a batch-mate is
always the full merged model with a real revision (the drop-and-carry test's class
doc is exactly an `"auto"` fragment, hydrated). The plugin carries no handling for
the marker: a shape that cannot legitimately arrive earns no logic.

One trap the suggested sketch would have hit, found by the first test run:
`Class.buildFromModel` routes a **rev-less** model through `Class.create`, which
*writes* the class document - the batch's own insert then conflicts with it. The
batch-mate snapshot is built detached instead (`Class.get` + `setModel`, the same
path `buildFromModel` takes for stored docs), memoised in the per-call class cache
so a failed batch poisons nothing.

Pinned in `stack-patches.test.ts`: the one-batch class-plus-seed patch applies (the
exact reproduction); a seed document failing validation against the class born
beside it refuses the whole patch, class included, with nothing recorded
(ADR-0041); and the drop-and-carry subtlety - the batch-resolved model and the
stored model judge a carried, dropped attribute identically.
