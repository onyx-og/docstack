---
title: "Transactions"
description: "Why the stage sits above the storage plugin and commits through it, how overlay reads and the validation sweep work, what atomicity DocStack can honestly promise, and what the next version adds."
sidebar_position: 7
---

DocStack writes were always individually validated, but a multi-document logical change had no all-or-nothing story: an order and its lines, a rename touching two classes, an import. The transaction engine gives it one without touching the pipeline every write already goes through.

## Stage above, commit through

A transaction handle keeps a **stage**, an in-memory journal of validated documents. Nothing it does touches the database until commit, and commit is exactly one `stack.db.bulkDocs` through the unchanged authoring pipeline: triggers, relation checks and encryption run exactly as they would for a direct write, on the batch as a whole.

This placement is the whole design. Staging *below* the plugin would have meant re-implementing validation and encryption for the staged path, and a second pipeline drifts. Staging above it means the pipeline stays single and a transaction is a batch with a memory in front of it.

## Stage late

A write is validated when it is staged, against the committed world plus what the stage already holds, so a bad document never enters the journal. The **validation sweep** runs again at commit against the world as it is then. That second sweep is the atomicity boundary: a refusal there persists nothing and leaves the transaction open.

## Overlay reads

Reads through the handle (`t.db.get`, `t.db.find`, `t.findDocuments`, `t.query`) merge the stage over the committed state. When the stage covers a selector entirely the read costs nothing at the storage layer; otherwise the committed query runs unwindowed and the stage is unioned in memory, which is why an overlay read with a hundred staged documents costs more than a plain one. Joins in `t.query` see the overlay on every side. Nothing outside the handle sees the stage: plain reads, other handles, live subscriptions and replication all read committed state.

## Optimistic concurrency

Each staged document records the revision it was staged against. Commit pre-flights every one of them against the stored winner and refuses with `TransactionConflictError` if any moved, whether by a direct write, another transaction or replication. Commits on a stack are serialized so one commit's pre-flight cannot be invalidated by another's write. A refused commit persists nothing; the handle stays open to re-stage or discard.

## Atomicity is reported

A `bulkDocs` batch is atomic only if the storage adapter makes it so. IndexedDB, the default, reports per-document results; the revision pre-flight shrinks the window in which a partial write can happen but cannot eliminate it. So every commit report carries `adapter.atomicBatch`: `true` when the adapter landed the batch as one storage transaction, `false` when results are per document. A partial commit leaves the handle in `status: 'partial'` with only the failed entries retained, so a raced document conflicts on retry instead of being silently overwritten. Reporting the guarantee is the honest alternative to assuming one.

## What cannot be staged

Class models, because their write propagates to other documents mid-pipeline and cannot be staged or rolled back; patches, which have their own transactional path; `_design/` and `_local/` documents. DocStack's own writers, the scheduler, jobs and sync, always write directly.

## Patches ride on it

The same engine is what makes a patch chain all-or-nothing: the chain stages through an internal transaction, propagation is dry-run against the staged models, and one commit lands every class document as a single batch. See [Patches and migrations](./patches.md).

## What is next

A transaction-scoped pipeline facade, so triggers at commit read the transaction's view rather than the committed world; public staging of class models with propagation recomputed at commit; overlay support for `findDocumentsIterator` and `allDocs`; and class-level sugar over the handle. These are recorded as the engine's second version in the [roadmap](../contributing/roadmap.md).

The decision is [ADR-0039](https://github.com/onyx-og/docstack/blob/main/specs/adr/0039-transactions-stage-above-the-plugin-and-commit-through-it.md).
