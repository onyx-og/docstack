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

**Overridden rather than left to PouchDB's defaults:** `_revsDiff` and `_bulkGet`.
Core emulates both with N individual gets, and replication calls them constantly.
Overriding turns each into a single crossing, which is most of the sync
throughput.

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
  with a reason in this spec.
- `pouchdb-mapreduce` view tests pass unmodified.
- Bidirectional replication with the Drive adapter converges, and a deliberate
  concurrent edit produces the same winning revision on both sides.
