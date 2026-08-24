# 01 — Sync

Status: **draft, awaiting review** · Owner: Onyx · Date: 2026-08-24
Packages: `@docstack/client`, `@docstack/react`
Related: `@docstack/pouchdb-adapter-googledrive` (separate repo), permetic spec
`03-docstack-adapter`, ADR-0001, ADR-0002

## Goal

DocStack owns the replication *lifecycle* for a stack: what crosses the wire, when
it is safe to start, what state a UI can render, and when it stops. It owns nothing
about the *transport* — the remote is whatever PouchDB database the application
hands over.

```ts
stack.sync({ remote: () => driveDb, direction: 'both', live: true, retry: true });
docstack.sync({ remote: (stack) => driveFor(stack.name) });
```

## Non-goals

- **A transport.** No Google Drive, Firestore or peer code in `@docstack/client`,
  and no dependency on any of them. The Drive adapter stays a separate package the
  application installs and configures.
- **A new replication implementation.** `pouchdb-browser` already bundles
  `pouchdb-replication`; `PouchDB.sync` and `PouchDB.replicate` are present and are
  what this layer drives. Adding `pouchdb-core` + `pouchdb-replication` on top would
  ship two PouchDB copies in one bundle.
- **Access control.** Filters are not a security boundary. Partitioning is the
  topology's job — a database per workspace, a Drive folder per account.
- **Attachments.** Out of scope, matching permetic spec 02/03.
- **Conflict resolution policy.** Replication converges on CouchDB's deterministic
  winner. Application-level merge is a later concern.

## Why this cannot live in the application

Replicating *into* a DocStack stack was data-corrupting before this work, and only
DocStack can know it. `StackPlugin` replaces `stack.db.bulkDocs` and, until now,
never checked `new_edits`. `pouchdb-replication` writes with
`bulkDocs({ docs, new_edits: false })`, so every replicated document took the full
authoring path:

- **Class validation ran on incoming documents.** A document authored on a device
  one patch ahead is rejected, and the whole batch rejects with it.
- **Relation validation threw on out-of-order arrival.** Replication batches carry
  no dependency ordering, so a relation arriving before its endpoints killed the
  batch — and every retry hit the same wall.
- **Triggers fired again.** After-triggers queue a re-put through `postOperations`,
  which writes with default `new_edits` and mints a fresh revision in the middle of
  a `new_edits: false` write.

Three further things are DocStack's knowledge and nobody else's: which documents
are device-local bookkeeping, which class a document belongs to, and which schema
version wrote a database.

## The write path

`StackPlugin.bulkDocs` short-circuits to the pristine `bulkDocs` when
`new_edits === false`. The flag reaches the method in two places —
`pouchdb-replication` puts it in the request envelope, other callers put it in
`options` — and only `pouchdb-core` normalises between them. `StackPlugin` replaces
that method, so it repeats the normalisation itself (`readNewEdits`).

## The guarded handle

That short-circuit is also a one-line way to write anything into a stack, so it is
not reachable from `stack.db`. `createGuardedDb` wraps the handle and closes three
doors:

| Door | Why it is closed |
| :--- | :--- |
| `bulkDocs(docs, { new_edits: false })` | Skips validation, relations and triggers. |
| `put(doc, { new_edits: false \| force: true })` | `force` is the same hatch: PouchDB rewrites it into `new_edits: false`. |
| `_bulkDocs`, `_put`, `_remove`, `_bulkGet` | Adapter methods that sit *below* the plugin. |

Refusals arrive as `StackWriteGuardError`, in whichever style the caller asked in —
a rejected promise or a callback error, never a synchronous throw, because that is
the one shape PouchDB never produces.

Forwarded members are **bound to the real instance**. PouchDB's public methods
delegate through `this` (`bulkGet` calls `this._bulkGet`), and with `this` as the
wrapper those internal hops would hit the block list rather than the adapter.
`constructor` is exempt from binding — `Function.prototype.bind` drops static
properties, and binding it would strip `PouchDB.plugin`/`PouchDB.replicate`.

## The replication handle

`stack.getReplicationHandle()` (`@internal`) restores PouchDB's own `bulkDocs`
**and** `bulkGet`. Both halves matter:

- `bulkDocs` — replication writes documents with revisions it already owns.
- `bulkGet` — `StackPlugin`'s version *decrypts on read*. Left in place, push
  replication would ship plaintext to a remote that is meant to hold ciphertext.

Everything else forwards to the real database, so the source and target PouchDB
sees are the real ones.

## What replicates

Three filters, ANDed. All use PouchDB's include-semantics: `true` replicates.

### 1. Internal documents (`sync/internal-docs.ts`)

Device-local by id: `~system`, `~crypto-engine-config`, `lastDocId`.
Device-local by id prefix: `_local/`, `_design/`, `~lock-`.
Device-local by class: `~lock`; plus `~UserSession` and `patch`, which
`replicateSessions` / `replicatePatchLedger` opt back in.

