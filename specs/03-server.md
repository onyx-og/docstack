# 03 — Server: one engine on a host, two surfaces

Status: **design, accepted** (ADR-0047, 2026-09-11) · Owner: `onyx-og/docstack`
Builds on: ADR-0001 (transport-agnostic sync), ADR-0030 (a tenant is a stack, grants at
the host), ADR-0045 (access is cryptographic), ADR-0046 (engine sessions), spec 01
(sync), spec 02 (crypto access). Supersedes the `packages/server` preview in full:
nothing under its `src/` is kept.

## 1. The model in one paragraph

`@docstack/server` is the DocStack engine deployed on a host, exposed through **two
surfaces over one engine**. The **API surface** serves online clients and integrations:
a thin client opens a stack *against the server*, replicates nothing, and every read,
write and query runs on the host under a per-request **session** that decides what
plaintext that principal sees. The **replication surface** serves clients that want a
local replica: a Couch-compatible endpoint PouchDB's http adapter drives unchanged, on
which the host is blind by default and ships stored form. The same stack answers both.
The host is also the **authority** (it holds the ABE master key and mints attribute
keys), the place jobs run unattended, the workbench's home, and a peer that mirrors to
CouchDB, Cloudant or another node through the engine's own `stack.sync()`. Offline-first
is one mode an application picks per stack, not the product.

## 2. Non-goals

- A second engine. The host runs `@docstack/client` unchanged (Node 22, the `node`
  conditional export). No Rust, no QuickJS, no separate `Stack` implementation.
- A framework. `node:http` and a hand-written router; `ws` for the socket. Nothing else.
- Authentication as a product. The host verifies JWTs it is configured to trust, or
  passwords in its own store; identity models belong to the application.
- Confidentiality against the host on the API surface. A trusted node holds keys by
  design; the vendor-blind deployment runs it inside the customer's perimeter. The
  replication surface stays blind.
- Topology. Which nodes converge with which is configuration (`upstreams`), never a
  mode baked into the package (ADR-0030 decision 7).

## 3. Surfaces

### 3.1 The API surface

Mounted under `/s/:stack/_ds/`. The `_ds` segment is collision-free: document ids cannot
start with `_`. Every request carries a principal (§5) and runs under
`stack.forSession(session)` (§4). JSON in, JSON out; errors use CouchDB's
`{ error, reason }` shape so one client error path serves both surfaces.

| Route | Backs | Notes |
| :--- | :--- | :--- |
| `GET  _ds/classes` | `getClassNames` | |
| `GET  _ds/classes/:name` | `getClassModel` | The model document; the thin client builds its `Class` from it. |
| `POST _ds/classes` | `addClass` / `updateClass` | A class-document write; subject to the grant's `accept`. |
| `GET  _ds/domains`, `GET _ds/domains/:name` | `getDomainModel` | |
| `POST _ds/find { selector, fields?, skip?, limit?, sort? }` | `view.findDocuments` | Session-narrowed. |
| `POST _ds/query { sql, params? }` | `view.query` | Session-narrowed; a sealed attribute evaluates as `null` in every predicate (encrypted predicates are never pushed into the index). |
| `POST _ds/docs { type, docs: [{ docId, params }] }` | `view.createDocs` | Through the host pipeline: validation, triggers (with the session as fourth argument), encryption, attribution. Returns the written documents as the session reads them. |
| `DELETE _ds/docs/:id` | `view.deleteDocument` | Soft delete; `StackLockedError` outside the session's scopes surfaces as 403 `forbidden`. |
| `POST _ds/pk { className, params }` | the primary-key lookup | `Class.getByPrimaryKeys` reaches `stack.db` today; the thin client asks the host instead. |
| `GET  _ds/feed?classes=A,B&since=<seq>` | `view.subscribeClassDocs` per class | Server-sent events, one `doc` event per change, sealed fields `null`. Heartbeat comment every 15 s; idle timeout (configurable, default 5 min) after which the client reconnects from its last `seq`. |
| later | `_ds/tx`, `exportContent`, attachments | Closed under a session today (ADR-0046). |

