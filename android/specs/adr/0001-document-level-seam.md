# ADR-0001 — The native seam is document-level

Status: accepted · Date: 2026-08-08 · **Amended 2026-11-23** (the WebView integration moves above this seam; see the amendment at the end)

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

## Amendment 2026-11-23 — the carrier moves to the API seam

**The decision below holds for what it decides**: a *document store* is the right shape
for a document store, revision trees stay opaque, and a key/value seam is still the wrong
answer. What changes is where the **WebView integration** attaches, which this ADR settled
by implication rather than on purpose.

`docstack-permetic` and `@docstack/pouchdb-adapter-native` put the bridge at the document
seam, so the web app's PouchDB talks to the native store. The maintainer's decision
(`../../../ports.md` §3.3) moves it to the **DocStack API seam** - `addCard`, `updateCard`,
`getCards` - and this ADR's own argument is why: the write pipeline turns one logical write
into several document-level calls (class model, foreign key, write, trigger read-back), so
a seam below the pipeline multiplies messages per operation exactly as a key/value seam
multiplied them per document. A WebView operates by messaging; many small reads and writes
are the wrong granularity for it.

The "Crossings" section is therefore not overturned, it is extended: the count collapses
once more, one layer up.

What this does **not** change:

- The 14-method `DocumentStore` contract and spec 02's semantics. They carry across
  unchanged, now beneath the Rust core rather than beneath a JS adapter
  (`../../../ports.md` §3.2), which is where ADR-0002's amendment already put them for a
  host with no WebView.
- Opaque revision trees, and merge living in the engine.
- The adapter itself, which remains the document-level path for anything that still wants
  one.

**Open**: what answers an API-seam call on the native side. The expectation is the Rust
core's Kotlin binding with `docstack-store` under it, which makes this amendment a
consolidation rather than a new component - but the binding does not exist yet, so
`docstack-permetic` stays on the document seam until it does.