`~system` is the important one: it carries `schemaVersion`, which `checkSystem`
reads on every mount, so pulling a peer's copy would hand this device a version its
patches have not reached. `_design/` documents are Mango indexes built on demand,
including the `-temp` variants. `~lock-` guards an in-flight class-model
propagation on *this* device.

**`~Policy` replicates.** Policies are authored data model, not device state; a peer
needs them. This is a deliberate departure from the review that prompted this work.

### 2. Classes (`sync/class-filter.ts`)

`classes: { include, exclude, includeDataModel }`. Two rules an application author
has no reason to know, which is exactly why they live here:

- **An allow-list keeps the data model.** `include: ['Task']` taken literally
  produces a remote holding Task documents and no Task class model — a database the
  next device cannot open. `DATA_MODEL_CLASSES` (`class`, `~self`, `domain`,
  `~Policy`, `~User`, `~Group`, `~AuthModule`, `~Job`) rides along unless
  `includeDataModel: false`.
- **Relations are not classified by `~class`.** They carry `~domain` plus
  `sourceClass`/`targetClass`, so a predicate reading only `~class` lets every
  relation through, including ones pointing at documents that were filtered out.
  A relation replicates only when both endpoints do.

`exclude` drops documents *of* a class; the class model itself still crosses (it is
`~class: "class"`), keeping the remote readable. `internalDocs.extraDocIds` is the
escape hatch for keeping a model local too.

Documents with neither `~class` nor `~domain` **abstain** rather than being dropped.
A deletion is `{ _id, _rev, _deleted }` with no class on it; dropping those would
mean a delete never reaches the peer and the document silently returns.

### 3. A caller's predicate

`filter: (doc) => boolean`, ANDed with the above.

### Filter identity (`sync/filter-identity.ts`)

PouchDB derives the replication checkpoint from
`source.id() + target.id() + filter.toString()` (`generateReplicationId`). Every
filter a factory produces has the *same closure source text*, so without help they
all hash to one checkpoint: switching from `exclude: ['Draft']` to
`exclude: ['Archive']` would resume from the old position and never backfill the
newly-admitted documents. Silently, with no error anywhere.

Every DocStack filter is therefore stamped with a `toString` derived from its
configuration. Change what you filter and replication re-scans and backfills; keep
it and it resumes. Lists render order-insensitively, so reordering a class array
does not trigger a full re-scan. A caller's bare function has no configuration to
describe, so its own source is the only identity available — two closures over
different arrays with identical source read as the same filter.

### What must not be used

`doc_ids` and `selector` are passed down to the *source adapter's* `_changes`. The
Drive adapter honours neither, so both would sit in the options looking like
configuration while replicating everything. Only `filter` is applied by
`pouchdb-replication` itself, in its own `onChange`.

## The schema gate

The gate cannot read `~system`, because the filter keeps it local and a Drive
remote therefore never has one. DocStack keeps its own marker instead:

`_local/docstack-sync` — `{ schemaVersion, appVersion, updatedAt }`. A `_local/`
document on purpose: shared by every device talking to that remote (they all open
the same database) and never replicated into anybody's stack.

Before starting, `checkSchema` reads it (falling back to `~system`, present only
when a whole stack was mirrored with `internalDocs: false`) and refuses with
`SyncSchemaMismatchError` when the remote is ahead. Only a direction that includes
push publishes the local version: a pull-only device claiming it would lock older
peers out of a remote holding nothing they cannot read.

`checkSchemaVersion: false` turns it off.

## Status and convergence

`SyncStatus` per stack: `state`, `direction`, `live`, `lastConvergedAt`,
`lastActiveAt`, `lastError`, `pushed`, `pulled`.

`state` is `stopped | starting | active | idle | error | denied`.

**`lastConvergedAt` is the value a UI renders as "last synced"**, not
`lastActiveAt`. It is set when a replication cycle finishes with nothing left to
send — PouchDB's `paused` with no argument, or `complete` for a non-live run.
`paused` *with* an argument is a retrying replication that lost its remote, and is
recorded as an error instead.

Events are dispatched on the handle (`status`, `change`, `active`, `idle`,
`denied`, `error`, `complete`) and `status` is re-dispatched on the stack as
`sync-status`, so a consumer can subscribe without holding a handle across a
`restart()`.

`restart()` re-resolves the remote, which is how a refreshed OAuth token reaches
the replication without the application reaching into DocStack. Counters and
`lastConvergedAt` survive it. `stack.close()` cancels.

## Adapter contract

The changes feed is what replication checkpoints against, so a custom adapter has
obligations beyond "return some changes". Found and fixed in the Drive adapter:

