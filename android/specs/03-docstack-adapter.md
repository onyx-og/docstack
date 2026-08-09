# 03 — @docstack/pouchdb-adapter-native

Status: **draft, awaiting review** · Owner: Onyx
Package: npm `@docstack/pouchdb-adapter-native`

## Goal

One PouchDB adapter that talks to the native document store through the envelope
protocol. Same code in the WebView and in QuickJS; only the `Carrier` differs.

## Non-goals

- Storage. It holds no data and no cache in v1.
- Replication. That is `pouchdb-replication` and the Drive adapter, unchanged.
- A carrier branch anywhere in the adapter. See ADR-0002.

## Responsibility split

**JS keeps everything tree-shaped and semantic:**

- `pouchdb-merge` — `merge()`, `winningRev()`, `collectConflicts()`, `compactTree()`
- Document shaping: `_revisions`, `_revs_info`, `_conflicts`, attachment stubs
  versus bodies, `open_revs`
- Attachment digests (`spark-md5`) and base64/binary conversion
- Option normalisation, and `BridgeError` → PouchDB errors (`REV_CONFLICT`,
  `MISSING_DOC`)
- The `changes` event emitter, fed by a native subscription

**Native keeps everything set-shaped:** bodies by `(id, rev)`, sequence
allocation, range queries, attachment blobs by digest with refcounts, compaction
execution, local docs, transactional bulk write.

Revision trees cross as opaque blobs in both directions.

## Methods

Implemented: `_info`, `_get`, `_bulkDocs`, `_allDocs`, `_changes`,
`_getRevisionTree`, `_doCompaction`, `_getLocal`, `_putLocal`, `_removeLocal`,
`_getAttachment`, `_destroy`, `_close`.

**Overridden rather than left to PouchDB's defaults:** `revsDiff` and `bulkGet` (no
underscore - unlike every other method here, `pouchdb-core`'s `AbstractPouchDB`
assigns these two as concrete public methods with no `_`-prefixed hook to
implement, so overriding means replacing the whole public method, the way real
adapters like `pouchdb-adapter-http` do). Core's own versions emulate both with N
individual gets, and replication calls them constantly. Overriding turns each into
a single crossing, which is most of the sync throughput.

## `_bulkDocs`

1. `getRevTrees(db, ids)` — one crossing
2. merge in JS, compute new trees and winning revisions; each `WriteOp` carries
   `expectedPrevWinningRev` — the winning rev the merge was computed against, or
   omitted for a doc JS believes doesn't exist yet
3. `bulkWrite(db, ops)` — one crossing, one native transaction for whichever ops
   are still current when it runs; sequences allocated inside it and returned with
   the new revisions. An op whose `expectedPrevWinningRev` has gone stale (a
   concurrent writer landed first) comes back `null` at that position — the adapter
   maps it to that doc's per-result conflict, same as any other `_bulkDocs` failure
4. emit changes

Two crossings whether the batch is three documents or three thousand.

## `_allDocs` and `_changes`

`_allDocs`'s `opts.keys` crosses as native's `AllDocsOptions.keys` directly - one
crossing for the whole key list, not the N-crossing per-key emulation
`pouchdb-adapter-utils`'s `allDocsKeysQuery` uses for adapters without native
multi-get support.

`_changes`'s non-live path is one `changes(db, options)` crossing; the live path is
`Carrier.subscribeChanges(db, since, listener)` - a live push subscription, not a
request/response call, so it's attached directly on the carrier object rather than
dispatched through the envelope (same split `StorageDispatcher.kt`'s
`DISPATCHED_METHODS` makes on the Kotlin side). Both paths run every candidate
change through `pouchdb-core`'s own `opts.processChange`/`pouchdb-utils`'s
`filterChange`, reusing core's filter/ddoc/view/selector resolution instead of
reimplementing it. A JS-side filter function needs the real doc body to evaluate
against regardless of `include_docs`, and native's `limit` can't be trusted once a
filter is active (it applies pre-filter) - the non-live path fetches unlimited and
counts `limit` against post-filter matches when a filter function is present, same
as the reference adapter's per-row stream approach. `opts.conflicts` and
`opts.style: 'all_docs'` need a real per-doc rev tree that neither `changes()` nor
`subscribeChanges()` carries (both only ever cross a flat, single-rev `StoredDoc`) -
deferred, same class of gap as `_get`'s `revs`/`open_revs`/`conflicts` options.

## Carrier injection

```ts
const carrier = globalThis.permetic?.storage ?? globalThis.__docstackHost;
PouchDB.plugin(NativeAdapter({ carrier }));
```

Detection lives in `@docstack/client` at import time, so application code stays
`new PouchDB('apollo')` and the same bundle runs in a desktop browser, in the
WebView with the capability, and in the WebView without it.

## Views

`pouchdb-mapreduce` layers on top with no work here. It stores each index as
another PouchDB database on this adapter, and encodes emitted keys with
`toIndexableString` first — so keys reaching native are byte-ordered strings.

## Tasks

1. **Conformance harness first.** Wire PouchDB's adapter test suite against the
   in-memory `DocumentStore` from spec 02. This is the gate for everything below,
   not a late check.
2. `_info`, `_get`, `_getRevisionTree`, local docs.
3. `_bulkDocs` with `pouchdb-merge`, including `new_edits: false`.
4. `_allDocs` and `_changes`, live and non-live.
5. `_revsDiff` and `_bulkGet` overrides.
6. Attachments: digests, stubs versus bodies, binary side-channel.
7. `_doCompaction` and `_destroy`.
8. Replication against `@docstack/pouchdb-adapter-googledrive`, both directions,
   including conflicts and attachments.

## Verification

- PouchDB's adapter conformance suite passes in full. Any skipped test is recorded
  with a reason — in practice, in `pouchdb-adapter-native/test/vendor/VENDORED.md`,
  alongside the upstream ref and any modifications each vendored file needed.
- `pouchdb-mapreduce` view tests pass unmodified.
- Bidirectional replication with the Drive adapter converges, and a deliberate
  concurrent edit produces the same winning revision on both sides.
