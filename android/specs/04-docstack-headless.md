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

Zipline supplies `setTimeout` and an event loop, and bridges Kotlin `suspend`
functions to JS promises — which is exactly the shape the carrier needs.

## Shims

Because `pouchdb-adapter-leveldb-core` is not in the bundle (ADR-0001), the list
is browser globals rather than a Node environment:

- `setTimeout` / `setInterval` — Zipline provides `setTimeout`; confirm the rest
- `fetch` — OkHttp bridge, for the Drive adapter
- `TextEncoder` / `TextDecoder`, `atob` / `btoa`
- a `process` stub (`nextTick`, `browser`)

Bundle with esbuild at `platform: 'browser'` so the PouchDB packages resolve
their browser fields — `spark-md5` instead of `crypto`, base64 instead of
`Buffer`.

## Tasks

1. **Boot spike, before anything depends on this.** Bundle `pouchdb-core` plus the
   native adapter with a stub carrier, evaluate it in Zipline, and record what it
   complains about. A day's work that tells you whether this branch is viable.
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
