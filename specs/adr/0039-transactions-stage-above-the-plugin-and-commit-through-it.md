# ADR-0039 — Transactions stage above the plugin and commit through it

Status: accepted · Date: 2026-09-03

DocStack writes are individually validated, but a multi-document logical change had no
all-or-nothing story (`importContent` says so itself: "*Not a transaction*"). This ADR
adds named write transactions: `stack.beginTransaction()` returns a handle, writes
through it validate at the call site and stage in memory, reads through it see the
staged state overlaid on committed state, and `stack.commit(t)` /
`stack.discardTransaction(t)` end it. Enabled per stack by `transactions: true`,
the way encryption is enabled by its config fields.

## Decision

1. **The stage lives above the plugin; commit is one `stack.db.bulkDocs` through the
   unchanged pipeline.** Interception machinery was not added because it already
   exists: every authoring write funnels through `StackPlugin.bulkDocs` (ADR-0019's
   capture, ADR-0002's guarded handle). Candidate patterns for deeper interception -
   generator-based effect handlers, `AsyncContext` ambient scoping, decorators,
   effect runtimes - were all rejected: AsyncContext ships in no browser, generators
   would force a foreign idiom on every writer, decorators cannot see interior
   writes. The one pattern that fits is the house's own: a write journal at the
   existing choke point's *caller* side, flushed through the front door.
2. **Stage-late, not stage-early.** The journal holds authored plaintext, and the
   full pipeline (triggers, relation checks, encryption, the adapter write) runs at
   commit only. Diverting inside the plugin instead would fire trigger side effects
   and schema propagation at stage time - writes a discard could not undo - and
   would fill the journal with ciphertext the overlay would have to decrypt. All
   pipeline validation precedes the single write call, so a refused commit persists
   nothing, by construction.
3. **The sweep is the atomicity boundary.** Staging runs a read-only validation
   sweep (class exists, schema validation, policy `ensureWriteAllowed`, locked-stack
   check, relation endpoints against overlay ∪ committed ∪ batch); a write that fails
   it is not staged, and a batch with one bad document unwinds entirely. Commit
   re-runs the sweep against the current world. The pipeline stays the sole
   authority - the sweep is a deliberate subset.
4. **The read overlay is transaction-scoped.** Reads through the handle
   (`t.db.get/bulkGet/find`, `t.findDocuments`, `t.query`) see the journal; plain
   `stack.db`, other handles, live subscriptions and replication see committed state
   only. Mango `find` bypasses every plugin hook (the standing `["~class","active"]`
   index answers from a view database fed by the adapter's changes feed), so the
   merge happens in stack code: the committed query runs unwindowed, staged ids mask
   their committed rows, staged matches join the set, and sort/window/projection
   compute after the union - with `pouchdb-selector-core`, pouchdb-find's own
   matcher, so overlay and database can never disagree about a selector. The stage
   is partitioned by class: a query over a class the transaction never touched runs
   exactly the untouched fast path. SQL rides a facade - the executor reaches data
   only through stack APIs, so `t.query` reroutes `findDocuments`/`getCards` at the
   overlay and disables LIMIT/OFFSET pushdown and sort indexes (staged documents
   exist in no index).
5. **Optimistic concurrency, serialized commits.** Every staged entry captures the
   winning revision it was staged against. Commits serialize on a promise chain (the
   scheduler's `stateWrites` pattern); each pre-flights current revisions via
   `allDocs({keys})` and refuses on any mismatch - `TransactionConflictError`, with
   the transaction left open. Two transactions may stage the same document: first
   commit wins, the second refuses cleanly. Direct writes stay live next to open
   transactions (the flag only unlocks the capability; the framework's own writers -
   scheduler, jobs, sync, log sink - always write directly) and interact with them
   only through that refusal.
6. **Refused in transactions**: class models (their write propagates to other
   documents mid-pipeline - ADR-0038 - and cannot be staged or rolled back),
   patches, `_design/` and `_local/` documents, and `new_edits:false`/`force`
   (staging must not become a fourth door around the authoring path). Uncommitted
   stages are memory-only and are discarded on `close()`/`reset()`/reload - by
   decision: uncommitted means not real.
7. **Atomicity is reported, not assumed.** One `bulkDocs` batch is truly atomic only
   where the adapter makes it so; every commit report carries the adapter's honest
   answer (`adapter.atomicBatch`).

| Adapter | One-batch commit | Notes |
|---|---|---|
| `tauri-sqlite` | **atomic** | the whole batch is one `BEGIN IMMEDIATE … COMMIT` in one IPC call |
| `idb` / `indexeddb` (browser default) | per-document | pre-flight shrinks the window; a partial commit leaves `status: "partial"` with only failed entries retained (base revisions kept, so a raced document conflicts on retry instead of being overwritten) |
| native bridge (Android) | per-document | one round trip, per-op optimistic; true atomicity needs a Kotlin-side contract change (future work) |
| channel-served | per-document | one RPC (strictly better than N); the host's `accept` scope can refuse a subset |

## Performance (measured, browser/idb, 100 documents - `BENCH=1`, zz-bench)

| Path | Cost |
|---|---|
| Stage 100 (`createDocs` on handle) | 43.1 ms total, 0.43 ms/doc, **0 backend queries** |
| Commit 100 | 43.1 ms - **parity with the non-transactional `addCards` batch (46.3 ms)** |
| Overlay `findDocuments`, empty stage | 19.2 ms vs 17.2 ms plain, same backend query count (fast-path parity, bench-gated) |
| Overlay `findDocuments`, 100 staged over 100 committed | 66.2 ms (the merge path: unwindowed committed query + in-memory union) |
| Refused commit (conflict pre-flight) | 1.3 ms, zero writes |
| Discard 100 | 0.1 ms |

The memory-only stage is also the performant choice: a persisted stage would pay the
adapter write twice per document (on IndexedDB, per-write transactions - the slowest
primitive available), make discard I/O with failure modes, and still need the
in-memory merge, because staged/local documents are invisible to `find`. Consumers
should size transactions like batches, not imports; `importContent` stays
non-transactional for now and is the natural next consumer of this engine.

## Consequences

- Commit semantics ≡ one big batch write today: before-triggers read committed
  state, not batch-mates. A v2 could thread a transaction-scoped facade to triggers.
- While a stage covers a query's class, LIMIT/OFFSET pushdown is off for that query;
  every other query keeps today's plan (per-class partitioning).
- The relation endpoint check in the plugin now resolves batch-mates before
  declaring an endpoint missing - required for a relation committed together with
  its endpoint, and a fix for plain mixed batches too.
- `DOCSTACK_OPTION_KEYS` gained `transactions` (and `logLevel`, a pre-existing leak
  into the PouchDB constructor, fixed in passing).
- The rollup bundle resolves `browser` package fields now; the Node build of
  `pouchdb-selector-core` references `Buffer` and broke in the page.

Pinned by `src-test/transactions.test.ts` (gate, sweep, nothing-persisted, conflict,
refused doc kinds, state machine, batch-mate relations, counter, report),
`transaction-overlay.test.ts` (visibility scoping, merge sort/window/projection,
SQL facade, event silence until commit), `transaction-crypto.test.ts` (plaintext
stage, encrypt-at-commit, locked refusals at stage and commit),
`transaction-replication.test.ts` (no pre-commit leak to a remote, replicated rev →
clean refusal), and the `zz-bench` transaction section (perf + correctness gates).