Status codes: 401 no or invalid principal; 404 the stack is not in the principal's grant
(indistinguishable from "does not exist"); 403 the grant reaches the stack but not the
operation (`api: false`, a refused class write, a scope the session does not open);
409 a revision conflict from the pipeline; 422 validation.

### 3.2 The replication surface

Mounted under `/s/:stack/`. Exactly what `pouchdb-adapter-http@9` and
`pouchdb-replication@9` drive, verified against their source; nothing more in the first
cut.

| Route | Sent / expected |
| :--- | :--- |
| `GET /s/` | `{ uuid, version }`. The uuid seeds replication ids; it is persisted node state, or every replica re-scans from zero after a redeploy. |
| `GET /s/:stack` | `db.info()`. **404** `{ error: 'not_found', reason: 'Database does not exist.' }` when ungranted. |
| `PUT /s/:stack` | The adapter tries this after a 404. Create only under a `stackTemplates` grant; else 404 again. |
| `DELETE /s/:stack`, `POST …/_compact` | 403 unless the grant says `allowDestroy`. |
| `GET /s/:stack/:docid` | `open_revs` (`all` or a JSON array), `revs`, `latest`, `rev`, `conflicts`; the array form `[{ok}|{missing}]`. |
| `GET|PUT|DELETE /s/:stack/_local/:id` | Replication checkpoints and DocStack's sync marker. A 404 body is `{ error: 'not_found', reason: 'missing' }`. |
| `POST …/_bulk_docs` | `{ docs, new_edits }`; array reply; a per-document `{ error: 'forbidden' }` surfaces client-side as `denied`. |
| `POST …/_bulk_get?revs=true&latest=true` | `{ results: [{ id, docs: [{ok}|{error}] }] }`. A 404/405 makes the adapter fall back to per-document `open_revs`. |
| `POST …/_revs_diff` | `{ id: { missing: [...] } }`. |
| `GET|POST …/_changes` | `style=all_docs`, `since` (may be JSON), `limit` (= `batch_size`, default 25), `include_docs=true` (forced: DocStack's own filter is a function, evaluated client-side), `feed=longpoll` + `heartbeat` for live. Reply `{ results, last_seq }`; the client pages while `results.length >= limit`. |
| `GET|POST …/_all_docs` | Tooling, not replication. |
| not called | `_ensure_full_commit`, `_find`, attachments. |

Reads come from `stack.getReplicationHandle()`: stored form, ciphertext travels, the
decrypting read path is never on the wire. Writes are `new_edits: false` verbatim
writes, exactly as any peer's, and bypass the pipeline by design (spec 01): the
grant's `accept` predicate is the only write gate here.

One host method table serves the HTTP binding and the WebSocket binding (§3.3):
`createChannelHost(db, options)` is extracted from
`packages/pouchdb-adapter-channel/src/host.ts` (the `methods` map and the live feed),
gains `revsDiff` and a Couch-shaped `fetchDoc`, and applies `limit` to **accepted** rows
(a page that filters to zero while `last_seq` advances makes the http client stop
early). `serveChannel` keeps only the frame plumbing on top of it.

Transport facts the design leans on: the http adapter sends `credentials: 'include'`
on every request, so a cookie session makes the plain-URL `stack.sync({ remote })` work
with no resolver; bearer tokens go through `new PouchDB(url, { headers })` in a
resolver. CORS therefore echoes an explicit `origins` list with
`Access-Control-Allow-Credentials: true`, and cookies are `SameSite=None; Secure` when
the UI is cross-origin.

### 3.3 The channel binding

`GET /ws/s/:stack` upgrades to a WebSocket carrying the channel adapter's frames
(`createWebSocketTransport` is a new binding in `@docstack/pouchdb-adapter-channel`;
the driver half is unchanged, `adapter: 'channel'`). Authentication happens at
upgrade time; the grant compiles to the same `ServeChannelOptions` the HTTP binding
uses, so the two bindings enforce identically and one grant spec runs against both.
`documentKey` over the socket is an explicit per-stack grant flag, never a default: the
host is the transport's end, not a relay, so offering the key under a grant is
consistent with ADR-0030 §8. Phase 4.

## 4. Sessions on the host

The engine's session (ADR-0046) is the mechanism; the host owns three things around it.

**Entitlement.** At session creation the host mints `keygen(msk, principal.attributes)`
and attempts every active `~AccessScope` with `decryptCek` (~24 ms each); the scopes
that open are the session's `scopes`. `documentKey` comes from the grant. This is the
same mathematics a device runs, so an online session and a replica of the same
principal agree exactly on what is readable. The result is cached keyed on the
principal's attribute set plus the stack's scope-registry generation, so a rotated
scope or a changed role refreshes it; a session's `id` is the request id.

**The omni key.** A trusted node opens every scope for itself by minting
`keygen(msk, union of policyAttributes(scope.policyString))` over all active scopes and
calling `unlockScopes`; re-minted when a scope appears or rotates. No CEK escrow, no
second key store. A node without a document key and without `msk` is a **blind hub**:
its API serves unsealed fields and `null` for sealed ones, its replication surface
ships ciphertext; a legitimate deployment, stated as such.

**Discipline.** Request handling touches the view returned by `forSession` and nothing
else. The stack itself reads with the whole keyring, which is what a host is for;
`setAuthSession`, `authenticate`, `unlock*`, `dropScopeKeys` are never called on a
served stack after boot. The engine closes these through a view; the host's own code
is the remaining trust.

**Feed fan-out.** `prepareChangeDocument(doc, classObj, session)` decrypts per call.
With N sessions on one stack, the feed decrypts each change once with the full keyring
and redacts per session from that; the SSE module is built so this is a local change
(recorded as engine sessions v2).

## 5. Principals, grants, reachability

**Principal.** Extracted before any route runs, from (in order) a `Bearer` JWT verified
against `auth.jwt.{secret|jwks}` with `issuer`/`audience`, the session cookie the host
itself issued, or Basic credentials against the credential store. Shape:
`{ sub, attributes: string[], claims }`. No principal → 401 on everything except
`/auth/*`, `/health` and, when configured public, the workbench.

**Grant.** `grant(principal)` in configuration returns:

```typescript
{
  stacks: {
    [name]: {
      api?: boolean;                 // the API surface
      pull?: boolean; push?: boolean; // the replication surface, per direction
      classes?: { include?: string[]; exclude?: string[]; includeDataModel?: boolean };
      serve?: (doc) => boolean;      // what leaves on replication, ANDed with the above
      accept?: (doc) => boolean;     // what may arrive on replication, and which class-document writes the API admits
      documentKey?: boolean;         // may open document-key content (API) / receive the key over the channel
      allowDestroy?: boolean;
    }
  },
  attributes?: string[];             // what keygen sees; defaults to principal.attributes
  ui?: boolean;                      // may load the workbench
}
```

A stack name may be a template pattern (`user-*`); a stack matching a template that does
not exist yet is created on first reach under `stackTemplates[pattern]`.

**Compilation** (`grants.ts`): `pull`/`push`/`classes`/`serve`/`accept` fold with
`createClassFilter` and `isInternalDoc` from the client's sync module into
`ServeChannelOptions`, so no principal can push `~system` or pull the ledger whatever
the grant says; `api`/`documentKey` become the session's inputs.

**Reachability rule.** A stack absent from the grant is 404, not 403: existence is not
leaked. A stack in the grant but not the operation is 403. Class-document writes on the
API are ordinary writes gated by `accept`, which is where "only admins author schema"
lives; authoring is a grant, not a mode.

## 6. Credentials and the authority

**Credential store.** `ClientStack.authenticate` never verifies a password (it creates
the session document regardless and only tries to unwrap the key) and mutates per-stack
singleton state, and `~User.password` is `maxLength: 50`; none of it serves a
multi-user host. The host keeps its own store: `{ username, scrypt hash (node:crypto),
attributes, keyDerivationSalt?, wrappedDocumentKey? }`, in a private stack the grant
never reaches. `~User` documents may be mirrored into application stacks for the app's
benefit; they are not the store.

**Session issuance.** `POST /auth/session { username, password }` →
`{ token, expiresAt, stacks: [...visible names], attributeKey, keyDerivationSalt?,
wrappedDocumentKey? }`, plus the cookie. A thin client needs only the token. A replica
additionally adopts `attributeKey` and unwraps `wrappedDocumentKey` in the browser with
the PBKDF2 path the client already has; the host never learns the document key.
`DELETE /auth/session` clears the cookie; `GET /auth/me` returns the principal and its
grant summary. External IdPs skip the route: their JWT is verified directly.

**Authority at rest.** `init` runs `setup()` once. `msk` lives in
`.docstack/authority.json` encrypted under `DS_AUTHORITY_PASSPHRASE` (AES-256-GCM, key
from scrypt), or is supplied by an `authority.load()` hook for a KMS. Losing `msk` ends
key minting and scope rotation; it is backed up out of band and stated as such. `pk` is
public. Scope minting (`ds scope mint <id> '<policy>' --stack <name>`) uses
`ClientStack.buildAccessScope` with the stored `pk` and writes the `~AccessScope`
document into the stack or prints a patch fragment.

**Honesty about lifetimes.** An issued attribute key is a durable capability; token
expiry does not revoke it. Revocation is scope rotation (spec 02 §7); attribute-level
revocation stays on the roadmap.

## 7. Stacks on the host

One `DocStack` from `@docstack/client` holds one `ClientStack` per configured stack,
opened with that stack's patches and keys. That is what makes the node an honest peer:
it has a ledger, publishes its schema version to `_local/docstack-sync`, holds the class
models the workbench reads, and can run `~Job` documents. Everything in `stacks[name]`
that is not the server's own is a `StackOptions`, so `transactions`, `documentKey`,
`accessKeys`, `logLevel` mean what they mean on a device.

- **Storage**: `leveldb` under `storage.dir` (durable default), `memory` for
  development and tests; the http adapter for a stateless node over CouchDB/Cloudant.
- **Readiness**: `/health` answers 503 until every configured stack has opened and
  applied its patches; templates are warm-opened at boot when listed in
  `warm: [...]`, otherwise on first reach (a stack open costs seconds).
- **Jobs**: `jobScheduler.start({ jobs: allow, pinnedHashes })` per stack from
  configuration; the same grammar and allow-list discipline as a device, and a host that
  never sleeps makes `@daily@09:00` exact. `POST /jobs/tick` (admin) runs the
  idempotent `tick()` for external schedulers.
- **Upstreams**: `stack.sync({ remote, direction, live, retry })` on the host, with
  internal-document filtering and the schema gate; the node is a hub in front of
  Cloudant or a mirror of another node. Status is exposed on `/health`.
- **Shutdown**: on `SIGTERM` stop the scheduler, `drain()` running jobs, let the
  upstream cycle finish, close stacks, exit.

## 8. The thin client

`RemoteStack` (`@docstack/client`, own chunk) implements the shared abstract `Stack`
over `_ds/*` and the SSE feed. The hooks in `@docstack/react` call exactly `getClass`,
`getDomain`, `getClassNames`, `addClass`, `findDocuments`, `query`, `subscribeClassDocs`
and `releaseListener`, and `Class` delegates its writes to `stack.createDoc(s)`,
`deleteDocument` and `updateClass`, so a `Class.buildFromModel(remoteStack, model)` is a
working class and no hook changes. `getByPrimaryKeys` goes to `_ds/pk` instead of
`stack.db`.

Configuration: `StackConfig` gains `mode?: 'local' | 'remote'`; in remote mode the
existing `connection` field is the server URL. `DocStack.addStack` constructs the right
kind; `StackProvider` passes `mode` through. Auth is a bearer token in `headers` or the
cookie; the feed reconnects from its last `seq` with backoff. A remote stack has no
`db`, no `sync`, no keys: those members throw the same way a session view's closed
doors do.

The three shapes an application picks per stack: **online** (`mode: 'remote'`, nothing
replicated), **offline** (`ClientStack` plus `sync` to the replication surface),
**hybrid** (a replica narrowed by class filters plus remote queries for what the device
does not hold).

## 9. Configuration

`ds.config.js`, ESM, `defineConfig()` for types; every `DS_*` environment variable
overrides its path (`DS_PORT`, `DS_STORAGE_DIR`, `DS_JWT_SECRET`,
`DS_AUTHORITY_PASSPHRASE`, `DS_DOC_KEY`); `DS_*_FILE` reads a secret from a file.

| Key | Meaning | Default |
| :--- | :--- | :--- |
| `host`, `port` | Listen address | `127.0.0.1`, `5984` |
| `storage.adapter`, `storage.dir` | `leveldb` \| `memory` \| `http` (+ `url`) | `leveldb`, `./data` |
| `keys.documentKey` / `keys.load(stack)` | Trusted-node document key, per stack or via hook | none (blind) |
| `authority` | `{ file, passphrase }` or `{ load() }` | `.docstack/authority.json` |
| `stacks[name]` | `StackOptions` + `{ jobs?: { allow, pinnedHashes } }` | required |
| `stackTemplates[pattern]` | Same, created on first reach under a grant | none |
| `warm` | Template instances opened at boot | `[]` |
| `auth.jwt` | `{ secret \| jwks, issuer?, audience? }` | none |
| `auth.users` | Enable the credential store and `/auth/session` | `false` |
| `auth.session` | `{ ttl, cookie: { name, sameSite, secure } }` | 1h, `ds_session` |
| `grant(principal)` | §5 | deny all |
| `ui` | `{ enabled, path, dir }` | `true`, `/docstack/app`, the bundled workbench |
| `cors.origins` | Explicit list; credentials echoed | `[]` |
| `upstreams[]` | `{ stack, remote, direction, live, retry }` | `[]` |
| `feed` | `{ heartbeatMs, idleMs }` | 15 s, 5 min |
| `durable` | §10, phase 7 | none |

## 10. Deployment shapes

Three kinds of state: **stack data** (LevelDB per stack, including checkpoints, the
sync marker, the ledger and job schedule state), **authority material** (`msk`, backed
up out of band), **regenerable secrets** (JWT secret, the node uuid, the credential
store; the uuid is persisted or replicas re-scan).

- **Stateful node** (VM, Docker with a volume): `data/<stack>/`, `state/authority.json`,
  `state/node.json` on one volume; config mounted read-only; secrets from environment.
  One process per data directory; scaling out is several nodes converging through
  `upstreams`; backup is replication with `lastConvergedAt` as the honesty signal.
- **Stateless node** over CouchDB/Cloudant: `storage.adapter: 'http'`; nodes booting
  together take a startup lock before applying patches.
- **Scale-to-zero** (Cloud Run): working store in memory, a durable store behind a
  transfer adapter (`@docstack/pouchdb-adapter-firestore` first, `-gcs` second; the
  Drive adapter's pattern), boot is a pull, runtime a live push, `awaitConvergence:
  'per-write' | 'async'`, a lease only for stores without transactions, snapshots for
  cold start, feeds with idle timeouts, jobs driven by Cloud Scheduler hitting
  `/jobs/tick`. Never LevelDB on a FUSE mount.

The adapters are benchmarked on one harness (rehydration time and cost, per-write
convergence latency, push throughput, cross-node propagation, monthly bill) before the
deployment docs quote a number.

## 11. Security statement

- **What the host can read.** A trusted node reads everything sealed under keys it
  holds; that is the deployment's choice and the docs say so. A blind hub reads
  nothing sealed. On the API surface confidentiality is per session and enforced by
  the engine (ADR-0046): a session opens exactly the scopes its attribute set
  satisfies, decided with the same mathematics a device would run.
- **What the host enforces.** Reachability (grant), direction and shape (two-sided
  host options), the authoring pipeline on the API (validation, triggers with the
  principal, encryption, attribution), and the replication write gate (`accept`).
- **What it does not.** It does not authenticate writers cryptographically (revision
  signatures stay on the roadmap); attribution (`~createdBy`, `~updatedBy`) is the
  host's word, honest on the API surface where the write is authenticated and absent
  on replicated writes. It does not hide shape: ids, classes, labels, counts and
  timestamps are visible to every session and every replica, and class-scoped
  replication grants leak the ids and revisions of withheld documents through
  `_revs_diff` and `_bulk_get` errors, as CouchDB does.
- **Executable content.** Triggers and jobs run with the host's authority; write
  access to class and job documents is administrative access, gated by `accept`.

## 12. Integration checklist

The phases of the plan, as work items. Each names what it proves.

1. **Client: conditional exports.** `#pouchdb` resolution via package exports (`node` →
   `pouchdb`, `browser`/`default` → `pouchdb-browser`, explicit `./node` and
   `./browser`), a `setPouchDB` registry, multi-entry Rollup. Then the Node spike checked
   in as `packages/server/test/00-engine.spec.mjs` in a fresh minimal package: a
   `ClientStack` on memory and leveldb, patches applied, two Node stacks replicating,
   no `self` shim.
2. **Online mode.** Config, engine, keys and the omni key, auth, grants, entitlement,
   `_ds/*`, the SSE feed, `init`/`serve`; `RemoteStack` and `mode: 'remote'`. Proves
   two sessions read different plaintext from one document, a foreign-scope write
   refuses, a viewer cannot write a class document, an ungranted stack is 404, the
   React hooks run unchanged against a remote stack.
3. **Replication surface.** `createChannelHost`, the Couch routes, longpoll, grants.
   Proves a `ClientStack` converges both ways with `stack.sync({ remote: url })`
   unchanged, checkpoints resume, ciphertext crosses, pull-only sees `denied`.
4. **Channel over WebSocket + workbench.** Grant parity; the UI in remote mode with
   `POST /auth/session`.
5. **Operations.** Upstreams, jobs, health, shutdown.
6. **CLI extras and docs.** Authority and scope commands; the server reference and
   installation pages rewritten from "preview"; runner tables; root cleanup.
7. **Durable stores and deployment.** The two adapters, `durable`, Dockerfile and
   compose, the Cloud Run recipe, the benchmark harness.

## 13. Verification

`node --test` suites in `packages/server/test` against the built `lib/`: `00-engine`,
`api` (query, docs, feed, entitlement, scope refusal, class-write grant), `replication`
(both directions, checkpoint resume, sync marker, ciphertext), `grants` (pull-only,
404, class filter, tombstones), `changes` (longpoll, `limit`/`last_seq` under
filtering), `channel-ws`, `auth`. The client's Playwright suite stays green after the
conditional-exports change; a cross-package check runs the React hooks against a
`RemoteStack`. Manual: `init`, `serve`, `curl` both surfaces, the workbench as two
principals against one sealed document, a mirror to a `couchdb:3` container.

## 14. Known limits

- Class-scoped replication grants leak metadata of withheld documents; the dispatcher
  answers `missing` where it can.
- A blind hub's API returns `null` for every sealed field to every session.
- Attribute keys outlive tokens; revocation is scope rotation.
- Attachments, `_find`, transactions over the API and the `continuous` feed are
  deferred.
- Scale-to-zero nodes trade durability lag or per-write latency for zero idle cost;
  the deployment page states which the configuration chose.
