# ADR-0003 — Storage engine

Status: **confirmed — binding spike (spec 02 task 1) passed** · Date: 2026-08-08

## Context

Native Kotlin code will only ever reach data through DocStack; it will never run
ad-hoc queries against the store. That removes the one feature that would
otherwise decide this — SQL queryability — and leaves ordered range scans, atomic
batch writes and snapshot reads, which every candidate provides.

## Decision

RocksDB, behind the document store in `docstack-store`.

- Ordered iteration and atomic `WriteBatch` map directly onto `allDocs`,
  `changes` and the `bulkWrite` transaction.
- LSM write throughput suits replication, which is append-heavy.
- Column families separate docs, rev trees, the seq index, attachments and local
  docs without a schema migration story.

## Rejected

- **Bundled SQLite.** Smaller per-ABI footprint, single-file store, FTS5, and a
  "just query it" escape hatch. All worth less once native never queries
  directly. Remains the documented fallback.
- **LMDB.** True MVCC with zero-copy snapshot reads and a small footprint, but
  thinner Android bindings and a pre-sized map file to manage.
- **ObjectBox, Realm, DuckDB.** Wrong model or wrong workload.

## Binding spike results

Resolved by the spike (`docstack-store/SPIKE-NOTES.md`) rather than remaining an open
risk:

- **Binding**: `io.maryk.rocksdb:rocksdb-android` (latest 10.10.1) is a real,
  actively maintained, API-compatible (`org.rocksdb`, same surface as desktop
  `rocksdbjni`) prebuilt Android RocksDB — no from-scratch NDK/CMake build needed.
- **Atomic `WriteBatch` and ordered iteration both verified on-device** (real
  emulator, not just "it links"): a multi-key batch commit observed as all-or-
  nothing, and `RocksIterator` returning keys in exact lexical order.
- **APK cost, quantified**: roughly **18–26 MB per ABI** (arm64-v8a ~24.0 MB,
  armeabi-v7a ~17.7 MB, x86_64 ~25.6 MB), measured against a byte-identical no-op
  baseline. Dominated by `librocksdb.so` + `librocksdbjni.so` (~22 MB combined);
  the four statically-linked compression codecs (zstd/snappy/lz4/bz2) add only
  ~1.3 MB combined. If size ever becomes a real constraint, trimming to one or two
  codecs is the identified lever — not attempted in the spike, kept as a specific,
  bounded future option.

This was real per-ABI cost that the original "it costs more per ABI" risk note left
unquantified — now it's a known, bounded number rather than an unknown.

**Bundled SQLite remains the documented fallback** if a future finding invalidates
the above (e.g. a real crash-consistency or concurrent-read-under-write failure once
spec 02's actual `DocumentStore` implementation is built against it — not tested by
this spike). The document-level seam means an engine swap touches neither the
contract nor the adapter, which is the main reason the seam is where it is.

## Non-negotiables for whichever engine wins

- `bulkWrite` is one atomic transaction; sequence numbers are allocated inside it.
- Sequences are monotonic. Gaps are fine, reordering is not — replication
  checkpoints on them.
- Readers are not blocked by the writer.
- Attachments are stored once per digest with a refcount; bodies above ~1 MB go
  to the filesystem keyed by digest, with only metadata in the store.
