---
title: "Patch document format"
description: "The fields of a patch, what its docs array may contain, the one-shot job shape, the ledger entry the stack writes, and the refusals."
sidebar_position: 5
---

## `Patch`

```typescript
interface Patch {
    '~class': 'patch';
    _id?: string;
    target: string;
    version: string;
    changelog?: string;
    active?: boolean;
    docs: Document[];
    preApply?: PatchJob;
    postApply?: PatchJob;
}
```

| Field | Meaning |
| :--- | :--- |
| `~class` | Always `"patch"`. |
| `_id` | Optional but recommended: `<target>-<version>` reads well in the ledger. |
| `target` | The application or module the patch belongs to. Set it: the ledger identifies a patch by `target` and `version` together, and a patch without one is recorded under no target. `"system"` is reserved for DocStack's own patches. |
| `version` | Semver. Patches with the same target apply in ascending version order. |
| `changelog` | For humans. |
| `active` | Set `true` in your definitions. In the ledger the stack owns this flag (below). |
| `docs` | The documents to write, in order. |
| `preApply`, `postApply` | One-shot jobs; see below. |

Patches reach the stack through `StackOptions.patches` (or a `StackProvider` config entry) and apply on open, or individually through `stack.applyPatch(patch)`.

## What `docs` may hold

| Entry | Notes |
| :--- | :--- |
| A class model, `'~class': 'class'` | Merged attribute by attribute into a stored class with the same `_id`. An attribute set to `null` is dropped from the model and from every document of the class. Absent attributes stay as stored. |
| A domain, `'~class': 'domain'` | |
| A document of any class | Validated against the class as it stands after the patch's own models are staged. A patch may introduce a class and seed its first documents in the same `docs` array. |
| A document with `_rev: "auto"` | The stored document is fetched and the patch's fields merged over it; the class-model merge rule applies to `schema`. Never reaches storage as `"auto"`. |

Refused at stage time, with an error that names the document: `_local/` documents, `_design/` documents, and nested patch documents.

## `PatchJob`

```typescript
type PatchJob = {
    name: string;
    content: string;        // defines execute(stack, params, job)
    params?: Record<string, any>;
    requiresKey?: boolean;  // default true
};
```

`preApply` runs before the patch's documents stage; its writes are staged into the chain transaction. `postApply` runs after the chain commits, in a second staged transaction. Both leave a `~JobRun` receipt without a `jobId`, carrying `patchVersion`, `patchTarget`, `phase` (`"pre"` or `"post"`) and `jobName` in `runtimeArgs`. A patch that carries a job cannot go through `applyPatch`; it applies through the open-time chain only.

## The ledger entry

After a successful application the stack writes the patch document itself into the database with two additions:

| Field | Meaning |
| :--- | :--- |
| `active: true` | Applied. Written only after the batch landed. |
| `active: false` | Deferred: the patch needs the document key and the stack was locked. Replayed on unlock. Does not count toward the device's schema version. |
| absent | A legacy entry from before the flag; treated as applied. |
| `createTimestamp`, `appliedTimestamp` | When the entry was written, and when a deferred entry was armed. |

On open, a configured patch whose `target` and `version` already have an active ledger entry is skipped; a dormant entry is retried. The ledger is device-local and does not replicate by default (`internalDocs.replicatePatchLedger`).

## Versions the sync gate compares

`stack.getConsumerSchemaVersion()` returns the highest `version` among active, non-system ledger entries, or `null`. The sync layer publishes it, with DocStack's own system version, to the remote's `_local/docstack-sync` document and compares both before replicating. See [Sync options and status](./sync-options.md#syncschemamismatcherror).
