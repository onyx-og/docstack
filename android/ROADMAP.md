# Roadmap — native Kotlin app, no web parts, multi-device Drive sync

Target shape: a plain Kotlin Android app (no WebView, no Permetic) using
`docstack-store` + `docstack-headless` in **primary-carrier mode** (see spec 04) as
its local store and Google Drive sync engine. Multi-device conflict resolution and
future team workspaces (spec 05) both need real revision-tree merging, so this stays
on the full `pouchdb-merge`-in-JS path — no shortcuts around ADR-0001.

Out of scope for this app: `permetic`, `permetic-web`, `permetic-push`,
`permetic-billing`, `docstack-permetic`. Auth is a direct Google Sign-In /
Credential Manager flow in Kotlin, not the `auth` capability.

## Phase 0 — De-risking spikes (parallel, timeboxed ~2–3 days)

- [x] `docstack-headless` boot spike (spec 04 task 1): bundle `pouchdb-core` +
      a stand-in adapter + a stub carrier, evaluate in Zipline/QuickJS. **Conditional
      pass** — see `android/docstack-headless/SPIKE-NOTES.md`. `pouchdb-core` loads
      and runs real async work inside QuickJS via Zipline on plain JVM; found and
      documented the full shim list (spec 04 updated), including that Zipline's
      `setTimeout`/event-loop bridge is not free for a raw bundle the way spec 04
      originally assumed — real fix is spec 04 task 2, not yet done.
- [x] `docstack-store` engine spike (spec 02 task 1): RocksDB-on-Android viability.
      **Pass** — see `android/docstack-store/SPIKE-NOTES.md` and the updated
      ADR-0003 (now "confirmed", was "provisional"). `io.maryk.rocksdb:rocksdb-android`
      is real and current; atomic `WriteBatch` and ordered iteration both verified
      on a real emulator; APK cost quantified at ~18–26 MB per ABI. Bundled SQLite
      remains the documented fallback if a later finding invalidates this.

## Phase 1 — Core store (spec 02 tasks 2–5)

- [x] `DocumentStore` interface + in-memory implementation. Full contract mirrored
      1:1 from `StorageCapability` (`ac.onyx.docstack:docstack-store`, JVM unit
      tests, no emulator needed — nothing here touches Android APIs). Lock-free
      reads via `ConcurrentSkipListMap`/`ConcurrentHashMap`, a single `Mutex`
      serializing only the write path, so "a reader is never blocked by the
      writer" is true by construction. 7/7 conformance tests pass, including a
      real multi-threaded concurrent-read-under-write case and a gap/duplicate-free
      `subscribeChanges` replay-then-live case. `allDocs`/`changes`/`bulkGet`/
      `revsDiff` (below) landed as part of this, not separately. Known, documented
      limitation: attachment refcounts only increment for now — decrement-on-
      supersede needs prior-revision digest info the contract doesn't pass yet
      (spec 02 task 6).
- [x] Dispatcher (`ac.onyx.docstack.store.dispatcher.StorageDispatcher`), hand-mirrored
      from `permetic-web/src/index.d.ts`'s Transport section and `StorageCapability`
      the same way `DocumentStore.kt` mirrors the contract — no codegen tooling exists
      yet (flagged as future work, not silently skipped). Two scope calls made: (1)
      `BridgeRequest`/`BridgeResponse`/`BridgeError`/`BridgeErrorCode` are mirrored
      locally in `docstack-store` rather than pulled from a shared module, since none
      exists yet and this module must not depend on `permetic-core`; `docstack-permetic`
      reconciles the two copies later. (2) `dispatch()` covers only the 14 plain
      request/response methods; `subscribeChanges`/`getAttachment`/`putAttachment` are
      direct typed passthroughs instead, since subscription-id/cancellation bookkeeping
      (spec 01 task 2) and the binary side-channel (spec 04 task 2) belong to other
      modules. Error mapping: `NoSuchElementException`→`NOT_FOUND`,
      `IllegalArgumentException`→`INVALID_ARGUMENT`, unknown method→`INTERNAL`,
      `CancellationException` explicitly rethrown (never mapped to an `Err`). Doc
      bodies round-trip through a small hand-written `JsonElement ↔ Any?` converter,
      not kotlinx.serialization's data-class codecs, since `Map<String, Any?>` is
      arbitrary JSON DocumentStore never interprets. 18/18 tests pass, including a
      real mid-flight cancellation-propagation test and a coverage guard asserting
      the dispatched-method set matches the contract's 14.
- [ ] Swap in the real engine (RocksDB or SQLite) once Phase 0's spike lands.
- [x] `allDocs`, `changes`, `bulkGet`/`revsDiff` query paths — done as part of the
      `DocumentStore` implementation above.

## Phase 2 — Adapter (spec 03)

- [ ] Conformance harness against the in-memory store first — the gate, not a late
      check.
- [ ] `_bulkDocs` with `pouchdb-merge`, `_allDocs`/`_changes`,
      `_revsDiff`/`_bulkGet` overrides.
- [ ] Bidirectional replication test against `@docstack/pouchdb-adapter-googledrive`
      (separate repo, already built and published — see
      `E:\repos\docstack-pouchdb-adapter-gdrive`; do this test early as the real
      proof multi-device sync works).

## Phase 3 — Headless engine as primary carrier (spec 04, re-scoped tasks 2–4, 7)

- [ ] Carrier binding (Kotlin `suspend` ↔ JS promise) + binary side-channel — now
      on the critical path for every UI read/write, not just background sync.
- [ ] OkHttp `fetch` polyfill fed by the app's own Google Sign-In token.
- [ ] Engine lifecycle + bytecode precompilation. Cold-start budget is UX-facing
      here — measure cold-start-to-first-read and steady-state CRUD latency.
- [ ] Kotlin `suspend`/`Flow` CRUD surface (spec 04 task 7: `get`, `put`,
      `bulkDocs`, `query`, `changes`) for ViewModels to call directly.

Note: spec 02 D-1 (WebView-vs-engine store ownership) does not apply in this
topology — there is only ever one carrier, so spec 04 task 6 (lease) is skipped.

## Phase 4 — Background continuity (spec 04 tasks 5–6, cuttable under deadline)

- [ ] WorkManager periodic sync (sufficient for v1).
- [ ] FCM data-message wake path — improves sync latency while backgrounded, does
      not block correctness. Cut first if the deadline is tight.

## Deferrable past v1

- [ ] Attachments (spec 02/03 task 6) — only if the data model needs binary blobs.
- [ ] Compaction / `destroy` polish.
- [ ] `pouchdb-mapreduce` views — only once queries go beyond `allDocs`/`get`.

## Open questions to settle before/during Phase 3

- [ ] Write up the Kotlin CRUD surface's exact method signatures once the Phase 0
      boot spike confirms what's ergonomic to bind through Zipline.
