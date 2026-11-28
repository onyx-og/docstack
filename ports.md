# Proposal — DocStack core in Rust: multi-platform ports without double work

Status: proposed · Date: 2026-11-15 · Part of **DocStack 2.0** (`2.0.md`) · Scope: new Rust
core and bindings; `@docstack/client`, `@docstack/server` (in development, unpublished),
`pouchdb-adapter-native`, android `docstack-store`

This is the engine track of 2.0. `2.0.md` owns the release — what ships when, the version
policy, the consumer-visible breaking changes — and records the decision this document now
assumes throughout: **the embedded-JS port track (`android/docstack-headless`) is dropped**
(`2.0.md` §4), so there is no second engine to fall back to. `proposal.md` is the other
track, the code-defined model. 2.0.0 ships on the current TypeScript engine; the Rust core
lands underneath the same surface in 2.x (`2.0.md` §2).

**For the IDE agent.** Read `2.0.md`, `AGENTS.md`, `android/specs/02-docstack-store.md`,
`android/specs/adr/0001..0003`, `pouchdb-adapter-native/src/contract.ts`,
`specs/01-sync.md` and `specs/02-crypto-access.md` first. This document sets a direction and
a sequence of **spikes**; nothing in it should be built beyond a spike until the spike gates
in §9 pass. Items marked **VERIFY** were not confirmed while drafting.

---

## 1. Goals and constraints (maintainer)

1. **Adoption across platforms**: JS (browser, Node), Kotlin/Android, JVM, C#/.NET, and
   later Swift — each with a native-feeling, compile-time-built library, not a JS engine
   embedded at runtime.
2. **Developers never need to go upstream to integrate**: storage and remotes must be
   pluggable *in the developer's own language*, without a PR to DocStack.
3. **No double work**: each piece of engine logic exists once. In particular, do not
   maintain a PouchDB adapter *and* a separate storage module per engine.
4. **JS developers keep PouchDB if they want it**: an existing PouchDB setup, including
   any PouchDB adapter (`googledrive`, IndexedDB, LevelDB…), must keep working.
5. **Serverless stays first-class**: browser ↔ Google Drive replication with no server, as
   `@docstack/client` does today.
6. **Several backends under one stack** (goal, added 2026-11-23): it must become possible to
   coordinate more than one store or remote behind a single stack - spreading load across
   them, redistributing data between them, or placing documents by role - without each
   integration reimplementing the engine to do it. **Stated as a goal, not a design.**
   Several shapes would work and none is chosen here; what §3.3 buys is that the goal is
   expressible at all, because a coordinator sitting above that seam routes whole
   operations rather than the fragments of one. Distinct from the hub architecture
   (ADR-0030), which coordinates *complete databases by replication* - each realm owning a
   whole one - where this is about one logical database served by several backends. Any
   design for it has to answer what consistency holds across them, which one the changes
   feed speaks for, and how replication sees the set; those are open, and listing them is
   not a start on them.

Goal 1 is normative, not aspirational: the embedded-JS track is **dropped rather than
parked** (`2.0.md` §4). A host either gets a compiled binding or gets nothing new — never a
second engine implementation kept alive beside the core.

## 2. Options considered

