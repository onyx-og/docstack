---
title: "Sync options & status"
description: "Every option of stack.sync and docstack.sync, the status object, the handle methods and events, the schema-gate error, and the write guard."
sidebar_position: 4
sidebar_label: "Sync options & status"
---

## `stack.sync(options)` → `StackSyncHandle`

| Option | Type | Default | Meaning |
| :--- | :--- | :--- | :--- |
| `remote` | `RemoteResolver` | required | A URL, a `PouchDB.Database`, or `(stack) => url or database`, sync or async. Called again on every `restart()`. |
| `direction` | `"push"`, `"pull"`, `"both"` | `"both"` | |
| `live` | boolean | `true` | Keep following changes. |
| `retry` | boolean | `true` | Reconnect with PouchDB's backoff after a transient failure. |
| `batchSize` | number | PouchDB's | Documents per batch (`batch_size`). |
| `batchesLimit` | number | PouchDB's | Concurrent batches (`batches_limit`). |
| `heartbeat` | number or `false` | PouchDB's | Changes-feed heartbeat, ms. |
| `timeout` | number or `false` | PouchDB's | Changes-feed timeout, ms. |
| `classes` | `ClassFilterOptions` | all classes | Which classes replicate (below). |
| `filter` | `(doc) => boolean` | none | An extra pure predicate, ANDed with everything else. Identified by its source text for checkpointing. |
| `internalDocs` | `InternalDocFilterOptions` or `false` | DocStack's defaults | Which of the stack's own documents stay local. `false` replicates everything. |
| `checkSchemaVersion` | boolean | `true` | Refuse a remote last written by a newer schema. |

### `ClassFilterOptions`

| Field | Default | Meaning |
| :--- | :--- | :--- |
| `include` | all | Replicate only these classes. Matched against `~class` and against a relation's `sourceClass`/`targetClass`. |
| `exclude` | none | Never replicate documents of these classes. Applied after `include`. The class models themselves still replicate; add a model's id to `internalDocs.extraDocIds` to keep it local too. |
| `includeDataModel` | `true` | Keep `DATA_MODEL_CLASSES` (`class`, `~self`, `domain`, `~User`, `~Group`, `~AuthModule`, `~Job` and the rest) when `include` is set. |

### `InternalDocFilterOptions`

| Field | Default | Meaning |
| :--- | :--- | :--- |
| `replicateSessions` | `false` | Replicate `~UserSession` documents. |
| `replicateSystemDocuments` | `false` | Replicate the documents the system patches seed. |
| `replicatePatchLedger` | `false` | Replicate the local `patch` ledger. |
| `ephemeralClasses` | from the stack's class models | Classes whose documents never travel. Filled in by `stack.sync()`. |
| `extraSeededDocIds` | from the configured patches | Ids the application's patches seed. Filled in by `stack.sync()`. |
| `extraDocIds` | none | Additional exact ids to keep local. |
| `extraIdPrefixes` | none | Additional id prefixes to keep local. |
| `extraClasses` | none | Additional `~class` values to keep local. |

The lists these extend are in [What stays on the device](./internal-documents.md).

### `StackSyncHandle`

| Member | Meaning |
| :--- | :--- |
| `getStatus()` | The current `SyncStatus`. |
| `getRemote()` | The resolved remote database, or `null` before `start()`. |
| `start()` | Resolve `remote` and begin replicating. Called by `stack.sync()`. |
| `cancel()` | Stop. |
| `restart()` | `cancel()` then `start()`, resolving `remote` again. Counters and `lastConvergedAt` survive. |
| `waitForConvergence(timeoutMs = 30000)` | Resolves with the status when a cycle finishes with nothing left to send; rejects on timeout. |

Events dispatched on the handle (`CustomEvent`, payload in `detail`): `status` (the status object), `change` (`{ direction, change }`), `idle` (the status), `error` (the last error), `denied` (the last error), `complete` (PouchDB's completion info, one-shot replication). The stack itself dispatches `sync-status` with the status object, which is what `useSyncStatus` subscribes to.

Related stack methods: `stack.getSyncHandle()`, `stack.getSyncStatus()`, `stack.cancelSync()`, `stack.getConsumerSchemaVersion()`.

## `SyncStatus`

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `stack` | string | The stack name. |
| `state` | `"stopped"`, `"starting"`, `"active"`, `"idle"`, `"error"`, `"denied"` | `error` is usually transient; `denied` means the remote refused a write, typically an expired or under-scoped credential. |
| `direction` | `"push"`, `"pull"`, `"both"` | |
| `live` | boolean | |
| `lastConvergedAt` | number or `null` | When a cycle last completed with nothing left to send. The value to render as "last synced". |
| `lastActiveAt` | number or `null` | When documents last moved, either direction. |
| `lastError` | `{ name?, message, status? }` or `null` | The last failure, kept after recovery. |
| `pushed`, `pulled` | number | Documents written to the remote, and locally, since this handle started. |

## `docstack.sync(options)` → `DocStackSyncHandle`

Every `stack.sync` option except `remote`, plus:

| Option | Meaning |
| :--- | :--- |
| `remote` | A `RemoteResolver`; the function form is called once per stack. |
| `stacks` | Names of the stacks to bind. Omit to bind every open stack **and** every stack added later (`addStack`). |
| `tenants` | A tenant entitlement compiled into per-stack class rules; stacks outside the scope are not synced at all. Cannot be combined with `classes`. |

`DocStackSyncHandle`: `handles` (a `Map` of stack name to `StackSyncHandle`), `names`, `getStatus()` (a map of statuses), `getLastConvergedAt()` (the oldest convergence across stacks, or `null`), `cancel()`, `restart()`, `remove(name)`. It re-dispatches each handle's `status` event.

Related: `docstack.getSyncHandle()`, `docstack.getSyncCoverage()` → `{ bound, unbound }`, `docstack.cancelSync()`.

## `SyncSchemaMismatchError`

Thrown by `stack.sync()` before anything replicates when the remote was last written by a newer schema.

| Field | Meaning |
| :--- | :--- |
| `stack` | The stack that refused. |
| `scope` | `"system"` (DocStack's own patches; update the application) or `"consumer"` (the application's patches; apply them, or unlock so deferred ones replay). |
| `localVersion` | What this device has applied, or `undefined`. |
| `remoteVersion` | What the remote was last written with. |

The remote's record is the `_local/docstack-sync` document (`SYNC_META_DOC_ID`), shared by every device that opens that remote and never replicated. `readRemoteSchemaVersion`, `readRemoteConsumerSchemaVersion` and `publishSchemaVersion` are exported for tooling.

## `StackWriteGuardError`

Thrown by `stack.db` when application code tries to write around the authoring path: `bulkDocs` or `put` with `new_edits: false` or `force: true`, or any of the `_`-prefixed adapter methods (`_bulkDocs`, `_put`, `_remove`, `_bulkGet`). `method` names what was called. The message points at `stack.sync()`.

## Filter identity helpers

`createReplicationFilter(options)`, `createClassFilter(options)`, `withFilterIdentity(filter, identity)` and `describeFilter(filter)` are exported for applications that build replication filters by hand. A filter's identity is derived from its configuration, so PouchDB checkpoints resume across restarts when the configuration is unchanged and re-scan from the beginning when it changes.
