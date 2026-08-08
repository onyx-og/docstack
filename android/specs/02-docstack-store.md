# 02 — docstack-store: native document store and dispatcher

Status: **draft, awaiting review** · Owner: Onyx
Modules: `docstack-store`, `docstack-permetic`

## Goal

A native document store that answers the `storage` capability, plus one envelope
dispatcher shared by every carrier. Engine-agnostic above the storage layer, so
ADR-0003 can be revisited without touching the contract or the adapter.

## Non-goals

- Parsing revision trees. They are opaque blobs. See ADR-0001.
- Replication, conflict resolution, or anything that knows what a `_rev` means.
- Exposing a public Kotlin query API. Native reaches data through DocStack only.

## Structure

```
ac.onyx.docstack.store
  DocumentStore            the interface the dispatcher calls
  dispatcher/              envelope decode -> DocumentStore, generated from the contract
  engine/                  RocksDB implementation (ADR-0003)
  attachments/             digest-keyed blobs, refcounts, filesystem spill
ac.onyx.docstack.permetic
  DocStackStorageCapability   registers with PermeticController; WebView carrier
```

`docstack-store` must not depend on `permetic-core`. The Permetic registration
lives in `docstack-permetic` so the store stays usable without a WebView.

## Storage layout

Column families, or their equivalent if the engine changes:

| Family | Key | Value |
| --- | --- | --- |
| `docs` | doc id | winning rev, seq, deleted flag |
| `revs` | doc id + rev | body, attachment digests |
| `trees` | doc id | opaque rev tree blob |
| `seq` | seq (big-endian) | doc id + rev |
| `local` | local doc id | body |
| `attachments` | digest | blob or filesystem pointer, refcount |

Keys arriving from JS are already byte-ordered strings (ADR-0001), so lexical
ordering is the correct ordering everywhere. Sequence keys are big-endian encoded
so numeric and lexical order agree.

## Semantics that must hold

- `bulkWrite` is one atomic transaction. Sequences are allocated inside it and
  returned in the result.
- Sequences are monotonic. Gaps are acceptable; reordering is not — replication
  checkpoints on them.
- A reader is never blocked by the writer.
- `allDocs` with `includeConflicts` returns non-winning leaf revisions so JS can
  report conflicts. Native does not decide what a conflict is; it returns leaves.
- `compact` deletes the named revision bodies and stores the rewritten tree JS
  supplies, in one transaction.
- Attachment refcounts are adjusted inside the same transaction as the write that
  references them. A digest reaching zero is deleted.
- `destroy` removes every family for that database name and is idempotent.

## Tasks

1. **Engine spike (gates ADR-0003).** Stand up RocksDB on Android: binding
   maturity, APK delta per ABI, atomic `WriteBatch`, snapshot iteration, NDK build
   integration. Timebox it. Fallback is bundled SQLite; the seam makes the swap
   cheap.
2. **`DocumentStore` interface + in-memory implementation.** Written first so the
   dispatcher and the adapter can be developed and tested against it.
3. **Dispatcher.** Generated from `index.d.ts`. Envelope decode, method dispatch,
   error mapping to `BridgeErrorCode`, cancellation.
4. **Engine implementation.** Column families, key encoding, transactional
   `bulkWrite`, sequence allocation.
5. **Query paths.** `allDocs` ranges, `changes` since seq, `bulkGet`, `revsDiff`.
   These are where the document seam earns its keep — each is one crossing.
6. **Attachments.** Digest storage, refcounting, filesystem spill above ~1 MB, and
   the binary side-channel plumbed through the carrier.
7. **Compaction and `destroy`.**
8. **`docstack-permetic`.** Registration with `PermeticController.Builder`, the
   WebMessageListener carrier, `available('storage')` wiring.

## Verification

- The in-memory and engine implementations run the same store test suite.
- Crash-consistency test: kill the process mid-`bulkWrite`; the store opens clean
  with the transaction either fully applied or fully absent.
- Concurrency test: a long `allDocs` iteration completes correctly while writes
  land underneath it.
- Refcount test: writing then compacting a shared attachment leaves exactly one
  blob, and removing the last reference deletes it.
- Benchmark, recorded for regression: 10k-document `allDocs`, 1k-document
  `bulkWrite`, `changes` over 10k sequences.

## Open decisions

- **D-1** Does the WebView carrier need a lease when `docstack-headless` is also
  running, or does the headless engine always own the store and the WebView route
  through it? Spec 04 decides; the store must support whichever answer. Moot for
  topologies with no WebView carrier at all (spec 04's primary-carrier mode) — the
  headless engine is then the only writer.
- **D-2** Filesystem spill threshold for attachments — 1 MB is a starting guess,
  not a measurement.