| Approach | Verdict |
|---|---|
| Embed the JS core at runtime in each host (QuickJS/Zipline, ClearScript, GraalJS) | **Dropped** (`2.0.md` §4), not kept as a fallback. It fails goal 1: every port ships a JS engine, and the WASM-less engines (QuickJS, Jint) cannot run `@docstack/abe`, so cryptographic access is missing exactly where the port promised parity. The Kotlin headless carrier also runs only against a patched Zipline (cashapp/zipline#1833, pinned through `mavenLocal()`). |
| Transpile TS → C#/Kotlin | Not viable: no mature tooling; the core depends on JS libraries (PouchDB, zod). |
| AOT-compile JS (Static Hermes, Porffor, JS→Wasm component) | Experimental, or still a JS engine inside. |
| Kotlin Multiplatform core | Misses C#; still requires replacing PouchDB. |
| Haxe | Haxe 5 is understood to drop the C# target (**VERIFY**); small ecosystem. |
| **Rust core + bindings** | **Chosen direction.** One core compiled to Wasm (browser), native Node addon, and native libraries with generated bindings (UniFFI for Kotlin/Swift; `uniffi-bindgen-cs` or `csbindgen` for C#). Prior art: Automerge, Couchbase Lite (C++ core). `@docstack/abe` is already Rust (`rabe`). |

## 3. Architecture

```
            ┌────────────────────────────────────────────────────────────┐
 app code → │  Typed API (generated per language from the model, see     │
            │  proposal.md)                                              │
            ├────────────────────────────────────────────────────────────┤
            │  DocStack core (Rust): classes, patches, validation,       │
            │  triggers/jobs, query engine, transactions, crypto (ABE),  │
            │  sync gate, replicator                                     │
            ├──────────────── trait Database (CouchDB semantics) ────────┤
            │  ① Rust engine        ② Remote           ③ PouchDB         │
            │  rev trees + merge    HTTP CouchDB /     instance (JS      │
            │  in Rust              @docstack/server,  build only; any   │
            │        │              Google Drive       PouchDB adapter)  │
            │  trait DocumentStore                                       │
            │  (opaque rev trees, android ADR-0001)                      │
            │  built-in: SQLite, RocksDB, Postgres, IndexedDB/OPFS       │
            │  foreign: any language implements the trait                │
            └────────────────────────────────────────────────────────────┘
```

### 3.1 Upper seam — `trait Database` (CouchDB semantics)

The interface the core and the replicator use for every database, local or remote:
`info`, `get` (incl. `revs`, `open_revs`), `bulk_docs` (incl. `new_edits: false`),
`bulk_get`, `revs_diff`, `all_docs`, `changes` (one-shot and live), `get_local` /
`put_local` / `remove_local`, `destroy`. This is the shape of PouchDB's public API and of
CouchDB's HTTP API, which is what makes implementation ③ a thin wrapper.

Implementations:
1. **Rust engine** — owns revision trees and merge (the one place that must have a single
   implementation), sequences and the changes feed, on top of a `DocumentStore`.
2. **Remote** — HTTP CouchDB-compatible endpoint (`@docstack/server`, CouchDB, Cloudant)
   and **Google Drive** (a passive node: a folder that is pushed to and pulled from). The
   Drive remote is needed on native platforms, where PouchDB does not exist.
3. **PouchDB instance (JS build only)** — wraps a `PouchDB` object. PouchDB keeps its own
   revision handling; the core only calls its public API. Any PouchDB adapter works
   unchanged, including the existing `@docstack/pouchdb-adapter-googledrive`.

The replicator is written once against `trait Database`, so local↔remote, local↔local and
PouchDB↔Rust-engine replication are the same code. Replicating a PouchDB-backed database
into the Rust engine is also the **migration path** for existing apps.

### 3.2 Lower seam — `trait DocumentStore` (exists, android ADR-0001)

The existing 14-method contract (`info`, `getDoc`, `getRevTrees`, `bulkGet`, `bulkWrite`,
`allDocs`, `changes`, `revsDiff`, `getLocal`, `putLocal`, `removeLocal`, `compact`,
`destroy`, `close`, plus `subscribeChanges`), with semantics already pinned in spec 02
("Semantics that must hold": CAS via `expectedPrevWinningRev`, positional `null` for stale
ops, monotonic sequences — gaps OK, reordering never — CouchDB `docCount`/`totalRows`,
local-doc revs `"0-N"`). Revision trees stay **opaque** to the store; merge is in the
engine (now Rust instead of `pouchdb-merge`).

- **Built-in stores** (Rust): SQLite, RocksDB, Postgres; in the browser, IndexedDB and
  OPFS SQLite (OPFS synchronous access handles are available only in Web Workers).
- **Foreign stores** (goal 2): any language implements the trait — a JS object (Wasm
  build), a Kotlin/Swift class (UniFFI foreign trait), a C# class. The existing Kotlin
  `docstack-store` (RocksDB) plugs in this way without changes to its contract.

### 3.3 Top seam — the DocStack API (`addCard`, `updateCard`, `getCards`, `query`)

**Decided 2026-11-23 (maintainer).** A host or a remote may attach at the **API surface**
rather than at `trait Database` or `trait DocumentStore`. One logical operation crosses as
one call: `addCard`, `updateCard`, `getCards`, `query`, `subscribeClassDocs`.

Two reasons, and they are the same two that `trait DocumentStore` was chosen over a
key/value seam for (android ADR-0001), one level further up.

**Crossings.** The write pipeline turns one logical write into several `Database` calls -
read the class model, resolve a foreign key, write, read back for a trigger, write again.
A seam *below* the pipeline therefore multiplies crossings per operation, while a seam
above it is one. On a transport where a crossing is a **message** rather than a function
call - a WebView bridge - that difference is the whole cost model. ADR-0001's own
arithmetic (`allDocs` is one crossing at document level, 10k at key level) is what carries
the argument here: the pipeline is the next layer where the count collapses.

**No PouchDB required.** An integration written at the adapter seam *is* a PouchDB
adapter, so it needs PouchDB wherever it runs. At the API seam it needs none, which is
what lets the same integration serve whichever backend §4.1 selects. This is goal 2
(integrate without going upstream) and goal 4 (PouchDB stays optional, not required) in
one seam.

**This shape already exists**: `RemoteStack` (spec 03 §8) is an API-seam client - the same
contract `Class` and the React hooks use, over an HTTP surface and one event feed. A
WebView carrier or a Drive integration at this seam is the same idea over a different
transport, which is the argument that it is a seam and not a special case.

What follows for the two integrations in flight:

- **Google Drive gains a second implementation here; the existing one stays.** The
  document-level `@docstack/pouchdb-adapter-googledrive` is what *replication* speaks
  (revision trees, `bulk_get`, `revs_diff`, a changes feed - §3.1 implementation ②, the
  passive-node topology), and nothing at the API seam can replace that. So the two
  coexist: the adapter for sync against a Drive folder, the API-seam integration for an
  application whose operations go to Drive directly.
- **The Permetic integration moves here entirely.** A WebView operates by messaging, so
  many small reads and writes are the wrong granularity for it; `@docstack/pouchdb-adapter-native`
  is the document-level path and the carrier does not need to stay on it. See android
  ADR-0001's amendment.

**It is also what makes goal 6 statable.** A coordinator placing or distributing
operations across several backends has to see an operation whole: below this seam a single
write is several calls, and routing them independently would split one operation's reads
and writes across backends, which is not a load-balancing strategy but a correctness bug.
Above it, `addCard` is one thing that can be sent somewhere. That is the whole of the claim
here - no routing design is implied, and none is chosen.

**Open**, and deliberately not decided here: what runs the pipeline on the far side of an
API-seam crossing (for Android, the Rust core's Kotlin binding, with `docstack-store`
underneath it as a foreign `DocumentStore` per §3.2 - which is where that module was
already heading); whether this seam gets a written contract of its own, as the other two
have; and how a live subscription is expressed across it, since `subscribeClassDocs` is a
stream rather than a call.

### 3.4 Layers that move **above** `trait Database`

- **Crypto.** Today encryption is a PouchDB plugin that intercepts `get`/`bulkDocs`, with
  the pristine-handle and revision-addressed-read rules (ADR-0032, ADR-0040 "junction 0")
  keeping ciphertext on the wire. In the core, encryption happens before any `Database`
  call and the replicator works below it, so **only ciphertext ever leaves the core, by
  construction**, on every backend.
- **Indexes and queries.** The query engine must keep its indexes through the trait (as
  documents or local docs), never through backend internals (`pouchdb-find` on one
  backend, something else on another). Highest parity risk; see spike S4.
- **Sync marker / version gate** (`SYNC_META_DOC_ID`, consumer schema version, ADR-0040):
  ordinary document reads/writes through the trait, so they work on Drive, CouchDB and
  PouchDB remotes alike.

## 4. What each audience gets

### 4.1 JS developers — one npm package, two backends

The package contains the Wasm core plus a JS wrapper. **PouchDB is an optional peer
dependency**: users of the built-in engine do not ship it; users of PouchDB keep their
version.

```ts
// keep an existing PouchDB setup (any adapter)
const stack = await DocStack.open({ backend: new PouchDB("app") });

// or the built-in engine
const stack = await DocStack.open({ backend: rustEngine(indexedDbStore("app")) });
```

**Serverless (today's `@docstack/client` topology) is preserved:**

```ts
const local  = new PouchDB("app");                                   // IndexedDB
const remote = new PouchDB("app", { adapter: "googledrive", ... });  // passive node
const stack  = await DocStack.open({ backend: local, sync: [remote] });
```

Both ends are `trait Database` implementations; the core's replicator drives them. No
server, Drive stays a passive folder.

The serverless scenario is fully satisfied **in the browser with either backend**:

| Local | Drive remote | Notes |
|---|---|---|
| PouchDB (IndexedDB) | PouchDB `googledrive` adapter | Today's setup, unchanged. |
| Built-in engine (IndexedDB, or OPFS SQLite in a Worker) | PouchDB `googledrive` adapter | Mix is allowed: both are `trait Database`. |
| Built-in engine | **Rust Drive remote compiled to Wasm** | Drive is plain HTTPS; Wasm reaches it through the browser's `fetch` (web-sys). Same code as the native Drive remote. |

In every case the Google OAuth token is supplied by the app; the core never runs a sign-in
flow.

**Node** gets the same API from a **native addon** (napi-rs) rather than Wasm. Wasm can
make HTTP requests via `fetch` but cannot open raw TCP sockets, so the Postgres wire
protocol (and server-side performance) require the native build. Same crate, two JS targets. Bundler note for browser apps: Vite and webpack 5
handle Wasm; verify `packages/examples/react-todo`.

### 4.2 Native developers (Kotlin, Swift, C#)

A native library with generated bindings, the built-in stores, the HTTP and Drive remotes,
and a foreign-store hook. Auth (e.g. the Google token for Drive) always comes from the host;
the core never runs a sign-in flow.

Until the first binding ships (§10 phase 5), native hosts get **nothing new**: the
embedded-JS engine is dropped (`2.0.md` §4), and that is the accepted cost of goal 3 —
one engine or none, never two.

The Permetic WebView carrier (`docstack-permetic` + `@docstack/pouchdb-adapter-native`,
running the real JS client over the native RocksDB store) stays in the plan and keeps
working for web apps, but it is **not** the route to native hosts and nothing new is
built on it to make it one. A single Rust-built Kotlin/JVM library (one UniFFI binding
for Android and plain JVM) is expected to cost less than extending a carrier to serve
the same hosts, which is why `android/ROADMAP.md`'s plain-Kotlin app waits for this
binding instead of adopting a WebView (decided 2026-11-15, `2.0.md` §4). So the
Kotlin/JVM binding is the first native port *and* a held product's gate, which is why it
sits ahead of the server in the release order (`2.0.md` §6).

### 4.3 `@docstack/server`

Runs the core via the Node native addon with the Postgres store (§6). Today it uses
`pouchdb-node` (`packages/server/src/utils/database/`).

## 5. Triggers and jobs — two layers: compiled and runtime

Today triggers (`TriggerModel.run`) and patch jobs (`PatchJob.content`) are **JavaScript
source strings stored in documents and evaluated at runtime**. Nothing compiled ahead of
time can execute them, and evaluated strings in a replicated database are a
code-injection surface. **Runtime definition must remain possible** (end users define
triggers and jobs), so it is not removed: it becomes a separate, optional layer.

### 5.1 One handler interface, two resolvers

A trigger or job **references a handler**; it does not embed one. The core resolves the
reference in order:

1. **Compiled handlers** — registered in code alongside the model definitions
   (`proposal.md` §13), typed, built per language, available on every platform, no
   interpreter involved.
2. **Runtime handlers** — definitions stored in documents (end-user triggers, admin-defined
   jobs), resolved **only if a runtime plugin is installed**.

Both kinds see the same handler signature and the same capability-limited stack facade
(the existing patch-job facade, ADR-0044, is the model for it).

### 5.2 The runtime is an optional plugin

The core ships **without** any interpreter. Runtime execution is a separate package per
platform:

| Host | Runtime plugin |
|---|---|
| Browser | Host JS engine, sandboxed: a dedicated Web Worker with a watchdog timeout, or SES `Compartment`s. **Never** plain `new Function`/`eval` in the app realm. |
| Node | Host engine in a `worker_threads` worker with resource limits, or SES. |
| Native (Kotlin, Swift, C#, JVM) | Embedded QuickJS via `rquickjs` in the core's plugin crate: interrupt handler (time limit) and memory limit available. |
| Any (later) | User-supplied **Wasm** modules as an alternative runtime format: sandboxed by default, language-independent. |

Benefit: an app that does not install a runtime plugin **cannot execute end-user code at
all**, and this is auditable from its dependency list.

**This is not the dropped embedding track.** `2.0.md` §4 drops running the *engine* in a JS
interpreter. An interpreter sandboxed for end-user handler code carries no engine logic, is
optional, and ships as its own package — the two decisions are independent.

### 5.3 Rules (normative)

**Scope of "fail closed" — read this first.** Compiled handlers never need the runtime
plugin; the plugin requirement applies **only to runtime handlers**. Both layers share one
failure mode — an unresolvable reference — and both fail closed, at different moments:

| Reference | Requirement | If unmet |
|---|---|---|
| Compiled handler | Handler name registered in this app build (`StackOptions.handlers`) | Error **when the stack opens**; `docstack revision --check` catches it at build time (`proposal.md` §13). The consumer-version sync gate (ADR-0040) already keeps older builds from syncing with newer models, so this check is the backstop for local mistakes. |
| Runtime handler | Runtime plugin installed | Writes to the affected class **refused**; runtime jobs stay **pending** (rule 1 below). |

1. **Fail closed (runtime handlers).** If a class has runtime triggers and no runtime plugin is installed,
   writes to that class are **refused** with a typed error — never applied without the
   trigger. Otherwise devices with and without the plugin derive different data from the
   same writes and replication propagates the divergence. Runtime jobs on such a host stay
   pending, not skipped.
2. **Runtime definitions are untrusted input.** They arrive as replicated documents:
   - execute with only the stack facade; no network, filesystem or host access unless the
     app grants a named capability;
   - enforce time and memory limits per invocation;
   - **authorship**: accept runtime definitions only from the app's own patches or from a
     role the app designates, until writer authentication exists. Revision signatures are
     listed as deferred in `ROADMAP.md` (crypto track, "writer authentication"); they
     become a prerequisite for accepting runtime code authored on other devices.
3. **Same semantics in both layers.** A handler must behave identically whether compiled
   or runtime (ordering `before`/`after`, transaction visibility, error propagation). The
   conformance suite runs every trigger test once per layer.

### 5.4 Migration of existing string triggers/jobs

Existing `run` / `content` strings keep working as runtime handlers when the runtime
plugin is installed (the current JS client effectively *is* that plugin). New compiled
handlers are opt-in. This track can start now in the TS codebase and pays off even if the
Rust core is never built.

**The compiled layer landed in the TS codebase on 2026-11-28** (`proposal.md` §13):
`defineHandler`, `handler` on `TriggerModel` and `PatchJob`, `StackOptions.handlers`,
resolution in both execution paths, and the fail-closed check at open plus the same check
at build time in `revision --check`. §5.1's resolution order holds as written - compiled
first, runtime second - and the exactly-one rule of §5.3 is enforced where a patch writes.

The "error when the stack opens" half of §5.3's table needed one more thing to be worth
anything: a `DocStack` constructor could not report a failed open at all - the rejection
was unhandled and `ready` simply never fired - so the error existed and no application
could see it. Fixed alongside, as an `error` event and a `failed` entry in `ready`'s
detail.

What is **not** built, and does not block anything above: §5.2's optional runtime plugin.
The client still evaluates `run` and `content` itself with `new Function`, so rule 1's
"refuse writes when no runtime plugin is installed" has nothing to fire on yet - this host
always has one. Extracting the evaluator into a sandboxed package per platform is the
remaining work, and §5.3's table is already written for the day it exists.

## 6. Postgres store — requirements that must hold

- **Sequence ordering.** Spec 02 forbids reordering because replication checkpoints on
  sequences. Postgres sequences/identity allocate at insert time, not commit time; with
  concurrent writers seq 11 can commit before seq 10, a reader checkpoints at 11, and seq
  10 is lost to replication forever. Fix: in `bulkWrite`, take
  `pg_advisory_xact_lock(hashtext(db))` and allocate from a per-database counter row in
  the same transaction. (Alternative if write contention ever matters: commit-order-safe
  change reads using `pg_snapshot_xmin`; defer.)
- **Live changes across instances.** The server is expected to run multiple instances
  (e.g. Cloud Run). `subscribeChanges` must use `NOTIFY` after commit / `LISTEN` per
  instance, then read from the last delivered sequence.
- **Collation.** Keys arrive as byte-ordered strings (android ADR-0001); use
  `COLLATE "C"` on id columns or range scans order incorrectly.
- **Multi-database layout.** A tenant is a stack (ADR-0030); many databases per schema,
  keyed by a `db` column.

## 7. Reuse of existing assets

| Asset | Fate |
|---|---|
| `android/docstack-store` (Kotlin, RocksDB) | Kept. Becomes a foreign `DocumentStore` for the core, or is replaced by the built-in Rust RocksDB store later. Its spec-02 semantics carry over verbatim. |
| `android/docstack-headless` (QuickJS/Zipline) | **Dropped** (`2.0.md` §4). Development stops; the module is frozen in place and its `SPIKE-NOTES.md` kept as the record of why embedding was rejected. The Zipline fork pins (`mavenLocal()`, `1.28.0-SNAPSHOT`, cashapp/zipline#1833) are abandoned with it, and `android/ROADMAP.md` phases 3–4 are cancelled; `2.0.md` §4 carries the consequence left open. |
| `android/docstack-permetic` (WebView carrier) | Kept and still in the plan: it is the WebView topology for a web app (android specs 01, 03, 05) and is not deprecated by any of this. It is **not** the route to native hosts, and no new work goes into making it one — a plain Kotlin or JVM app gets the binding (§10 phase 5) instead. |
| `pouchdb-adapter-native` | Kept, not interim: it is what the surviving Android path (the row above) runs on, and its vendored PouchDB conformance tests become the reference suite for every `DocumentStore` (§8). |
| `@docstack/pouchdb-adapter-googledrive` | Kept for JS (works unchanged through backend ③). Its logic is the reference for the Rust Drive remote. |
| `@docstack/abe` (`rabe` → WASM) | Linked natively by the core on native targets; no Wasm runtime needed there. |
| `specs/pouchdb-adapter-tauri-sqlite.md` | Superseded: Tauri uses the core with a built-in SQLite store (Rust side) or backend ③. |
| `@docstack/client` TS | Ships 2.0.0 on its own engine (`2.0.md` §2) and remains the shipped product until the core reaches parity (§10 phase 4); then becomes the thin JS wrapper over the core, with no further consumer-visible change. |

## 8. Conformance strategy

- **Revision semantics**: differential testing of the Rust merge against `pouchdb-merge`
  (random edit histories through both; identical trees, winners and conflict sets).
- **DocumentStore**: one suite for all stores. JS-side, the vendored PouchDB suite from
  `pouchdb-adapter-native` runs over a store via a carrier. For stores in other languages,
  a test-only **stdio/socket carrier** sends envelopes to a small host process, so the same
  JS suite tests Kotlin or C# stores without porting tests. Envelopes are loggable and
  replayable (android ADR-0002): record a golden corpus once, replay against every store.
- **Database trait**: the core's test suite runs against every backend (Rust engine with
  each built-in store, PouchDB with IndexedDB and with Drive, CouchDB over HTTP). The matrix
  costs test time, not code.
- Spec 02's crash-consistency and read-under-write tests apply to every built-in store.

## 9. Spikes (in order of risk) and their gates

Each spike is time-boxed and produces a short findings note in `spikes/rust-core/`.

| # | Spike | Pass criteria |
|---|---|---|
| S1 | **Rev-tree merge in Rust** | Differential test vs `pouchdb-merge` on ≥100k random histories: identical trees, winning revs and conflicts. Rev-tree serialization **byte-compatible with the JSON `pouchdb-merge` produces**, so existing stores open without conversion. **Go/no-go.** |
| S2 | **Replication interop** | Rust replicator push/pull with CouchDB and PouchDB; conflicts preserved both ways; interrupted replication resumes from checkpoint without loss or duplication. **Go/no-go.** |
| S3 | **Wasm core with JS backends** | Core in Wasm drives (a) a JS `DocumentStore` (in-memory) and (b) a `PouchDB` instance through `trait Database`, via `wasm-bindgen-futures`. Record Wasm size (gzip) and per-operation overhead vs the current TS client on `allDocs` 10k / `bulkDocs` 1k; set a size budget. |
| S4 | **PouchDB backend parity** | Core suite passes on backend ③ with IndexedDB and with `googledrive`. Replicate PouchDB → Rust engine → CouchDB: documents, revisions and conflicts identical at every hop. Query-engine indexes work identically on ③ and ①. |
| S5 | **Serverless Drive, cross-platform** | Three clients replicate through the same Drive folder: a browser app on PouchDB `googledrive` (backend ③), a browser app on the Rust Drive remote compiled to Wasm (over `fetch`), and a native test app on the Rust Drive remote. Sync marker and version gate honoured; ciphertext only on Drive. |
| S9 | **Runtime handler plugin** | Same trigger defined compiled and runtime produces identical results. Without the plugin, writes to a class with runtime triggers are refused. Runtime handler exceeding time or memory limit is terminated with a typed error and no partial write. QuickJS (native) and Worker/SES (browser) both pass. |
| S6 | **Foreign stores via bindings** | Kotlin: existing `docstack-store` wrapped as a UniFFI foreign `DocumentStore`; passes the store suite via the stdio carrier. C#: same with `uniffi-bindgen-cs` (third-party; **VERIFY** maturity and async support) or `csbindgen`. **VERIFY** UniFFI async foreign-trait support in the chosen version. |
| S7 | **Open existing data** | The core opens a database written by today's `pouchdb-adapter-native` + `docstack-store` and by `pouchdb-node`, with no migration step. |
| S8 | **Node native addon + Postgres** | napi-rs build; Postgres store passes the store suite plus a concurrent-writers ordering test (§6) and a two-instance `LISTEN/NOTIFY` live-changes test. |

**Decision gates:** S9 is independent of the Rust decision, runs on the TS client, and gates
2.0.0 (`2.0.md` §6). S1 and S2 fail → **stop the Rust track with no fallback**: the 2.0
contract has already shipped on the TS engine, JS stays on PouchDB, and the native ports do
not happen (`2.0.md` §2, §4). Re-opening them would then need a different compiled-core
strategy (Kotlin Multiplatform, Kotlin and Swift only, §2), not a JS engine per host. S3–S5
decide the JS/serverless developer experience. S6 decides which native languages ship
first and **releases a held product**: `android/ROADMAP.md`'s app waits for the
Kotlin/JVM binding and nothing else (`2.0.md` §4). S7–S8 decide migration and server
timing.

## 10. Phases after the spikes

Listed in dependency order, which is no longer release order. Phase 1 is 2.0.0; phases
2–4 are 2.1; phase 5's **Kotlin/JVM binding is 2.1–2.2, ahead of phase 6**, because the
android app is held for it (`2.0.md` §4, §6); C# and Swift follow later; phase 6 is 2.2+.

1. Handler interface with compiled and runtime resolvers, runtime extracted as an
   optional plugin, fail-closed rule (§5) — **in the TS codebase, shipping in 2.0.0**; runs
   in parallel with the spikes and pays off even if the Rust core is never built.
2. Rust engine + built-in SQLite/IndexedDB stores + replicator + `trait Database` with
   backends ①②③.
3. Core layers ported in dependency order: validation (from model definitions,
   `proposal.md`), classes/patches/propagation, crypto (native `rabe`), sync gate,
   transactions, query engine (largest; the TS query engine — parser, planner, executor,
   evaluator — is the reference and its tests the oracle).
4. JS package switches its internals to the core behind the existing public API;
   `@docstack/react` unchanged for consumers.
5. Kotlin/JVM binding — the **first** native port, with nothing to replace, since
   `docstack-headless` was dropped at 2.0 instead of being carried to this point. One
   UniFFI binding covers Android and plain JVM; `docstack-store` plugs in as a foreign
   store. Needs phases 2–3 and S6 only, so it can land before phase 4 finishes. Then C#;
   then Swift.
6. `@docstack/server` on the Node addon + Postgres. Independent of phase 5 and no longer
   ahead of it; the server runs on `pouchdb-node` until this lands.

## 11. Risks

- **Scale.** This is a new database engine plus a port of ~17.5k lines of
  `@docstack/client` (`src/`), not a translation. The spikes exist to make that cost
  visible before committing.
- **Third-party bindings for C#** (`uniffi-bindgen-cs`) are outside the UniFFI project;
  plan a fallback (`csbindgen` + handwritten wrapper).
- **Two JS targets** (Wasm and napi) double the JS build/test matrix.
- **Behavioural drift during the transition** between the TS client and the core:
  mitigated by running the TS test suites against the core-backed JS package (phase 4)
  before switching.
- **No fallback for native.** With the embedded-JS track dropped, a plain Kotlin app either
  accepts a WebView (`docstack-permetic`) or waits for S6 and the first binding. Accepted
  deliberately (`2.0.md` §4); the cost lands on `android/ROADMAP.md`'s target app, whose
  phases 3–4 are cancelled by it.
- **Naming the release before the spikes resolve.** Mitigated by defining 2.0 as the
  contract and landing the core under it in 2.x, so a failed S1/S2 costs the ports, not the
  release (`2.0.md` §2).

## 12. Open questions

1. Repository: the core in the `docstack` monorepo (`crates/`) or its own repo under
   `onyx-ac` like the android modules?
2. Drive remote: Rust only, or also allow a foreign implementation for hosts that want
   their own HTTP stack?
3. Postgres body column: `JSONB` (future query pushdown) or `TEXT` (exact round-trip,
   faster)? `JSONB` reorders keys and drops duplicates — confirm nothing hashes stored
   bodies.
4. Does `@docstack/server` keep the ephemeral-DB + Firestore-hydration design once a
   durable Postgres store exists?
5. Is Swift in scope for the first native release, or Kotlin and C# only?
6. ~~`android/ROADMAP.md`'s target app: WebView carrier or hold for the Kotlin binding?~~
   — **decided 2026-11-15**: it holds for the binding, which moved that binding ahead of
   the server (§10, `2.0.md` §4, §6). Permetic keeps its place in the plan; it is simply
   not what native hosts are built on. The android plan documents were updated; the
   submodules were not touched.
7. Does `docstack-headless` stay in the tree frozen, or get deleted once 2.0 ships? Frozen
   is what the android documents now record, since `SPIKE-NOTES.md` is the evidence for
   §2's verdict; deleting it is a separate call.
8. Does the shipped line get a 1.0.0 cut before 2.0 work starts (`2.0.md` §5)?
