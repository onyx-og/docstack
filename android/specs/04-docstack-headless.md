# 04 — docstack-headless: replication with no WebView

Status: **draft, awaiting review** · Owner: Onyx
Module: `docstack-headless`

## Goal

Run DocStack with no WebView attached. Two distinct situations fall under that:

- **Background continuity** — a WebView carrier exists elsewhere in the app; this
  engine keeps replication going while the app is backgrounded, when the WebView has
  been evicted, or when an FCM data message wakes a worker with no UI at all.
- **Primary carrier** — the app has no WebView anywhere, ever (a plain Kotlin app).
  This engine is then the *only* carrier: it serves the app's live UI reads and
  writes in addition to background replication. See "Modes" below — the two impose
  different requirements on lifecycle and store ownership.

## Non-goals

- Serving reads to the WebView when a WebView carrier exists — that's
  `docstack-permetic`'s job (background-continuity mode only; does not apply to
  primary-carrier mode, where there is no other carrier to defer to).
- Anything the WebView path already does when a WebView is present. The adapter and
  the store are shared regardless of mode.

## Modes

| | Background continuity | Primary carrier |
| --- | --- | --- |
| When | A WebView carrier (`docstack-permetic`) also exists | No WebView anywhere in the app |
| Engine lifecycle | Cold per-wake is acceptable; see D-1 | Must stay warm for the app's foreground lifetime — it's on the interactive path, so cold-start and steady-state call latency are UX-facing, not just a background-wake concern |
| Store ownership | Two writers possible — spec 02 D-1 decides the lease/ownership model | One writer only; spec 02 D-1 does not apply — there is nothing else to contend with |
| UI access | None — the WebView's carrier serves the UI | The app's UI (ViewModels, etc.) calls this engine directly for every read and write; see "Kotlin API surface" below |

A build can be primary-carrier-only (no `permetic`/`docstack-permetic` dependency at
all), background-continuity-only (assumes a WebView carrier is always present), or
both at once if a future build adds a WebView to an app that started headless-only.

## Kotlin API surface (primary-carrier mode only)

In primary-carrier mode there is no JS runtime the app's UI can reach except through
this carrier — there is no WebView global to call into. `docstack-headless` must
expose a small `suspend`/`Flow` Kotlin API over the carrier for the UI to call
directly: `get`, `put`, `bulkDocs`, `query`, and a `Flow` for `changes`. This is a
thin wrapper, not a second write path — it still delegates to the same
`pouchdb-adapter-native` route every other mode uses, so ADR-0001 (native never
parses a revision tree) still holds; the wrapper never touches a revision tree
itself, only forwards to the JS side.

## Shape

QuickJS via Zipline, running a bundle containing `pouchdb-core`,
`@docstack/pouchdb-adapter-native`, `@docstack/pouchdb-adapter-googledrive` and
`pouchdb-replication`. The carrier is one bound Zipline suspending function into
the same dispatcher the WebView uses.

Zipline bridges Kotlin `suspend` functions to JS promises via Kotlin/JS-compiler-
generated glue — exactly the shape the carrier needs for its own Kotlin↔JS calls.
**That bridge, including `setTimeout`/the event loop it implies, is not automatically
available to arbitrary bundled JS the way a browser or Node provides it** — confirmed
by the boot spike (task 1; see `SPIKE-NOTES.md`). `Zipline.create()`'s own source sets
up no such global; it only "just works" for genuine Kotlin/JS-compiled Zipline guest
code. Task 2 (carrier binding) needs to supply a real `setTimeout` implementation
bridged to Kotlin's coroutine dispatcher — not assume one exists.

## Shims

Because `pouchdb-adapter-leveldb-core` is not in the bundle (ADR-0001), the list
is browser globals rather than a Node environment. None of these are free — the boot
spike confirmed every one of them is missing from a bare QuickJS instance, including
ones this spec didn't originally anticipate:

