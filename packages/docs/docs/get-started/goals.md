# Goals & roadmap

DocStack is pre-release software (`v0.0.1`, not yet published to a package registry — see [Installation](./installation.md)). This page lays out where the project is headed, so you can gauge fit before building on it.

## Guiding goal

Give schema-less NoSQL databases the ergonomics of a schema-driven framework — validation, business logic, access control, and encryption — **without giving up the offline-first, sync-friendly nature of a document store**. Concretely, that means the same engine (`Stack`) runs unmodified in a browser tab, a Node.js server, or a desktop shell, backed by the same PouchDB-compatible protocol, with logic and schema stored as data rather than compiled into the application.

## Near-term priorities

* **Multi-adapter storage.** PouchDB currently backs every deployment (`pouchdb-browser` in the client, `pouchdb-node`/LevelDB on the server). The adapter boundary is deliberate: **MongoDB** and **Firebase Firestore** adapters are planned next, so the same class definitions, triggers, and policies work regardless of the underlying store.
* **Maturing cross-instance sync.** The experimental `ReplicationService` (see [Communication](../architecture/communication.md)) previews syncing a local instance to a remote CouchDB-compatible store (currently prototyped against IBM Cloudant). Turning this into a first-class, adapter-agnostic sync path — rather than a queued/batched side channel — is a major upcoming milestone.
* **Hardening the server's authentication path.** JWT expiration is currently fixed at one hour rather than configurable, and credential storage relies on reversible RSA encryption rather than a purpose-built password hash. Both are flagged for revision as the server package moves toward production readiness (see [Security](../architecture/security.md)).
* **`@docstack/react` parity.** The React bindings package exists and is typedoc-documented, but its docs sidebar in this site is not yet wired up to the navbar the way the client and server API references are — closing that gap is part of getting React support to the same documentation maturity as the core engine.
* **First package publish.** Once the client/server API stabilizes, the goal is to publish `@docstack/client`, `@docstack/server`, and `@docstack/react` to a package registry so `npm install` becomes the actual installation path.

## Longer-term direction

* **Richer administrative tooling** in `@docstack/ui` — the workbench app already lets you browse a database, run queries, and manage schema; deeper support for managing policies, jobs, and encrypted attributes visually is planned.
* **First-class multi-node deployments** where several DocStack instances (browser, server, mobile) stay consistently synced, building on the sync work above, so the "everything is a document" model extends cleanly across a distributed set of devices, not just a single database.
* **Expanded reference applications** under `packages/examples`, demonstrating patterns (multi-tenant policies, encrypted-field workflows, background job pipelines) beyond the current minimal React starters.

If you're evaluating DocStack today, treat the client engine (validation, triggers, jobs, policies, crypto) as the most mature surface, and the server/sync layers as actively evolving.
