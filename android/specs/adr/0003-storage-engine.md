# ADR-0003 — Storage engine

Status: **provisional — pending the binding spike, task 1 of spec 02** · Date: 2026-08-08

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

## Open risk

RocksDB's Android bindings are less mature than SQLite's and it costs more per
ABI. Spike this before anything depends on it. If the spike fails, take bundled
SQLite: the document seam means an engine swap touches neither the contract nor
the adapter, which is the main reason the seam is where it is.

## Non-negotiables for whichever engine wins

- `bulkWrite` is one atomic transaction; sequence numbers are allocated inside it.
- Sequences are monotonic. Gaps are fine, reordering is not — replication
  checkpoints on them.
- Readers are not blocked by the writer.
- Attachments are stored once per digest with a refcount; bodies above ~1 MB go
  to the filesystem keyed by digest, with only metadata in the store.
