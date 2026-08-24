# Communication

DocStack is designed around a simple idea: **the same engine runs everywhere**. The class that validates a document, executes a trigger, or enforces a policy is not a network service you call — it's a local object (`Stack` / `ClientStack` / server-side `Stack`) sitting directly on top of a PouchDB database. This section explains how that engine talks to the outside world, and how its internal parts talk to each other.

## 1. Embedded Mode (the default)

Most of the time, there is no network call involved at all. A browser application (via `@docstack/client`) or a Node.js process (via `@docstack/server`) instantiates a `DocStack`/`Stack` directly against a local PouchDB instance:

* In the browser, PouchDB persists to IndexedDB.
* In Node.js, PouchDB persists via the LevelDB adapter (or the in-memory adapter for tests).

All the heavy lifting — schema validation, trigger execution, policy checks, field-level encryption — happens synchronously in-process, inside the `StackPlugin` that both `@docstack/client` and `@docstack/server` register on their PouchDB instance (see [Under the hood](./under-the-hood.md)). This is what makes DocStack **offline-first**: an application keeps working, fully validated, with zero connectivity.

## 2. The REST Layer

`@docstack/server` also wraps its `Stack` instance in a small Express application (`DocStack` class in `packages/server/src/index.ts`). This layer exists for the cases where you *do* need a network boundary — a centralized multi-user deployment, a mobile client, or a third-party integration that can't embed the JS engine directly.

The surface is intentionally small:

| Route | Purpose |
| :---- | :------ |
| `POST /login` | Authenticates a user and issues a JWT, delivered as an `httpOnly` cookie (`jwtToken`). |
| `/api/private/*` | Namespace guarded by a middleware that verifies the JWT and checks that the session referenced in its payload is still `active`. |
| `POST /api/private/create-class/:name` | Provisions a new `~Class` document — schema management over the wire. |
| `PUT /api/private/create-attribute/:name` | Adds an attribute to an existing class. |
| `GET /api/private/reset` | Destroys and re-initializes the underlying database (development/testing utility). |

Every request also passes through a readiness gate: until the `Stack` has finished its startup sequence (admin user bootstrap, patch application), the server responds with `503` rather than serving a half-initialized database.

## 3. Reactive, Event-Driven Internals

Independently of whether a network call is involved, the engine is **event-driven** under the hood, using PouchDB's `changes()` feed with `live: true`:

* **Class model changes** — a listener watches for `~class` document updates and invalidates the in-memory `Class`/`Domain` cache (15-minute TTL) so stale schemas are never used.
* **Propagation locks** — when a class schema changes, a `class-model-propagation-pending` event writes a `~lock` document that blocks further writes to that class until propagation completes, at which point `class-model-propagation-complete` clears it.
* **List subscriptions** — helpers like `getClasses()` / `getDomains()` return a live list plus a changes listener, dispatching `classListChange` / `domainListChange` `CustomEvent`s that UI layers (e.g. `@docstack/react` hooks) subscribe to for reactive rendering.

This means a DocStack instance behaves less like a request/response API and more like an observable store: you ask for data once, then listen for what changes.

## 4. Cross-Instance Sync

Because every DocStack instance owns its own local database, keeping two instances in sync is a distinct concern from serving requests — and, in an offline-first design, the more important one. `@docstack/client` owns this directly:

```typescript
await stack.sync({ remote: () => driveDb, direction: 'both', live: true, retry: true });
```

The layer is **transport-agnostic**: `remote` is whatever PouchDB database the application hands over, so `@docstack/client` takes no dependency on any backend and learns nothing about one. **Google Drive** is the first supported transport, via `@docstack/pouchdb-adapter-googledrive` — the application owns the OAuth token, DocStack owns the lifecycle.

What DocStack contributes is the part that only it can know:

* **What crosses the wire.** A stack's own bookkeeping — `~system`, the encryption marker, `_design/` indexes, propagation locks, sessions, the patch ledger — is device-local and filtered out automatically. Replicating `~system` would hand a peer's `schemaVersion` to `checkSystem` on the next mount.
* **How replicated writes land.** Replication writes with `new_edits: false`, meaning the caller already owns the revisions. Those documents bypass the authoring path deliberately: re-validating them would reject anything authored by a device one patch ahead, relation checks would reject anything whose endpoints arrive later in the stream (batches carry no dependency ordering), and after-triggers would mint fresh revisions mid-write.
* **When it is safe to start.** A schema gate refuses to pull from a remote last written by a newer build, rather than storing documents this build cannot read.
* **How the database is read.** Replication reads documents exactly as stored, so attributes flagged `encrypted: true` cross as ciphertext instead of being decrypted on the way out (see [Field-Level Encryption](./core-crypto.md)).
* **Convergence state.** Per-stack status — `idle`/`active`/`error`/`denied` plus `lastConvergedAt` — surfaced as events on the stack and through `useSyncStatus` in `@docstack/react`.

Because writing around that path is a real hazard, `stack.db` is a **guarded handle**: `bulkDocs`/`put` with `new_edits: false` (or `force`), and the `_`-prefixed adapter methods beneath the plugin, throw `StackWriteGuardError` and point at `stack.sync()`. Ordinary reads and writes are unaffected.

See [Sync & backup](../sync/overview.md) for the application-facing guide.

## 5. The server's `ReplicationService` (experimental)

Separately, `@docstack/server` includes an earlier, opt-in building block: a `ReplicationService` that batches local `changes()` into a queue and periodically flushes it to a remote CouchDB-compatible endpoint (the current implementation targets IBM Cloudant).

This path predates the client sync layer, is not built on PouchDB's `replicate`/`sync` protocol, and is not wired into the default `DocStack` bootstrap. Folding it onto the same lifecycle as the client layer is an open item (see [Goals & roadmap](../get-started/goals.md)).
