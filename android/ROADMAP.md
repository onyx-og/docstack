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
- [x] Swap in the real engine: `RocksDbDocumentStore` (`ac.onyx.docstack.store.engine`),
      running the exact same `DocumentStoreConformanceTest` suite the in-memory store
      does (spec 02 tasks 4-5 combined). One RocksDB directory per `db` name, each
      with its own `docs`/`revs`/`trees`/`seq`/`local`/`attachments` column families
      (spec 02's layout table) — simpler than one shared instance with dynamically-
      created per-db column families, and makes `destroy(db)` exactly "close the
      handle, delete the directory." No separate sequence-counter key: the in-process
      counter is seeded from the `seq` column family's own last key on open. `revs`
      keyed by `id + 0x00 + rev` so a doc's still-known revisions can be prefix-scanned
      for `allDocs(includeConflicts)` and `revsDiff` — RocksDB's answer to what
      `InMemoryDocumentStore`'s `revisions` map gives for free. Doc bodies stored as
      JSON (`kotlinx-serialization-json`, already a dependency); attachment bytes and
      the opaque tree string stored raw, no wrapper. `bulkWrite`/`compact` use one
      `WriteBatch` each, serialized by the same `Mutex` pattern the in-memory store
      uses; reads never take it. Attachment refcounts carry forward the exact same
      documented limitation as the in-memory store (contract doesn't give enough
      info to decrement on supersede — spec 02 task 6, not engine-specific).
      Two things forced by real build constraints, not choices: `compileSdk` bumped
      35→36 (the RocksDB AAR's metadata requires it — the spike used 36 for the same
      reason), and the conformance suite's test method names lost their descriptive
      backtick/spaces form (Android's DEX format rejects spaces in the synthetic
      lambda class names those generate — only surfaced once the suite was compiled
      into an instrumented-test APK). The conformance suite itself moved to plain
      JUnit 4 and now lives in `src/sharedTest`, wired into both `test` (JVM, the
      in-memory store) and `androidTest` (on-device, RocksDB's native `.so` only
      loads on Android) — one abstract class, zero duplication between engines.
      `./gradlew test`: 25/25 (7 store + 18 dispatcher). `./gradlew connectedAndroidTest`
      on `Medium_Phone_API_36.1`: 7/7 against the real engine.
- [x] `allDocs`, `changes`, `bulkGet`/`revsDiff` query paths — done as part of the
      `DocumentStore` implementation above; re-verified against the real engine here.

## Phase 2 — Adapter (spec 03)

- [x] Conformance harness (`packages/pouchdb-adapter-native`, npm workspace member).
      PouchDB doesn't publish an installable conformance package, and third-party
      adapters that get its suite "for free" (`pouchdb-adapter-fs`) all build on
      `pouchdb-adapter-leveldb-core` — a key/value seam this adapter deliberately
      isn't (ADR-0001: document-level seam). Decision: vendor real spec files from
      `apache/pouchdb`'s `tests/integration/` into `test/vendor/`, recorded in
      `VENDORED.md` with upstream ref + modifications (every file's `adapters` array
      trimmed to `['local']` — no CouchDB `http` target here), rather than write a
      bespoke suite — most faithful to "PouchDB's adapter conformance suite passes in
      full." First vendored file: `test.aa.setup.js` (needs no adapter methods,
      proves the harness runs a real upstream file end-to-end); wider files land as
      the methods they exercise are implemented in tasks below, not all at once.
      Built alongside it: a complete JS fake carrier (`test/fake-carrier.js`) — same
      design as `InMemoryDocumentStore.kt`/`StorageDispatcher.kt` ported to JS, much
      simpler since JS is single-threaded (no `Mutex`/`AtomicLong` equivalents
      needed) — and an adapter skeleton (`src/index.ts`, `NativeAdapter({ carrier })`
      registered via `PouchDB.adapter()`) with every `_method` stubbed until the
      tasks below fill them in for real. `npm test`: 2/2 passing.
      Pre-existing, unrelated to this task: the repo root's `npm install` is broken
      (`EBADPLATFORM` on `@rollup/rollup-linux-x64-gnu` — a stale optional-dependency
      entry in the root lockfile), so this package was installed standalone
      (`npm install --no-workspaces`) and its `package-lock.json` gitignored rather
      than committed, since it's a workaround artifact, not the normal
      workspace-hoisted lockfile.
- [x] `_info`, `_get`, `_getRevisionTree`, local docs (`_getLocal`/`_putLocal`/
      `_removeLocal`). Modeled method-by-method on `pouchdb-adapter-leveldb-core`
      (the reference every real PouchDB adapter follows) so error/callback shapes
      match every other adapter, not just what happened to pass our own tests.
      Regular docs only ever enter a PouchDB store through `_bulkDocs`, so
      `_get`/`_getRevisionTree` have no vendorable upstream file yet — covered
      instead by a hand-written `test/native-methods.spec.js` (deliberately outside
      `test/vendor/`) that seeds the fake carrier directly via `bulkWrite`, the same
      call `_bulkDocs` will make next task. Local docs bypass `_bulkDocs` entirely,
      so `test.local_docs.js` vendors and passes unmodified — the real proof for
      this task, the same role `test.aa.setup.js` played for the harness task.
      Three real bugs found and fixed while making that vendored file pass, all
      cross-repo (`permetic-web/src/index.d.ts`, both `docstack-store` engines,
      the dispatcher, both mirrored spec-02 copies — "contract drift is a compile
      error" held across all three): (1) local-doc revs were `"N-local"`, PouchDB
      expects `"0-N"`/`"0-0"`; (2) `putLocal`/`removeLocal` had no way to detect a
      conflicting write — both gained a `prevRev` parameter and now throw
      `BridgeErrorCode.CONFLICT` (reusing `IllegalStateException`, no new exception
      hierarchy) on mismatch; (3) `getLocal` returned only the body, never the rev,
      so a `db.get()` → `db.put()` round trip always looked like a stale write —
      now returns `{ rev, body }`. None of these were designed up front; all three
      surfaced from running a real upstream conformance test, not guessed at.
      Two adapter-only fixes along the way: PouchDB's own adapter methods must stay
      synchronous (`async function` broke callback delivery since core inspects
      `_putLocal`'s return value — methods now return `undefined` and do the async
      work in an internal `runAsync` helper instead), and even a not-yet-implemented
      stub must report its error through the trailing callback rather than throwing
      synchronously, or `db.destroy()` (used by test cleanup) hangs instead of
      rejecting. `./gradlew test`: 8/8 + 19/19. `./gradlew connectedAndroidTest`:
      8/8. `npm test`: 19/19.
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