1. **Batches must be ordered by sequence.** Replication records the highest seq in a
   batch and `limit` makes every batch partial, so an unordered batch can checkpoint
   past a change it never emitted — lost for good. The Drive index is a plain object
   keyed by document id; its enumeration order says nothing about sequence.
2. **`style: 'all_docs'` must list every leaf.** It is `pouchdb-replication`'s
   default. Reporting only the winner hides conflict leaves, so they are never
   fetched and never pushed, and the replicas quietly disagree about which revisions
   exist.
3. **Deleted documents need a tombstone body, not `null`.** With any filter,
   `include_docs` is forced on; `filterChange` substitutes `{}` for a missing
   `change.doc`; a filter handed `{}` has no id to judge and drops the change. **Any
   filtered replication against the adapter was silently never propagating
   deletions.**
4. **`include_docs` should be batched.** A filtered pull forces a body read per
   change. `getMulti` groups ids by the file holding them — one download per
   change-log file rather than one per document — and the batch is cut before the
   fetch so changes past `limit` cost nothing.

Points 1–3 are correctness; 4 is throughput. All four apply to any future adapter.

## Supporting changes

- **`Stack.initialize` forwards PouchDB configuration.** It previously did
  `new PouchDB(conn)` and dropped `options` entirely, so no stack could be opened on
  a custom adapter at all. DocStack's own keys (`name`, `plugins`, `patches`,
  `credentials`, `disableCryptoEngine`) are stripped; the rest goes through. `name`
  is on that list because the two libraries mean different things by it.
- **An explicit `options.name` now wins** over the `db-` regex, so a stack opened on
  a URL or adapter-specific connection has a name.
- **`DocStack.addStack`/`removeStack` are public**, with `stack-added` /
  `stack-removed` events. A workspace joined at runtime needs a database and a
  replication pair without tearing down the stacks already open.
- **`StackProvider` reconciles `config`** rather than reading it once.
- **`useSyncStatus(stackName?)`** subscribes on the stacks, not the handles, so it
  survives a `restart()` and works whether it mounts before or after `sync()`.

## Tasks

1. ~~`new_edits: false` short-circuit in `StackPlugin.bulkDocs`, reading both flag
   positions.~~ Done.
2. ~~Remove the `debugger;` from the class-model branch.~~ Done — note it is still
   in published `0.1.5`, which needs a republish.
3. ~~Guarded `stack.db` + internal replication handle.~~ Done.
4. ~~Internal-document taxonomy and filter.~~ Done.
5. ~~Sync manager: lifecycle, status, convergence, cancel-on-close, restart.~~ Done.
6. ~~Schema gate on `_local/docstack-sync`.~~ Done.
7. ~~Class filtering and filter identity.~~ Done.
8. ~~`Stack.initialize` option pass-through; public `addStack`/`removeStack`;
   config-diffing `StackProvider`; `useSyncStatus`.~~ Done.
9. ~~Drive adapter `_changes`: seq ordering, `all_docs` leaves, tombstones, batched
   `include_docs`.~~ Done.
10. Republish `@docstack/client` (carries the `debugger;` fix) and
    `@docstack/pouchdb-adapter-googledrive`.
11. Run the suites below. **Not yet run** — written on Windows, to be run under WSL.
12. Firestore and peer transports as remote factories, against this same lifecycle.

## Verification

- `packages/client` — `plugins/__tests__/new-edits.test.ts`,
  `core/sync/__tests__/{internal-docs,class-filter,filter-identity}.test.ts`,
  `core/__tests__/replication-write-path.integration.test.ts`,
  `core/sync/__tests__/sync.integration.test.ts`.
  Run with `./node_modules/.bin/jest -c packages/client/jest.config.ts` — the
  package's own `test` script is Playwright, against `src-test`.
- `docstack-pouchdb-adapter-gdrive` — `tests/changes_ordering.test.ts`, plus the
  existing mock and production suites (`npm test`, `npm run test:prod`).
- **Open:** an end-to-end round trip of `stack.sync()` against real Google Drive,
  two devices, including a deliberate concurrent edit and a deletion. The adapter's
  own `test:prod:replication` covers raw replication; this would cover the DocStack
  layer on top of it.

## Known limits

- **Tombstones escape the class-based internal rules.** A deletion carries no
  `~class`, so a deleted `~UserSession` or patch-ledger document replicates as a
  tombstone. Harmless — a deleted stub, no data — and id-based rules (`~system`,
  `_design/`, `~lock-`) still apply. Not worth the id-prefix guessing it would take
  to close.
- **Tightening a filter does not remove what already crossed.** Documents
  replicated under a looser filter stay on the remote; removing them takes a real
  `_deleted: true` write.
- **Widening a filter re-scans from seq 0.** By design, so the newly-admitted
  documents backfill — but it is a full pass over the changes feed.
- **Drive is a per-Google-account folder**, so it is the personal multi-device
  transport only. Team sync is a different transport against the same lifecycle.
