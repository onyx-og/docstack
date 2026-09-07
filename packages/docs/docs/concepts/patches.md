---
title: "Patches & migrations"
description: "Why the data model ships as versioned patch documents, why a chain applies through one transaction, how deferral behind the document key works, and how the sync gate keeps divergent devices apart."
sidebar_position: 8
sidebar_label: "Patches & migrations"
---

Managing schema changes is where most document databases hand the problem back to the application. DocStack makes the model itself a versioned, replayable artifact.

## System and consumer patches

DocStack's own data model, the `~Job`, `~User`, `~Group` and other system classes, the bootstrap `class` and `domain` models, the seeded admin group and auth module, arrives as **system patches** with `target: "system"`, applied by every stack on open. Seventeen have shipped so far, `0.0.1` through `0.0.17`. An application's model arrives the same way, as **consumer patches** under its own target. Both are `patch` documents; the difference is who wrote them.

Because every device applies both kinds for itself, the documents they seed exist everywhere already and are kept out of replication. What replicates is what binds two instances: the data, and anything created at runtime.

## The ledger

A patch's relationship to *this device* is recorded in a ledger entry: `active: true` means applied, written only after the batch landed; `active: false` means deferred; a flagless entry is a legacy application. The old flow recorded even failed applications as applied, so a refused patch never retried and a device's schema trailed permanently. Now a failed application records nothing, and the next open retries.

The ledger is device-local. Patches ship with the application code, not through the database.

## Why a chain is one transaction

Patches compose: a later one merges into the class an earlier one created. Applying them one by one had two failure modes. A refusal in patch N+1 left patches 1 through N committed, so a device could sit at a version its code did not describe. And the merge composed on disk, class document by class document, with propagation onto existing documents running blind between them.

The chain now stages through one internal transaction. Patch N+1 hydrates against the classes patch N staged, so the merge composes in memory; propagation is validated dry against the staged models, with nothing kept; one commit lands every document as a single batch through the unchanged pipeline, where real propagation runs; the ledger arms for all of them only after. A refusal before commit persists nothing, records nothing, and names the patch, class and attribute at fault. A chain over a fresh class stores its composed schema as one revision.

## Merge, and `null`

A patch says what changed, not what the class is. Its `schema` merges attribute by attribute into the stored one; an attribute set to `null` is dropped, and an absent attribute stays. Restating a whole class used to be the only shape, and a restatement that forgot an attribute silently dropped it, which is how a consumer lost two attributes in a patch that had nothing to do with them. A deliberate drop is now an explicit `null`.

## Deferral behind the key

A locked stack must not write encrypted attributes in the clear. A patch that would write or re-encrypt encrypted data, a seed into an encrypting class, a class-model change whose propagation would rewrite encrypted documents, is therefore held back on a locked stack: recorded as dormant, and replayed in place when `unlock` supplies the key. The same holds per scope: a patch that writes into an access scope the session cannot open waits for `unlockScopes`, which is also why scope material is attempted after the patch chain at open, since a patch may carry the scope documents themselves. Deferral is a barrier, not a filter: patches apply in order and a later one may depend on the schema an earlier one installs, so the first deferral stops the run. A class that does not exist yet still applies locked; there is nothing to re-encrypt.

## One-shot jobs

Some changes need data to move before a model can validate. A patch can carry `preApply` and `postApply` jobs that follow the `~Job` convention but are never persisted as jobs. `preApply` writes are staged into the chain transaction, so a massage and the model land in one commit or not at all; `postApply` runs after commit in a second staged transaction. Their receipts survive a discard, so a failed migration leaves a trail. Patch machinery reads at system level, not through a session's filtered view: a filtered migration would silently transform only the session's subset.

## The sync gate

Two devices on different versions of the model must not replicate freely. A remote records the highest system and consumer patch versions that wrote it; a device compares both before replicating and refuses, with `SyncSchemaMismatchError` naming the scope, when it trails. A deferred device is behind at the gate, because it does not count dormant entries toward its version. The gate sees what patches declare; a model changed by hand at runtime bumps no version, which is a recorded gap on the [roadmap](../contributing/roadmap.md).

An earlier design applied patches through a trigger on a patch class and tracked the version on a system repository document. It no longer exists; the ledger and the chain transaction replaced it.

The decisions are [ADR-0038](https://github.com/onyx-og/docstack/blob/main/specs/adr/0038-a-class-patch-merges-schema-null-drops-an-attribute.md) (merge, `null`), [ADR-0040](https://github.com/onyx-og/docstack/blob/main/specs/adr/0040-sync-while-locked-junction-hazards.md) (locked sync), [ADR-0041](https://github.com/onyx-og/docstack/blob/main/specs/adr/0041-the-patch-ledger-arms-on-active.md) (the ledger), [ADR-0042](https://github.com/onyx-og/docstack/blob/main/specs/adr/0042-a-patch-chain-applies-through-one-internal-transaction.md) (one transaction), [ADR-0043](https://github.com/onyx-og/docstack/blob/main/specs/adr/0043-bulkdocs-class-resolution-ignores-the-batch.md) (a class and its first document in one batch) and [ADR-0044](https://github.com/onyx-og/docstack/blob/main/specs/adr/0044-a-patch-carries-one-shot-jobs.md) (one-shot jobs).
