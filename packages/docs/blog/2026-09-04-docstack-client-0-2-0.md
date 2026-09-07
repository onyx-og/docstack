---
slug: docstack-client-0-2-0
title: "@docstack/client 0.2.0: named transactions, transactional patch chains, one-shot migration jobs"
description: "What changed in @docstack/client 0.2.0, and what to do about remotes written by 0.1.8."
authors: [onyx]
tags: [release, client]
date: 2026-09-04
---

`@docstack/client` 0.2.0 is on npm. It adds named write transactions, makes every consumer patch chain apply as one all-or-nothing batch, lets a patch carry one-shot migration jobs, and closes a security defect in replication that 0.1.8 introduced. This post walks through what changed and what it means for an application on 0.1.x.

<!-- truncate -->

## Named write transactions

Opt in per stack with `transactions: true`. A handle from `stack.beginTransaction()` stages validated writes in memory; reads through the handle (`t.db.get`, `t.db.find`, `t.findDocuments`, `t.query` including `JOIN`s) see the staged state overlaid on committed state, while plain reads, other handles, live subscriptions and replication see committed state only.

```typescript
const stack = await ClientStack.create('my-app', { transactions: true });

const t = stack.beginTransaction();
const order = await t.createDoc(null, 'Order', { customerId, total: 0 });
for (const line of lines) {
    await t.createDoc(null, 'OrderLine', { orderId: order._id, ...line });
}
const report = await stack.commit(t);
```

`stack.commit(t)` flushes the journal as one batch through the full authoring pipeline: triggers, relation checks and encryption all run. A write that fails validation stages nothing, and a batch with one bad document unwinds entirely. Commit re-checks every staged document's base revision against the stored winner and refuses with `TransactionConflictError` if something changed underneath, persisting nothing and leaving the transaction open to re-stage or discard.

Atomicity is reported, not assumed. The commit report carries `adapter.atomicBatch`: adapters that land a batch as one storage transaction report `true`; IndexedDB reports `false`, with a revision pre-flight that shrinks the window without eliminating it. A partial commit leaves the handle in `status: "partial"` with only the failed entries retained.

