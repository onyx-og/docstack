# ADR-0001 — The native seam is document-level

Status: accepted · Date: 2026-08-08

## Decision

`StorageCapability` is a document store. Native holds documents, revisions,
sequences, attachments and local docs, and answers set-shaped queries
(`allDocs`, `changes`, `revsDiff`, `bulkGet`). Revision trees are stored as
**opaque blobs** that native never parses; merge semantics stay in
`pouchdb-merge`, in JavaScript.

## Alternative considered: a key/value seam

Implementing `AbstractLevelDOWN` over native storage and running
`pouchdb-adapter-leveldb-core` on top would inherit a proven document layer. It
was rejected on two grounds.

**Crossings.** Every PouchDB operation becomes O(n) key reads. `allDocs` over
10k documents is 10k round trips, each crossing a process boundary in the
WebView. Recovering that needs caches, request coalescing, streaming cursors and
an in-page memtable — a lot of machinery to claw back what the document seam
never loses. At document level `allDocs` is one crossing, `changes` is one
crossing, `_bulkDocs` is two, regardless of result size.

**Runtime.** `pouchdb-adapter-leveldb-core` is the one Node-oriented package in
the stack; running it under QuickJS drags in `Buffer`, `levelup` and friends.
Without it the shim list collapses to browser globals: `setTimeout` (Zipline
provides it), `fetch`, `TextEncoder`, `atob`/`btoa`, a `process` stub.

## Cost, accepted

Sequence allocation, compaction and attachment refcounting become ours in Kotlin
rather than inherited. `@docstack/pouchdb-adapter-googledrive` is already a full
document-level adapter, written against a substrate with no transactions and high
latency, so this is familiar work against a kinder one.

This makes PouchDB's adapter conformance suite non-optional, and it is task one
rather than a late gate.

## Consequence worth knowing

Views come from `pouchdb-mapreduce`, which stores each index as another PouchDB
database on this same adapter, and encodes emitted keys with `toIndexableString`
before they get there. Every key reaching native is a byte-ordered string, so
CouchDB collation never becomes native's problem and views need no work on the
Kotlin side.
