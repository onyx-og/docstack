# Proposal — `pouchdb-adapter-tauri-sqlite`

**For dispatch to the DocStack repository.** This is a brief, not a spec: it states what to
build, what to build it from, what to avoid, and how anyone will know it works. It assumes
no knowledge of the application that prompted it.

**Summary.** Port `pouchdb-adapter-react-native-sqlite` onto `@tauri-apps/plugin-sql`, so a
PouchDB database inside a Tauri application is backed by a SQLite file the application owns
rather than by the WebView's IndexedDB.

---

## 1. Why this is worth doing at all

Every Tauri app that wants a local document store today has the same bad choice: use the
WebView's IndexedDB and inherit a quota-managed store the OS may evict, or leave the
WebView and give up PouchDB's replication.

That second half is the point. **PouchDB's value is not that it stores documents; it is
that it replicates.** An offline-first Tauri app wants both, and there is currently no
adapter that gives it both — the survey in §3 turned up nothing that runs in a Tauri WebView
and writes to a real file.

The audience is therefore larger than whoever asks for it first: it is every
CouchDB-replicating desktop app built on Tauri, which is a growing set precisely because
Electron is heavy. An adapter is a small, self-contained, publishable package with no
competitor.

## 2. What to build

A PouchDB adapter package registering under the adapter name `tauri-sqlite`:

```ts
import PouchDB from 'pouchdb-core'
import TauriSQLitePlugin from 'pouchdb-adapter-tauri-sqlite'

PouchDB.plugin(TauriSQLitePlugin({ /* options */ }))
const db = new PouchDB('workspace', { adapter: 'tauri-sqlite' })
```

Registration follows the ordinary PouchDB contract — a plugin function that sets
`PouchDB.adapters['tauri-sqlite']`, carrying `.valid()` and `.use_prefix`. (For a compact
worked example of that registration shape in this organisation's own code, see
`@docstack/pouchdb-adapter-googledrive`, `lib/index.js`.)

## 3. What to port, and what to ignore

**Port from: [`pouchdb-adapter-react-native-sqlite`](https://github.com/craftzdog/pouchdb-adapter-react-native-sqlite)
v4.2.1 (MIT, last published 2026-06).**

It is the right base for one specific reason: **as of v4 it dropped
`@craftzdog/pouchdb-adapter-websql-core` and talks to its SQLite binding directly.** Its
dependencies are otherwise the generic PouchDB plumbing — `pouchdb-adapter-utils`,
`pouchdb-merge`, `pouchdb-json`, `pouchdb-errors`, `pouchdb-utils` — so the platform-specific
surface is small and clearly bounded. The work is swapping one backend for another, not
designing an adapter.

**Target: [`@tauri-apps/plugin-sql`](https://www.npmjs.com/package/@tauri-apps/plugin-sql)
v2.4.0**, which fronts SQLite in Rust over Tauri's IPC.

Substitutions to expect:

| In the RN adapter | In the Tauri port |
| --- | --- |
| `@op-engineering/op-sqlite` | `@tauri-apps/plugin-sql` (`Database.load('sqlite:name.db')`, `.execute`, `.select`) |
| `react-native-quick-base64` | Web-standard `atob`/`btoa`, or `Uint8Array` helpers |
| `@craftzdog/react-native-buffer` | Not needed — a WebView has the DOM APIs |
| `react-native-quick-crypto` shim | Not needed — `globalThis.crypto.subtle` is present |
| React Native peer dependencies | Dropped entirely |

The port should get *smaller* than its source, not larger: most of what that package carries
is polyfill for a runtime that lacks web APIs, and a WebView is a runtime that has them.

**Do not use these, and record why so nobody re-proposes them:**

- **`pouchdb-adapter-indexeddb`** — buys better Mango indexes and **no durability at all**.
  Same storage bucket as `idb`, same eviction.
- **SQLite-over-WASM on OPFS** (`@sqlite.org/sqlite-wasm`) — looks like it turns the WebView
  into a filesystem. It does, but OPFS is site storage under the same Storage Standard
  bucket as IndexedDB, so it is evictable on identical terms. It changes the shape of the
  file and nothing about durability. This one will be suggested; it is the attractive wrong
  answer.
- **`pouchdb-adapter-leveldb` / `pouchdb-adapter-node-websql`** — both need Node. There is no
  Node in a Tauri WebView.
- **`@craftzdog/pouchdb-adapter-websql-core`** — the obvious-looking shortcut, and frozen
  since 2018. PouchDB 8 removed WebSQL; do not build on it.

## 4. Things that will bite

1. **`plugin-sql` is async and IPC-bound; op-sqlite is synchronous and in-process.** Every
   statement crosses a serialisation boundary, so the port is not a find-and-replace: the
   batching the source does for a synchronous binding is the wrong shape here. Expect to
   push whole transactions across in one call rather than issuing statements in a loop.
2. **Binary attachments.** SQLite over IPC will move them as base64 or as arrays, both of
   which cost. Decide early whether attachments are supported, degraded, or refused —
   refusing them explicitly is better than supporting them accidentally at 3× the size.
3. **Where the file lives.** Default it under Tauri's app-data directory, and make it
   configurable. This is the whole reason the package exists, so getting it wrong is
   getting everything wrong: a database in a cache-shaped directory is excluded from
   Time Machine and File History by convention, and is exactly the durability the adapter
   was meant to provide.
4. **Rust-side registration.** `tauri-plugin-sql` must be added to the app's Rust
   dependencies and initialised, and its capability granted. The npm package alone does
   nothing — this needs to be loud in the README, because it is the first thing everyone
   will get wrong.
5. **Concurrency.** SQLite via one plugin connection serialises writes; PouchDB assumes it
   may interleave. Confirm the plugin's pooling behaviour before assuming either.

## 5. Acceptance

1. **PouchDB's own adapter test suite passes.** This is the bar that matters and it already
   exists; the RN adapter runs it and the port should inherit that harness rather than
   inventing assertions.
2. **Replication works both ways** against a CouchDB and against another PouchDB instance —
   the reason for choosing PouchDB in the first place, and the thing an adapter is most
   likely to break subtly.
3. **Data survives** application restart, OS restart, and an app update that changes the
   install path.
4. **Windows, macOS and Linux**, because Tauri's WebView differs on all three and the point
   of this adapter is to stop caring which one is underneath.
5. **A stated position on attachments** (§4.2), whatever it is.

## 6. Downstream: DocStack integration

`@docstack/client` currently depends on `pouchdb-browser`, which bundles `idb` and `http`
and nothing else — so a DocStack consumer **cannot select this adapter even once it
exists**. The adapter-selection work already in flight is the unblocking dependency, and
the two should be verified together: an adapter nobody can select is not shippable, and the
selection API is untested until something other than `idb` is plugged into it.

The pairing is worth stating as a goal rather than a side effect: **DocStack on Tauri with a
real file-backed store** is a stronger claim than either piece makes alone, and it is the
first configuration in which DocStack's own durability guidance can be met on desktop
without a server.

## 7. Deliverables

- The package, published, with a README whose first section is §4.4.
- The adapter test-suite run recorded per platform.
- A short note in the DocStack docs on selecting a non-default adapter, using this as the
  worked example.
