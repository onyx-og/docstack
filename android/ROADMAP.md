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
- [x] `_bulkDocs` with `pouchdb-merge`, including `new_edits: false`. Traced exactly
      from `pouchdb-adapter-utils`'s `updateDoc.js`/`processDocs.js` (new dependency,
      alongside `pouchdb-merge` for `merge`/`winningRev`/`isDeleted`/`revExists`):
      `parseDoc` every doc up front (a parse error fails the whole call, matching
      every real adapter); one `getRevTrees` crossing for the batch; per doc id,
      threaded sequentially so a second edit to the same id in one batch sees the
      first edit's merged tree; brand-new-doc and existing-doc branches (including
      the CouchDB "resurrection" special case — undeleting via a fresh `newEdits`
      root put re-parents onto the tombstone rev instead of conflicting); one
      `bulkWrite` crossing for the whole batch. Local docs route through the
      already-implemented `putLocal`/`removeLocal` inline, same as
      `processDocs.js` itself does.
      Vendored `test.bulk_docs.js`, `test.basics.js`, `test.get.js` (full vendoring,
      not scoped down, despite the combined 163 test cases being far larger than
      anticipated when the plan was approved) — 247 passing, 43 documented skips
      (`VENDORED.md`), 0 failing. Skips fall into four buckets, none of them new
      scope creep: methods later tasks own (`_allDocs`/`_changes` — task 4;
      `_close`/`_destroy` — task 7; `_get`'s `latest`/`open_revs` resolution —
      already deferred in task 2's own doc comment); a few whose callback-style
      call sites turn a clean "not implemented" error into a mocha timeout instead
      (same root cause, just a different failure shape); two tests needing the
      `pouchdb-replication` plugin, which this local-only harness never loads; and
      one upstream test (`putting is override-able`) that can't pass under any
      adapter as written — a legacy replication-hook pattern `pouchdb-core@9`
      doesn't wire up anymore.
      Vendoring surfaced three real, previously-undesigned gaps, all fixed across
      every repo (`permetic-web/src/index.d.ts`, both `docstack-store` engines, the
      dispatcher, both mirrored spec copies), same "contract drift is a compile
      error" discipline as task 2: (1) two concurrent `_bulkDocs` calls to the same
      brand-new doc id both silently succeeded with no conflict, since `bulkWrite`
      unconditionally overwrote whatever was stored — fixed by adding
      `WriteOp.expectedPrevWinningRev`, a compare-and-swap token (not a
      tree-semantics decision — ADR-0001 still holds) that `bulkWrite` checks per
      op, rejecting just the stale op (reported as `null`, positionally aligned)
      rather than failing the whole batch, matching CouchDB's own per-doc
      partial-failure semantics; ops within one batch touching the same id chain
      against each other's result, not the pre-batch state (both Kotlin engines
      and the fake carrier needed a same-batch "pending" tracking layer for this,
      since RocksDB's real write only commits at the end of the batch); (2)
      `info().doc_count` counted every doc regardless of deletion instead of
      excluding docs whose winning revision is deleted, per CouchDB's own
      semantics; (3) `db.id()` had no adapter method at all — not even a stub —
      so it hung instead of failing; added `_id`, backed by a reserved
      `_local/instanceId` local doc riding the existing local-doc primitives, same
      persisted-UUID idea `pouchdb-adapter-leveldb-core` uses. Also fixed in
      passing: `revs_limit` (tree-stemming depth) was hardcoded to `1000` instead
      of read from the db's own open options.
      `./gradlew test`: 10/10 + 20/20 (was 8/8 + 19/19 — two new CAS-focused cases
      each). `./gradlew connectedAndroidTest`: 10/10. `npm test`: 247/247, 43
      pending, 0 failing.
- [x] `_allDocs` and `_changes`, live and non-live. `_allDocs`'s `opts.keys` crosses
      as native's `AllDocsOptions.keys` directly — one crossing for the whole key
      list, not the reference adapter's N-crossing per-key emulation
      (`pouchdb-adapter-utils`'s `allDocsKeysQuery`). `_changes` non-live is one
      `changes()` crossing; live is `Carrier.subscribeChanges(db, since, listener)` —
      a live push subscription, so it's attached directly on the carrier object
      rather than dispatched through the envelope, the same split
      `StorageDispatcher.kt`'s `DISPATCHED_METHODS` already makes on the Kotlin
      side. Both paths reuse `pouchdb-core`'s own `opts.processChange` and
      `pouchdb-utils`'s `filterChange` rather than reimplementing filter/ddoc/view/
      selector resolution — same "reuse the real algorithm" principle task 3 used
      for `pouchdb-merge`. `opts.conflicts`/`style: 'all_docs'` on `_changes` are
      explicitly deferred (need a real per-doc rev tree neither `changes()` nor
      `subscribeChanges()` carry — same class of gap as `_get`'s `revs`/`open_revs`
      deferral from task 2).
      Vendored `test.all_docs.js` (980 lines/27 cases) and `test.changes.js` (1880
      lines/64 cases) — full vendoring, same "Full test case" preference as task 3.
      Un-skipped the 16 cases across `test.bulk_docs.js`/`test.basics.js` that were
      only blocked on `_allDocs`/`_changes` not existing yet; two of those needed a
      *second*, previously-hidden fix (`_destroy`, task 7) once the first blocker
      cleared.
      Vendoring surfaced five real bugs, all fixed: (1) `_all_docs`'s `totalRows`
      was computed from the *filtered* result set instead of the whole database's
      non-deleted doc count (CouchDB's actual `_all_docs` semantics — only
      `rows`/`offset` are query-dependent, never `total_rows`) — fixed in both
      Kotlin engines and the fake carrier, cross-repo (`specs/02-docstack-store.md`),
      pinned with a new conformance test; (2) a deleted doc row with
      `include_docs: true` returned a stub tombstone body instead of `doc: null`;
      (3) `_changes`'s non-live path only fetched doc bodies when `include_docs` was
      requested, so any filtered-changes call silently dropped every doc, since
      filter functions need the body regardless of what the caller asked for in the
      output; (4) `limit` was passed straight to native, which applies it
      pre-filter — with a JS-side filter active this silently truncated candidates
      before the filter ever ran; fixed to fetch unlimited and count `limit` against
      post-filter matches instead. Two more bugs were found and fixed in the
      *test-only* fake carrier (not native, not the adapter): (5a) `subscribeChanges`
      never replayed already-committed writes from `since`, contradicting
      `DocumentStore.subscribeChanges`'s own documented replay-then-live contract
      that the real Kotlin engines already implement and test; (5b) once replay was
      added, it fired synchronously during `subscribeChanges()` itself — before
      PouchDB core's chained `.on('change', ...)` had even been attached — so every
      replayed event fired into a void; fixed by deferring delivery to a microtask
      while still snapshotting synchronously (race-free).
      Remaining skips (documented in `VENDORED.md`, none new scope creep): methods
      later tasks own (`_close`/`_destroy` — task 7); `_changes`'s deferred
      `conflicts`/`style` options; two chai 4.5.0 assertion-library limitations
      (`.least`/`.most`/`.above` don't accept strings, unrelated to any adapter);
      the `pouchdb-replication` plugin not being loaded in this local-only harness;
      one upstream test that can't pass under any adapter as written (a stale
      `pouchdb-core@9`-incompatible replication-hook pattern); and CouchDB's
      server-side-only `_design` built-in filter, which `pouchdb-changes-filter`
      doesn't implement client-side.
      `./gradlew test`: 12/12 + 20/20 (was 10/10 + 20/20 — one new `totalRows`
      conformance case). `./gradlew connectedAndroidTest`: 12/12. `npm test`:
      341/341, 43 pending, 0 failing.
- [x] `revsDiff` and `bulkGet` overrides. Research corrected the plan of record: the
      `_revsDiff`/`_bulkGet` stubs in place since task 2 were dead code under the
      wrong names. Traced `pouchdb-core@9.0.0`'s real source — unlike every other
      overridden method, `revsDiff`/`bulkGet` have no `_`-prefixed hook at all;
      `AbstractPouchDB`'s constructor assigns them as concrete public methods
      directly (confirmed by grepping `pouchdb-core`/`pouchdb-utils`/
      `pouchdb-adapter-utils` for `_revsDiff`/`_bulkGet` — zero matches anywhere).
      Overriding means replacing the whole public method the way real adapters
      (`pouchdb-adapter-http`) do, which works cleanly here since `PouchInternal`'s
      constructor runs `super()` (setting the defaults) before synchronously
      invoking this adapter's init function. Both overrides wrap with
      `pouchdb-utils`'s own `adapterFun`, the same wrapping the defaults use, so
      promise/callback duality and the taskqueue/closed/destroyed checks are
      unchanged.
      No Kotlin/native changes needed — `StorageCapability.revsDiff`/`.bulkGet`
      were already declared, dispatched, and implemented in both engines and the
      fake carrier since earlier tasks; native's `revs` column family already keeps
      every revision body ever written (not just winning), so conflicting and
      deleted-but-superseded revisions are already "known" for `revsDiff` with no
      tree-walking needed.
      `revsDiff`: one crossing; native returns an entry per requested id
      unconditionally (even with nothing missing), but CouchDB/PouchDB's own
      convention omits those — filtered out adapter-side, the one real translation
      step this task needed.
      `bulkGet`: one crossing; native's results aren't positionally aligned with
      the request list (misses are simply absent), so results are grouped by id
      into a `Map` — not a plain object, since the vendored `#5886 bulkGet with
      reserved id` case uses `_id: 'constructor'`, which a plain-object lookup
      table would resolve to `Object.prototype.constructor` before any assignment.
      Vendored `test.revs_diff.js` (163 lines/8 cases, full vendoring, no
      modifications, no skips — all 8 pass unmodified) and `test.bulk_get.js` (226
      lines/10 cases; 6 pass unmodified, 4 skipped: `latest=true` needs the same
      real-rev-tree branch resolution already deferred for `_get` since task 2; 3
      attachment cases need task 6's digest/blob storage, which doesn't exist yet).
      Also fixed a documentation bug found along the way: `03-docstack-adapter.md`'s
      `## Methods` section named these `_revsDiff`/`_bulkGet` — corrected to
      `revsDiff`/`bulkGet` with a note on why their override shape differs from
      every other method in that list.
      `./gradlew test`/`connectedAndroidTest`: unchanged (12/12 + 20/20, 12/12) — no
      Kotlin touched. `npm test`: 354/354, 47 pending, 0 failing (was 341/341, 43
      pending).
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
