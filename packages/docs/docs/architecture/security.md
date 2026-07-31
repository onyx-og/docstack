# Security

Security in DocStack is layered: authentication establishes *who* is acting, policies decide *what* they can touch, and the crypto engine protects *what's actually stored*. This page ties those layers together — for implementation depth, see [Field-Level Encryption](./core-crypto.md) and [Access Control (Policies)](./data-model-policies.md).

## Authentication & Sessions

`@docstack/server` handles authentication over its REST layer:

1. `POST /login` looks up the `User` document by username and verifies the submitted password.
2. On success, a `~UserSession` document is created (`sessionId`, `sessionStart`, `sessionStatus: "active"`) — the session lives in the database like any other document, not just in memory.
3. A JWT is signed (RSA, via `JWT_PRIVATE_KEY`) embedding `username`, `id`, `email`, and `sessionId`, and returned to the client as an `httpOnly` cookie rather than in the response body.
4. Every subsequent request to `/api/private/*` is verified against `JWT_PUBLIC_KEY`, **and** the middleware re-checks that the session document referenced by `sessionId` is still `active` in the database — so revoking a session (e.g. an admin forcing logout) takes effect immediately, without waiting for token expiry.

Cookie flags adapt to environment: `SameSite=Strict` + `httpOnly` in production, relaxed (`SameSite=None`, `Secure`) only in `development` to accommodate a separate webpack dev server origin.

`@docstack/client` has a parallel, independent `authenticate()` flow used when the engine is embedded directly (no server hop): it looks up the `~User` document locally, runs the configured authentication `~Job` (password verification / key derivation), and creates the `~UserSession` document itself. This is the flow that also derives the key used to unlock the crypto engine (see below) — the server-side JWT flow only vouches for identity, it does not carry key material.

## Credential Storage

User passwords handled by `@docstack/server` are stored encrypted (RSA public-key encryption via `PSW_PUBLIC_KEY`/`PSW_PRIVATE_KEY`) rather than in plaintext, with decryption used at login time to compare submitted and stored values. This is distinct from, and unrelated to, the PBKDF2-derived key used by the client-side crypto engine to unlock encrypted documents — one protects the login credential, the other derives a key that never leaves the user's device.

## Access Control: Policies

Once a session exists, every read and write goes through the **Policy Engine**. Policies are themselves documents (`~Policy`), evaluated as small JavaScript rules with `document` and `session` in scope, returning `true` (allow), `false` (deny), or neutral. New classes get a secure-by-default policy requiring an active session, so nothing is accidentally left world-writable. Full mechanics — targeted vs. base policies, evaluation order, RBAC patterns — are covered in [Access Control (Policies)](./data-model-policies.md).

## Data-at-Rest: Field-Level Encryption

For data more sensitive than access control alone should protect, DocStack's **Crypto Engine** offers zero-knowledge, field-level encryption: attributes flagged `encrypted: true` in a class schema are encrypted client-side (AES-GCM) before they ever reach PouchDB, using a document key that is itself wrapped by a key derived from the user's password (PBKDF2). Neither the server nor a database administrator with raw access to the stored documents can read these fields. Details of the key hierarchy and wrapping process are in [Field-Level Encryption](./core-crypto.md).

## Transport & Network Hardening

The REST layer applies a few standard protections, with room left for deployment-specific hardening:

* **CORS** is locked down by default and only relaxed to a specific `localhost` origin in `development`.
* **Readiness gating** — requests are rejected with `503` until the store has finished initializing, avoiding partially-initialized state being exposed.
* Because DocStack does not bundle TLS termination itself, production deployments are expected to sit behind a reverse proxy/load balancer that terminates HTTPS — the `Secure` cookie flag and `SameSite=Strict` default assume that boundary exists.

## Where Security Logic Lives

Consistent with DocStack's "logic as data" philosophy (see [Core concepts](./core-concepts.md)), the parts of the security model that change per-application — access rules, encrypted field selection, auth jobs — live in the database as `~Policy`, `~Class`, and `~Job` documents, not hardcoded in application code. Only the cryptographic primitives themselves (RSA/AES-GCM/PBKDF2 operations, JWT signing) are fixed framework code.
