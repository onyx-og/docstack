---
title: "What stays on the device"
description: "The documents DocStack keeps out of replication by default, the ones it optionally replicates, and the options that widen or narrow the list."
sidebar_position: 6
---

Every stack writes documents that describe *this device's copy* of the database rather than its contents. Replicating them is never right: two devices each write their own, so they collide on identical ids with unrelated revisions. The sync layer filters them automatically. This page is the list.

## Always local

| Kind | Match | Why |
| :--- | :--- | :--- |
| id | `~system` | Carries this database's `schemaVersion`, `dbInfo` and `startupTime`, read on every mount. A peer's copy would claim patches this device has not applied. |
| id | `~crypto-engine-config` | Pins a database to its encryption setting and holds the key canary. A peer's copy says nothing about this one. |
| id | `lastDocId` | A local id counter, vestigial since ids became random. |
| prefix | `_local/` | PouchDB never replicates local documents. Listed so the predicate is usable outside a replication filter. |
| prefix | `_design/` | Mango indexes, built on demand per device. |
| prefix | `~lock-` | Guards an in-flight class-model propagation on this device. |
| prefix | `~log-` | This client's own diagnostic records. |
| class | `~lock` | The propagation lock document. |
| class | `~JobRun` | Records that this client ran a job. Both devices write their own. |
| class | any class declared `ephemeral` | Documents describe one run of one client. Filled in from the stack's own class models. |
| shape | no `~class`, no `~domain`, and a `log` field with `level` and `message` | Log records written before they carried a prefix. |

## Seeded everywhere, so sent nowhere

Patches are applied by every client independently, so every document they seed already exists on every client: DocStack's own class models, `Group-Admin`, `AuthMod-Classic`, the bootstrap `class` and `domain` models, the `system` user. Sending them costs quota and invites conflicts, two devices writing the same id independently, for no information gained. Their ids are derived from the system patches at build time (`SYSTEM_SEEDED_DOC_IDS`) and kept local; the ids seeded by the application's own patches are added the same way when `stack.sync()` runs.

The distinction that matters is not "is this DocStack's own?" but "can the peer already reconstruct this?". A user created at runtime, a group an administrator added, an application-created document of any of DocStack's classes: those bind two instances together and always replicate.

## Local by default, replicable on request

| Class | Option to replicate it |
| :--- | :--- |
| `~UserSession` | `internalDocs: { replicateSessions: true }` |
| `patch` (the ledger of applied patches) | `internalDocs: { replicatePatchLedger: true }` |
| the seeded documents above | `internalDocs: { replicateSystemDocuments: true }` |

## Widening the list

```typescript
stack.sync({
    remote,
    internalDocs: {
        extraDocIds: ['Draft'],          // keep a class model local too
        extraIdPrefixes: ['~scratch-'],  // anything with this id prefix
        extraClasses: ['Scratch'],       // anything with this ~class
    },
});
```

`extraDocIds`, `extraIdPrefixes` and `extraClasses` add to the lists above. `extraSeededDocIds` marks ids the application's patches seed; `stack.sync()` fills it in from the configured patches, so it is rarely set by hand.

`internalDocs: false` replicates everything, `~system` included. It exists for stack-to-stack mirroring of a whole database and is otherwise a bad idea.

## The data model rides along

When `classes.include` narrows replication to an allow-list, the class models, domains, users, groups, auth modules and job definitions ride along automatically, so the remote stays a database the next device can open. `includeDataModel: false` turns that off. The full list is exported as `DATA_MODEL_CLASSES`. See [Filter what replicates](../guides/filtering.md).

## Exports

`@docstack/client` exports the constants and predicates so an application can apply the same judgement outside replication: `INTERNAL_DOC_IDS`, `INTERNAL_DOC_ID_PREFIXES`, `INTERNAL_DOC_CLASSES`, `OPTIONAL_INTERNAL_DOC_CLASSES`, `SYSTEM_SEEDED_DOC_IDS`, `DATA_MODEL_CLASSES`, `isInternalDoc(doc, options?)`, `resolveInternalClasses(options?)`, `createReplicationFilter(options?)`.