Measured in a real browser against IndexedDB, 100 documents: staging costs 0.43 ms per document with zero backend queries, commit lands at parity with the equivalent non-transactional batch write, empty-stage overlay reads cost the same as plain reads, and a refused commit costs about a millisecond. The reasoning is in [ADR-0039](https://github.com/onyx-og/docstack/blob/main/specs/adr/0039-transactions-stage-above-the-plugin-and-commit-through-it.md); the guide is [Write transactions](/docs/guides/transactions).

## Security: replication no longer pushes encrypted attributes in plaintext

PouchDB hard-binds its instance methods, so the pristine `bulkGet` the sync layer read through re-entered the plugin's decrypting `get` for every revision it fetched. Every push since the decrypt-on-read restoration in 0.1.8 therefore delivered plaintext to the remote under the local revision id, while the local database stayed ciphertext.

The `get` override now serves the stored form for any revision-addressed read (`{ rev }` or `{ open_revs }`); winning-revision reads still decrypt. A test pins remote ciphertext with zero plaintext in the serialized document.

**Remotes written by client 0.1.8 should be treated as having held plaintext for encrypted attributes.** Re-create or purge them. Details in [ADR-0040](https://github.com/onyx-og/docstack/blob/main/specs/adr/0040-sync-while-locked-junction-hazards.md).

## Every consumer patch chain is transactional

The pending chain of application patches now stages through one internal transaction. Patch N+1 hydrates against the classes patch N staged, so the attribute-by-attribute merge introduced in 0.1.8 composes in memory; propagation onto existing documents is validated dry with nothing kept; and one commit lands every document as a single batch through the unchanged pipeline. The patch ledger arms only after that commit.

Consequences worth knowing:

- A chain is all-or-nothing. A later patch's failure persists nothing and arms nothing, including earlier valid patches. Before 0.2.0 they committed one by one.
- A refusal before commit names the patch, class and attribute at fault.
- A patch can carry class models, `_rev: "auto"` data massages, seed documents and one-shot jobs at once.
- Consumer patch documents now meet the transaction sweep's refusals: `_local/` documents, `_design/` documents and nested patch documents are rejected loudly rather than stored silently.

`stack.applyPatch(patch)` and DocStack's own system patches are untouched. See [ADR-0042](https://github.com/onyx-og/docstack/blob/main/specs/adr/0042-a-patch-chain-applies-through-one-internal-transaction.md) and [ADR-0043](https://github.com/onyx-og/docstack/blob/main/specs/adr/0043-bulkdocs-class-resolution-ignores-the-batch.md), which also fixed a class-resolution bug: a patch can now introduce a class and seed its first document in the same batch.

## One-shot jobs in patches

A patch may declare `preApply` and `postApply` jobs. `preApply` massages data through the chain transaction's facade, staged, so the massage and the model land in one commit or not at all. That makes migrations that previously refused, such as tightening a type, converting a value, renaming an attribute honestly, or backfilling a foreign key, actionable for the first time. `postApply` backfills after the models land, in a second staged transaction. The ledger arms only after both.

Jobs follow the `~Job` content convention (`execute(stack, params, job)`), are never persisted as `~Job` documents, and leave `~JobRun` receipts whether they win or lose, so a failed migration's trail survives the discard. An undeclared job defers while the stack is locked; `requiresKey: false` opts into locked execution behind two runtime nets. See [ADR-0044](https://github.com/onyx-og/docstack/blob/main/specs/adr/0044-a-patch-carries-one-shot-jobs.md) and the [patches guide](/docs/guides/patches).

## Fixes

- **Sync while locked, three junctions closed** (ADR-0040). The schema gate now publishes and compares the highest applied consumer patch version alongside the system version, so a device whose application patches trail the remote refuses with `SyncSchemaMismatchError { scope: "consumer" }` instead of pulling documents its schema cannot describe, and passes once unlock replays the deferral. Class-model patches over a class with encrypted attributes now defer while locked, like the data patches they propagate onto.
- **The ledger arms on `active`** ([ADR-0041](https://github.com/onyx-og/docstack/blob/main/specs/adr/0041-the-patch-ledger-arms-on-active.md)). A ledger entry is written with `active: true` only at the moment of successful application. The old flow recorded failed applications as applied, so a refused patch never retried and the device's schema trailed permanently. A patch deferred behind the document key persists as a dormant entry (`active: false`) that the unlock replay arms in place.
- **A relation written in the same batch as its endpoint no longer fails the endpoint check.** The plugin resolves batch-mates before declaring an endpoint missing.
- **`logLevel` no longer leaks into the PouchDB constructor.**

## Since 0.1.6

If you are coming from 0.1.6, two intermediate releases landed in between.

**0.1.7** added `JobScheduler` (`stack.jobScheduler`): jobs that run with nobody watching, under the constraints a client imposes. Missed occurrences collapse into one run, the grammar (`@every 6h`, `@daily@09:00`) refuses cron because a client cannot promise to be awake at a named occurrence, and schedule state lives in `_local/docstack-job-schedule` rather than on the replicating job document. The scheduler is created with the stack and not started by it: `start({ jobs: [...] })` is an allow-list with no "all". Abandoned `RUNNING` runs are reaped on every tick. See [ADR-0031](https://github.com/onyx-og/docstack/blob/main/specs/adr/0031-scheduling-jobs-on-a-client.md).

**0.1.8** made schema propagation real: `applySchemaDelta` used to return from inside its loop, so a class-model change propagated to at most one attribute per document. Every delta entry now applies, and a patch's `schema` merges attribute by attribute instead of replacing the stored schema wholesale; an explicit `"attr": null` drops an attribute ([ADR-0038](https://github.com/onyx-og/docstack/blob/main/specs/adr/0038-a-class-patch-merges-schema-null-drops-an-attribute.md)). Single-document reads decrypt again after a `get` override had been silently commented out ([ADR-0032](https://github.com/onyx-og/docstack/blob/main/specs/adr/0032-reads-decrypt-policies-arm-on-active.md)). A stack added after `sync()` now joins the running replication, and `DocStack.getSyncCoverage()` reports which open stacks a sync covers ([ADR-0034](https://github.com/onyx-og/docstack/blob/main/specs/adr/0034-late-stacks-join-a-running-sync.md)).

## Upgrading

```bash
npm install @docstack/client@0.2.0 pouchdb-browser pouchdb-find
```

`pouchdb-browser` and `pouchdb-find` are peer dependencies at `^9`. TypeScript consumers resolve `@docstack/shared` at `^0.1.0` through the published type declarations. Pair with `@docstack/pouchdb-adapter-googledrive` 0.1.6 or later when syncing through Drive.

The full list is in the package [CHANGELOG](https://github.com/onyx-og/docstack/blob/main/packages/client/CHANGELOG.md); the decisions behind it are in [`specs/adr/`](https://github.com/onyx-og/docstack/tree/main/specs/adr).
