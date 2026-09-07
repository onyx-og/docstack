---
title: "Server (preview)"
description: "What @docstack/server is for, the Express routes and environment variables its preview source exposes today, and why nothing is published yet."
sidebar_position: 8
sidebar_label: "Server (preview)"
---

:::info Preview
`@docstack/server` is not published and not yet active. The supported surface today is `@docstack/client`, which is a complete database on its own. This page describes the direction and what the preview source in `packages/server` exposes; do not build a deployment on it.
:::

## The premise

DocStack's engine is the document model and the machinery around it: classes and validation, triggers, jobs, field-level encryption, the SQL query engine, versioned patches, transactions, replication. None of that is browser-specific. A server node is the same engine deployed on a host, carrying the same feature set over the same documents and speaking the same replication protocol. What changes is not the capabilities but the scenarios they unlock:

- **A durable sync hub.** Two devices can replicate directly only while both are awake. A server node is a peer that is always reachable, which is what turns personal sync into shared workspaces.
- **Authority a peer cannot be.** Sequence numbers, cross-device uniqueness, quotas, anything where "both devices thought they were first" is a bug rather than a conflict; and data no client should hold a full replica of.
- **Jobs on a host that is not asleep.** Nightly reports, retention sweeps, outbound integrations, batch recalculations, under a scheduler that is simply always there.
- **An integration surface.** Third parties do not replicate; they call. Webhooks land here, an HTTP API over the same documents lives here, and a credential that must never reach a browser can be held here.

A server node is a peer, not an owner. Applications keep working when it is unreachable, and encrypted attributes stay encrypted to it.

## What to use today

The sync layer in `@docstack/client` is transport-agnostic and already covers the common cases: any CouchDB-compatible endpoint (`stack.sync({ remote: 'https://example.com/my-app' })`), and the user's own Google Drive through the published adapter. See [Sync to a remote](../guides/sync.md).

## The preview source

`packages/server/src/index.ts` defines a `DocStack` class extending Node's `EventEmitter` that wraps a server-side `Stack` in a small Express application (`getApp()`), with PouchDB on LevelDB (or the memory adapter for tests), a JWT login flow, and the same class, attribute and trigger data model as the client. It is inspectable and not finished: the module imports a file that does not exist, so it does not build as checked in.

### Routes

| Route | Purpose |
| :--- | :--- |
| `POST /login` | Verifies a username and password against the `~User` document, creates a `~UserSession` document, and returns a JWT as an `httpOnly` cookie (`jwtToken`). |
| `/api/private/*` | Guarded by a middleware that verifies the JWT against `JWT_PUBLIC_KEY` and re-checks that the session it names is still `active` in the database, so revoking a session takes effect immediately. |
| `POST /api/private/create-class/:name` | Provisions a class document. |
| `PUT /api/private/create-attribute/:name` | Adds an attribute to a class. |
| `GET /api/private/reset` | Destroys and re-initialises the database. |
| `GET /api/private/clear:conn` | Clears one connection. |
| `GET /api/private/test` | A readiness probe. |

Every request passes a readiness gate: until the stack has finished its startup sequence, the server answers `503`. In `development`, CORS is opened for `http://localhost:8080` with credentials; otherwise it is not enabled. The server does not terminate TLS; a production deployment is expected to sit behind a reverse proxy that does, which is what the `Secure` and `SameSite=Strict` cookie flags assume.

### Environment variables

Loaded with `dotenv`. The file location can be overridden with `ENVFILE`.

| Variable | Purpose |
| :--- | :--- |
| `SERVER_PORT` | Listening port. Defaults to 5000. |
| `NODE_ENV` | `development` relaxes CORS and cookie flags for a separate dev-server origin. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Bootstrap credentials for the initial admin `~User`, created on first boot. |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | RSA pair used to sign and verify session JWTs. Generated on first run if absent. |
| `PSW_PRIVATE_KEY`, `PSW_PUBLIC_KEY` | RSA pair used to encrypt stored user credentials. Also generated on first run. |
| `ENCRYPTION_PASSPHRASE` | Passphrase protecting the generated private keys at rest. |
| `CLOUDANT_URL`, `CLOUDANT_APIKEY` | Target for the experimental `ReplicationService`. |
| `PATCH_COUNT` | Number of system patches the bootstrap expects to apply. |
| `BUILDING` | Set during the build to skip runtime initialisation. |
| `ENVFILE` | Path of the `.env` file to load. |

Credentials handled by the server are stored RSA-encrypted rather than hashed, and JWT expiry is fixed at one hour. Both are flagged for revision before the package moves toward production.

### `ReplicationService`

An earlier, opt-in building block that batches local changes into a queue and periodically flushes it to a CouchDB-compatible endpoint (the implementation targets IBM Cloudant). It predates the client's sync layer, does not use PouchDB's replication protocol, and is not wired into the default bootstrap. Folding it onto the client's lifecycle is an open item.

The generated [API reference](/docs/api/server/) documents the exported `Stack`, `Class`, `Attribute` and `getLogger` symbols.
