---
title: "Offline-first and the sync model"
description: "Why the engine is embedded, how the stack stays reactive from one changes feed, what replication carries and why it bypasses the pipeline, and the guardrails around it."
sidebar_position: 2
---

## Embedded, not called

The class that validates a document, runs a trigger or encrypts a field is not a network service. It is a local object, `ClientStack`, sitting directly on top of a PouchDB database that persists to IndexedDB in the browser. Every read, write, validation and query resolves in-process. This is what makes a DocStack application keep working, fully validated, with zero connectivity.

The same engine is meant to run on a host too. `@docstack/server` is a preview of that deployment; today the browser is the supported surface.

## Reactive internals

The engine is event-driven under the hood, on PouchDB's `changes()` feed. One shared document feed per stack is demultiplexed to every subscriber: building a `Class` for its schema does not open a feed (`getClassSnapshot`, `{ subscribe: false }`), and the live views `subscribeClassDocs` and `subscribeDomainDocs` decrypt change events before delivering them. This is what keeps a stack under Node's listener ceiling on an application that builds many classes, and what lets React hooks render plaintext from a change event.

Narrow listeners ride the same feed for class-model documents (to invalidate the in-memory class cache, held for fifteen minutes) and for propagation locks. `getClasses()` and `getDomains()` return a live list plus a listener, dispatching `classListChange` and `domainListChange` events the workbench and hooks subscribe to. A DocStack instance behaves less like a request/response API and more like an observable store: ask once, then listen.

## Cross-instance sync

Because every instance owns its own local database, keeping two in sync is a distinct concern from serving requests, and in an offline-first design the more important one. `@docstack/client` owns it directly: `stack.sync({ remote })`.

The layer is **transport-agnostic**: `remote` is whatever PouchDB database the application hands over, so DocStack takes no dependency on any backend and learns nothing about one. What DocStack contributes is the part only it can know:

- **What crosses the wire.** A stack's own bookkeeping (the system record, the encryption marker, `_design/` indexes, propagation locks, sessions, the patch ledger, job runs, log records, ephemeral classes) is device-local and filtered out automatically. The rule is not "is this DocStack's own?" but "can the peer already reconstruct this?": documents seeded by patches stay home because every device seeds them; a user created at runtime travels because it binds the two instances together.
- **How replicated writes land.** Replication writes with `new_edits: false`, meaning the caller already owns the revisions. Those documents bypass the authoring path deliberately: re-validating them would reject anything authored by a device one patch ahead, relation checks would reject anything whose endpoints arrive later in the stream, and `after` triggers would mint fresh revisions mid-write.
- **When it is safe to start.** A schema gate compares the system and consumer patch versions on both sides and refuses to pull from a remote last written by a newer build.
- **How the database is read.** Replication reads documents exactly as stored, so encrypted attributes cross as ciphertext instead of being decrypted on the way out.
- **Convergence state.** Per-stack status, `stopped`, `starting`, `active`, `idle`, `error`, `denied`, plus `lastConvergedAt`, surfaced as events on the stack and through `useSyncStatus`.

## The guarded handle

`stack.db` is the documented way to read a stack and to write through its authoring path. Three doors PouchDB leaves open are closed on it: `bulkDocs` and `put` with `new_edits: false` (or `force`), and the `_`-prefixed adapter methods that sit below the plugin. All three throw `StackWriteGuardError`. Replication needs them, so DocStack keeps them for itself behind an internal replication handle, which also restores the pristine `get` and `bulkGet` so ciphertext, not plaintext, travels.

## Identifiers

Document ids are random with a class prefix, `Task-x7f3k2m9q1w4`. They used to be sequential, minted from a counter only local writes advanced, and one pulled document was enough for the next local write to mint an id the database already held; PouchDB resolved the two as revisions of one document and the new write vanished. Random ids are what make two devices safe to merge, and the prefix keeps an id saying what it is.

## Conflicts

Conflicting edits on two devices converge on the same winning revision on both sides, deterministically, by PouchDB's rules. DocStack does not pick one device as authoritative and does not yet offer application-level conflict resolution. Jobs that may run on several devices avoid the question by writing deterministic ids, so two sweeps collide into one document rather than two.

The decisions behind this model are [ADR-0001](https://github.com/onyx-og/docstack/blob/main/specs/adr/0001-transport-agnostic-sync.md) (sync belongs to DocStack, transports do not), [ADR-0002](https://github.com/onyx-og/docstack/blob/main/specs/adr/0002-guarded-database-handle.md) (the guarded handle), [ADR-0021](https://github.com/onyx-og/docstack/blob/main/specs/adr/0021-one-changes-feed-per-stack.md) (one changes feed), [ADR-0024](https://github.com/onyx-og/docstack/blob/main/specs/adr/0024-identifiers-and-what-replicates.md) (random ids, what replicates) and [ADR-0034](https://github.com/onyx-og/docstack/blob/main/specs/adr/0034-late-stacks-join-a-running-sync.md) (late stacks join a running sync).
