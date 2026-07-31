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

## 4. Cross-Instance Sync (experimental)

Because every DocStack instance — client or server — owns its own local database, keeping two instances in sync across a network is a distinct concern from serving requests. `@docstack/server` includes an early, opt-in building block for this: a `ReplicationService` that batches local `changes()` into a queue and periodically flushes it to a remote CouchDB-compatible endpoint (the current implementation targets IBM Cloudant).

This path is separate from PouchDB's own built-in `replicate`/`sync` protocol, and is not yet wired into the default `DocStack` bootstrap — it previews the direction planned for multi-adapter, multi-node deployments (see [Goals & roadmap](../get-started/goals.md)).