- `console` — **not native to QuickJS/Zipline at all**, contrary to what an earlier
  draft of this spec assumed. Only present for genuine Kotlin/JS-compiled apps
  (via Kotlin/JS's own stdlib polyfill, not anything Zipline provides).
- `setTimeout` / `clearTimeout` / `setInterval` / `clearInterval` — see above; task 2
  owns the real implementation. A naive synchronous-invoke shim breaks adapters whose
  constructors rely on deferred initialization actually staying deferred.
- `fetch`, `Headers` — OkHttp bridge, for the Drive adapter. Note `pouchdb-core`
  requires `pouchdb-fetch` unconditionally at load time even when nothing on that
  path is exercised, so this is needed even before replication is wired up.
- `TextEncoder` / `TextDecoder`, `atob` / `btoa` — no `Buffer` either (this is neither
  Node nor a browser), so `atob`/`btoa` need a `Buffer`-free implementation.
- a `process` stub (`nextTick`, `browser`)
- `stream` (Node builtin), `global`, `self` — needed just to get a
  `pouchdb-adapter-memory`-based bundle through esbuild/QuickJS at all; may not apply
  once the real native adapter (spec 03) replaces the stand-in used for the spike.

Bundle with esbuild at `platform: 'browser'` so the PouchDB packages resolve
their browser fields — `spark-md5` instead of `crypto`, base64 instead of
`Buffer`. `pouchdb-core`'s Node-oriented transitive deps (via whatever stand-in or
real adapter is linked in) may still need individual `--alias`/`--define` fixes on
top of the platform flag; see `SPIKE-NOTES.md` for the concrete set found so far.

Separately: `zipline-cli compile`'s own dependency-collection step actually
*executes* the bundle once, on a bare `QuickJs` instance with none of the above
(not even `console`) — not just the real Zipline runtime at load time. Bundles need
to tolerate evaluation in that bare sandbox too. Relevant to `permetic-ota`
(spec 06) as well, since it's the same compile step.

## Tasks

1. **Boot spike, before anything depends on this.** Bundle `pouchdb-core` plus the
   native adapter with a stub carrier, evaluate it in Zipline, and record what it
   complains about. A day's work that tells you whether this branch is viable.
   **Done — conditional pass, see `SPIKE-NOTES.md`.** `pouchdb-core` loads and runs
   real async operations inside QuickJS via Zipline on plain JVM. The full shim list
   above came out of this. Task 2 still owns the real `setTimeout`/event-loop bridge
   the spike's polling shortcut stood in for.
2. Carrier binding: Kotlin suspend function ↔ JS promise, plus the binary
   side-channel for attachment bodies.
3. OkHttp `fetch` polyfill with the token supplied by `auth`.
4. Engine lifecycle: create, warm, tear down. Bytecode precompilation of the
   bundle to avoid paying parse cost on every wake.
5. Sync worker: a WorkManager worker scheduled through `permetic.background`,
   plus an FCM data-message path that wakes it.
6. Store ownership (background-continuity mode only): settle **D-1 of spec 02** —
   either a lease so only one of the WebView and the engine writes at a time, or the
   engine owns the store and the WebView routes through it. Whichever wins, one
   writer at a time. Skip this task entirely for a primary-carrier-only build — there
   is only ever one carrier, so there is nothing to lease.
7. **Kotlin CRUD surface (primary-carrier mode).** `suspend`/`Flow` wrapper (`get`,
   `put`, `bulkDocs`, `query`, `changes`) over the carrier, for apps with no WebView
   at all. Not needed for a background-continuity-only build.

## Verification

- The bundle boots in QuickJS and completes a full replication cycle against a
  Drive fixture with no WebView in the process.
- Swipe the app away; the scheduled worker still replicates.
- An FCM data message wakes the worker and replication completes.
- Concurrency (background-continuity mode): WebView writing and the engine syncing
  do not corrupt the store, under whichever ownership model task 6 selects.
- Cold-start budget recorded: engine construction plus bundle evaluation.
- Primary-carrier mode additionally: cold-start-to-first-read latency with the
  engine warm-up blocking the first UI call, and a steady-state CRUD round-trip
  latency benchmark. Both are UX-facing here, not just a background metric.

## Open decisions

- **D-1** (background-continuity mode only) Does the engine stay warm in a bound
  service, or start per wake? Depends on the cold-start number from task 4.
  Primary-carrier mode has no D-1 to settle: the engine stays warm for the app's
  foreground lifetime by construction.
- **D-2** Ship the bundle in `assets/`, or use Zipline's module loading so the JS
  can be updated without a store release?
