# 04 — docstack-headless: replication with no WebView

Status: **draft, awaiting review** · Owner: Onyx
Module: `docstack-headless`

## Goal

Run DocStack with no WebView attached, so replication continues while the app is
backgrounded, when the WebView has been evicted, and when an FCM data message
wakes a worker with no UI at all.

## Non-goals

- Serving reads to the WebView. The WebView has its own carrier into the same
  store.
- Anything the WebView path already does. The adapter and the store are shared.

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
6. Store ownership: settle **D-1 of spec 02** — either a lease so only one of the
   WebView and the engine writes at a time, or the engine owns the store and the
   WebView routes through it. Whichever wins, one writer at a time.

## Verification

- The bundle boots in QuickJS and completes a full replication cycle against a
  Drive fixture with no WebView in the process.
- Swipe the app away; the scheduled worker still replicates.
- An FCM data message wakes the worker and replication completes.
- Concurrency: WebView writing and the engine syncing do not corrupt the store,
  under whichever ownership model task 6 selects.
- Cold-start budget recorded: engine construction plus bundle evaluation.

## Open decisions

- **D-1** Does the engine stay warm in a bound service, or start per wake? Depends
  on the cold-start number from task 4.
- **D-2** Ship the bundle in `assets/`, or use Zipline's module loading so the JS
  can be updated without a store release?
