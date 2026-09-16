# Plan — `@docstack/server` from scratch: one engine on a host, two surfaces

Status: **working plan, in progress** · Design: [`specs/03-server.md`](../03-server.md), [ADR-0047](../adr/0047-the-server-is-a-peer-and-a-service.md) · Sessions: [ADR-0046](../adr/0046-engine-sessions.md)

The spec is the design and the ADR is the decision. This file is the rest: the questions
that shaped them, the decisions taken with the maintainer, the sequencing, the
deployment and adapter detail that the spec only summarises, and the running state.
It was the maintainer's session plan until 2026-09-16 and moves into the repository so
the next session starts from it, not from memory.

## Context

`packages/server` was an Express app with its own 1,100-line `Stack` reimplementation
and an import of a file that did not exist; the docs said "do not build a deployment on
it". The maintainer gave carte blanche to discard it and design around the consumer
experience.

The first draft made the server a replication peer only ("sync target", blind to
content, offline-first as the product). The maintainer rejected that on three points,
all correct:

- **Data volume.** A client should not have to replicate a whole stack to use it. It
  must be able to open a stack *against the server* and pull live, replicating nothing.
  Offline-first is one mode, not the product; treating it as the product turns it into
  a limitation.
- **Confidentiality is the server's job in that mode.** If the engine runs on the host
  for a session, the host holds the keys, runs the pipeline, and decides what plaintext
  that session sees. It can, because it is the **authority** (it holds the ABE master
  key).
- **ADR-0029 does not rule.** It is a downstream proposal from Pads; ADR-0030's refusal
  of the ops-proxy is scoped to *primary storage inside the hub topology*. The docs' own
  premise already lists an HTTP API over the same documents: "third parties do not
  replicate; they call."

Given, still: the engine (`@docstack/client`) is complete; access control is
cryptographic (ADR-0045); a tenant is a stack and grants are enforced at the host
(ADR-0030); the authority half of `@docstack/abe` belongs in the server (roadmap).

Outcome: `npx @docstack/server` daemon, configured by `ds.config.js`, hosting N stacks
with **two surfaces over one engine**: a DocStack API for online clients and
integrations (the engine runs on the host, per-session confidentiality), and a
Couch-compatible replication surface for clients that want a local replica (blind by
default). Plus: the authority, server-side jobs, the workbench, upstream mirroring to
CouchDB/Cloudant.

## Decisions taken with the maintainer (2026-09-10, updated 2026-09-11)

1. **Online mode first.** The API surface and the thin client ship before the
   replication surface. HTTP before WebSocket on both.
2. **HTTP layer:** bare `node:http` with a hand-written router, `ws` for the socket. No
   Express, no Hono.
3. **Spec and ADR first:** `specs/03-server.md` and ADR-0047 landed before code. (0046
   became the engine-sessions ADR on 2026-09-11.)
4. **Runtime seam in the client:** conditional exports.
5. **Carte blanche:** nothing under the old `packages/server/src` was kept or consulted;
   phase 2 replaced it wholesale, with the docs' TypeDoc entry for it and the
   `skipErrorChecking` special-case going at the same time.
6. **Branch:** work lands on `develop` (created at `main` on 2026-09-11). Commits carry
   the Claude co-author line; nothing is pushed without being asked.

## State as of 2026-09-16

- **Engine sessions** (ADR-0046) are done and committed on `develop` (`50fef0c`
  sources, `f9dea0b` built site): `stack.forSession(session)`, `StackSession` in
  `@docstack/shared`, attribution (`~createdBy`, `~updatedBy`), refusal in the plugin,
  the fourth argument for triggers and jobs, closed doors via `StackSessionError`, a
  narrowed `db` handle, the "Act as a session" guide, and three fixes found on the way
  (bare `FROM` alias detection, encrypted predicates kept out of index pushdown, the
  `~scope` label carried through projections). Client suite: 154 passed.
- **Phase 0** (spec 03, ADR-0047) is `e2e7ee5`. **Phase 1** (conditional exports,
  `setDefaultLogLevel`, root PouchDB alignment, the Node spike
  `packages/server/test/00-engine.spec.mjs` passing 3/3) is `b03b87e` + `bfc0b25`.
- **Phase 2 is written but has not been built or tested** (written 2026-09-11,
  committed as WIP `ce057be` on 2026-09-15). On disk: the server package rewritten from
  scratch (`packages/server/src`: config schema and loader, stack registry with the omni
  key and scope registry, authority at rest, scrypt credential store, `jose` tokens,
  principal extraction, grant compilation, entitlement, the per-request session opener,
  `node:http` server + router + Couch-shaped errors, `_ds/*` routes, SSE feed with
  catch-up, `/auth/*`, `/health`, `init`/`serve` CLI, README, CHANGELOG); `RemoteStack`
  in the client (`src/core/remote-stack.ts`) with `StackConfig.mode`/`token`/
  `headers`/`fetch` and the `DocStack.addStack` branch; tests `test/harness.mjs`,
  `test/api.spec.mjs`, `test/auth.spec.mjs`. **None of it has been compiled.** Resuming
  phase 2 means: sync to the build copy, `npm install` (new server deps, workspace
  link), build shared → client → server → react, run the server suites and Playwright,
  fix what the compiler and the tests surface, then a real commit.
- **Workbench** (2026-09-15, `a3a7512`, `b59f596`): on React 19 with one React per
  bundle (root `overrides` plus webpack aliases), the debug panel rewired to
  `exportContent`/`importContent`/`removeStack`, and a Playwright smoke test against
  the production build in `packages/ui/smoke/` (`npm run test` there). Still stale in
  the UI: the login "Server" target is wired to the deleted `/login` shape and becomes
  `mode: 'remote'` in phase 4; the webpack warnings have not been inspected; the
  UI's build devDependencies still live in the root `package.json`.

## The questions, answered

| Question | Answer |
| :--- | :--- |
| **Rust + rquickjs?** | No, not for the engine. Node 22 (V8) running `@docstack/client` unchanged. QuickJS has no JIT (5–30× slower on the same code) and every PouchDB storage adapter is Node-native. Single binaries come from Node SEA or `bun build --compile`; a Rust wrapper, if ever, is a supervisor. |
| **Express overkill?** | Yes. `node:http` + a `Map`-based router with `:stack`/`:docid` params; `ws` for upgrades. ~25 routes total. |
| **Client: `sync()` or a stack resolving against the server?** | **Both, first-class, same app code.** `mode: 'remote'` opens a thin `RemoteStack` that calls the server and subscribes to its feed; `mode: 'local'` (today's `ClientStack`) keeps a replica and syncs. Hooks and `Class` objects work against either because both implement the shared abstract `Stack`. A third shape, hybrid, is a local replica narrowed by class filters plus remote queries for what the device does not hold. |
| **Confidentiality?** | **Server-side for API sessions, cryptographic for replicas.** For an API session the host holds the full keyring (document key from config or a KMS hook; every scope opened with an authority-minted omni key) and serves each session only what that session's attribute set unlocks, decided by the same CP-ABE math a device would run. For replication the host ships stored form; a replica opens what its own keys open. |
| **Granular access?** | Three layers in three places: **reachability** (grant per principal: stacks, `pull`/`push`/`api`, class filters; ungranted = 404), **content** (scopes: per-session entitlement on the API, ciphertext on the wire for replicas), **behaviour** (`accept`/`serve` predicates; on the API surface the full authoring pipeline runs on the host, so triggers and validation are enforced, not requested). |
| **Memory adapter first?** | Yes for `serve --dev` and tests; LevelDB is the durable default. |
| **CouchDB / Cloudant?** | Compatible both ways: replicas talk to the node with PouchDB's http adapter as to CouchDB; the node mirrors to CouchDB/Cloudant with the engine's own `stack.sync()`. |

## The consumer experience

### App developer: pick a mode per stack, keep the code

```tsx
<StackProvider config={[
    { name: 'my-app', connection: 'https://ds.example.com/s/my-app', mode: 'remote' },   // online: nothing replicated
    { name: 'notes',  patches: NOTE_PATCHES, sync: { remote: 'https://ds.example.com/s/notes' } }, // local replica
]}>
```

```typescript
const stack = await docstack.addStack({ name: 'my-app', connection: 'https://ds.example.com/s/my-app', mode: 'remote' });
const { rows } = await stack.query('SELECT title FROM Task WHERE isComplete = false');   // runs on the host
const taskClass = await stack.getClass('Task');
await taskClass.add({ title: 'Ship it' });                                             // pipeline runs on the host
stack.subscribeClassDocs('Task', target);                                             // live over the server feed
```

`useClassDocs`, `useQuerySQL`, `useClass`, `useFind`, `useDomain*` are unchanged: they
call exactly `getClass`, `getDomain`, `getClassNames`, `addClass`, `findDocuments`,
`query`, `subscribeClassDocs`, `releaseListener`, and `Class` delegates its writes to
`stack.createDoc(s)`/`deleteDocument`/`updateClass`. `RemoteStack` implements that
contract over HTTP and a live feed. No new hooks.

Login is one call for both modes: `POST /auth/session { username, password }` →
`{ token, expiresAt, stacks, attributeKey, keyDerivationSalt?, wrappedDocumentKey? }`.
A remote stack needs only the session (the host decrypts for it). A local replica
additionally adopts `attributeKey` and unwraps `wrappedDocumentKey` in the browser, as
today. Apps with their own IdP send that IdP's JWT instead, verified against
`auth.jwt.{secret|jwks}`. The http adapter sends `credentials: 'include'`, so a cookie
session also makes the plain-URL `stack.sync({ remote })` work with no resolver.

### Operator: a config file and two commands

```bash
npx @docstack/server init     # ds.config.js; ABE master pair and JWT secret into .docstack/
npx @docstack/server serve
```

```javascript
import { defineConfig } from '@docstack/server';
export default defineConfig({
    host: '127.0.0.1', port: 5984,
    storage: { adapter: 'leveldb', dir: './data' },                      // 'memory' for dev/tests
    keys: { documentKey: process.env.DS_DOC_KEY },                       // or load: async (stack) => kms.get(...)
    stacks: { 'my-app': { patches: PATCHES, jobs: { allow: ['Job-NightlyReport'] } } },
    stackTemplates: { 'user-*': { patches: USER_PATCHES } },             // created on demand under a grant
    auth: { jwt: { secret: process.env.DS_JWT_SECRET, issuer: 'my-app' }, users: true },
    grant: (principal) => ({
        stacks: {
            'my-app': { api: true, pull: true, push: !principal.roles.includes('viewer'),
                        accept: (doc) => doc['~class'] !== 'class' || principal.roles.includes('admin') },
            [`user-${principal.sub}`]: { api: true, pull: true, push: true, documentKey: true },
        },
        attributes: principal.roles.map(r => `role:${r}`),
        ui: principal.roles.includes('admin'),
    }),
    ui: { enabled: true, path: '/docstack/app' },
    cors: { origins: ['https://app.example.com'] },
    upstreams: [{ stack: 'my-app', remote: process.env.CLOUDANT_URL, direction: 'both', live: true }],
});
```

A stack with keys is a **trusted node** (API sessions get plaintext by entitlement;
jobs see plaintext). A stack without keys is a **blind hub**: its API serves unsealed
fields and `null` for sealed ones, its replication surface ships ciphertext. Both are
supported and documented; vendor-blind deployments run the trusted node inside the
customer's perimeter.

### Schema author: the workbench, online

The hosted workbench (`/docstack/app`, gated by `grant.ui`) opens the server's stacks
in `mode: 'remote'`: no local replica, and "see the data as a given session sees it" is
literally an engine session's view. Class-document writes go through the API and the
`accept` grant.

## Architecture

```
                         ┌──────────────────────────── @docstack/server ─────────────────────────────┐
  RemoteStack ─── http ──┤  /s/:stack/_ds/*   DocStack API: find, query, docs, classes, feed (SSE)   │
  (thin, live feed)      │                    ─→ engine session (entitlement + redaction)  ─┐          │
                         │  /s/:stack/*       Couch replication surface ─→ createChannelHost│          │
  ClientStack ─── http ──┤  /ws/s/:stack      channel host over WebSocket (phase 4)        ├─ stacks  │
  (replica, sync)        │  /auth/*           session, JWT, keygen                          │  DocStack│
                         │  /docstack/app     workbench                                     │  N×Client│
                         │  /health, GET /s/                                                │  Stack   │
                         │  authority.ts · jobs.ts · upstreams.ts                           ▼          │
                         └──────────────────────────────────────────────────────────────────────────┘
```

- **One engine, N stacks.** A `DocStack` from `@docstack/client` with one `ClientStack`
  per configured stack, opened with its patches and keys: ledger, schema version on
  `_local/docstack-sync`, class models, jobs.
- **Engine sessions** (landed, ADR-0046) are the mechanism behind the API surface. The
  host builds one `StackSession` per request (`{ id, principal: { sub, attributes },
  scopes, documentKey }`) and calls `stack.forSession(session)`; the view narrows every
  read (`findDocuments`, `findDocumentsIterator`, `getDocument`, `query`, `queryStream`,
  `subscribeClassDocs`, `db.get`) to the entitled scopes, carries the session into the
  pipeline on writes (attribution, `StackLockedError` outside the entitlement, the
  fourth argument for triggers and jobs), builds `Class` instances bound to the view,
  and throws `StackSessionError` for whole-stack members. Pinned by
  `packages/client/src-test/engine-sessions.test.ts`. What the host still owns:
  - *Entitlement*: at session start, `keygen(msk, principal.attributes)` and one
    `decryptCek` attempt per active `~AccessScope` (~24 ms each) yields the scope ids
    this session opens; `documentKey` comes from the grant. Same math a device runs, so
    online and replica sessions agree exactly. Cache it keyed on the principal's
    attribute set plus the stack's scope registry generation
    (`accessScopeRegistryDirty`), so a rotated scope or a changed role refreshes it.
  - *Discipline*: request handling touches the view only; the stack itself reads with
    the whole keyring (that is what a host is for). `setAuthSession` stays public for
    device-side custom auth and is documented as whole-stack state a host must never
    call; no engine guard exists for it.
  - *Feed fan-out*: `prepareChangeDocument(doc, classObj, session)` decrypts per call
    today. With N sessions on one stack the host decrypts once with the full keyring
    and redacts per session (recorded as engine sessions v2 on the roadmap); the SSE
    feed is built so that optimisation is a local change.
  - *Not narrowed yet*: transactions and `exportContent` under a session are closed
    rather than narrowed, so `_ds/tx` and export stay deferred.
- **The omni key.** A trusted node opens every scope by minting itself `keygen(msk,
  union of policyAttributes(scope.policyString))` and calling `unlockScopes`; re-minted
  when a new scope appears. No CEK escrow, no second key store.
- **Replication surface reads from `stack.getReplicationHandle()`**: stored form; a
  replica opens what its own keys open. One host method table serves both bindings:
  extract `createChannelHost(db, options)` from
  `packages/pouchdb-adapter-channel/src/host.ts`, add `revsDiff` and a Couch-shaped
  `fetchDoc`, and apply `limit` to **accepted** rows (a page that filters to zero while
  `last_seq` advances makes the http client stop early; latent in the channel driver
  today, gets its regression test there).
- **`grants.ts`** compiles a principal's grant into API entitlement (`api`) and host
  options (`pull`/`push`/`classes`/`accept`/`serve`), folding `createClassFilter` and
  `isInternalDoc` so nobody pushes `~system` or pulls the ledger. `documentKey` over
  the socket is an explicit flag, never a default.
- **Authority.** `init` runs `setup()`; `msk` lives in `.docstack/authority.json`
  encrypted under `DS_AUTHORITY_PASSPHRASE` (or `authority.load()` for KMS). Attribute
  keys are durable capabilities; token expiry does not revoke them, revocation is scope
  rotation (roadmap: attribute revocation). Stated in the spec.
- **Jobs**: `jobScheduler.start({ jobs, pinnedHashes })` per stack; a host that never
  sleeps makes `@daily@09:00` exact. **Upstreams**: `stack.sync()` on the server,
  internal-doc filtering and the schema gate included.
- **Replicated writes bypass the pipeline by design** (pristine `bulkDocs`); on the
  replication surface the `accept` grant is the only write gate. On the API surface the
  pipeline is the gate. The README says both.

### The API surface (`_ds` is collision-free: doc ids cannot start with `_`)

| Route | Backs |
| :--- | :--- |
| `GET /s/:stack/_ds/classes`, `GET …/classes/:name`, `POST …/classes` | `getClassNames`, `getClass`/`getClassModel`, `addClass`/`updateClass` |
| `GET /s/:stack/_ds/domains`, `…/domains/:name` | `getDomain`/`getDomainModel` |
| `POST /s/:stack/_ds/find { selector, fields, skip, limit, sort }` | `findDocuments`, session-redacted |
| `POST /s/:stack/_ds/query { sql, params }` | `query`, under the session |
| `POST /s/:stack/_ds/docs { type, docs: [{ docId, params }] }`, `DELETE …/docs/:id` | `createDoc(s)`, `deleteDocument`, through the host pipeline |
| `GET /s/:stack/_ds/feed?classes=A,B` (SSE; over the WS channel later) | `onClassDoc` → `subscribeClassDocs`, redacted per session |
| `POST /s/:stack/_ds/pk { className, params }` | the primary-key lookup `Class` does through `stack.db` today |
| later | transactions (`_ds/tx`), `exportContent`, attachments |

### The replication surface (verified against `pouchdb-adapter-http@9` / `pouchdb-replication@9`)

| Route | What the adapter sends / expects |
| :--- | :--- |
| `GET /s/` | `{ uuid, version }`; seeds replication ids |
| `GET /s/:stack` | `db.info()`; **404** `{ error: 'not_found', reason: 'Database does not exist.' }` when ungranted |
| `PUT /s/:stack` | attempted after a 404 by the adapter: create only under a `stackTemplates` grant, else 404 again |
| `DELETE /s/:stack`, `POST …/_compact` | 403 unless `allowDestroy` |
| `GET /s/:stack/:docid` | `open_revs`, `revs`, `latest`, `rev`, `conflicts`; array form `[{ok}|{missing}]` |
| `GET|PUT|DELETE /s/:stack/_local/:id` | checkpoints and the sync marker; 404 body `{ error: 'not_found', reason: 'missing' }` |
| `POST …/_bulk_docs` | `{ docs, new_edits }`; array reply; per-doc `{ error: 'forbidden' }` surfaces as `denied` |
| `POST …/_bulk_get?revs=true&latest=true` | `{ results: [{ id, docs: [{ok}|{error}] }] }`; 404/405 makes the adapter fall back to `open_revs` |
| `POST …/_revs_diff` | `{ id: { missing } }` |
| `GET|POST …/_changes` | `style=all_docs`, `since` (may be JSON), `limit` (= `batch_size`, 25), `include_docs=true` (forced: DocStack's filter is a function, evaluated client-side), `feed=longpoll` + `heartbeat` for live; `{ results, last_seq }`; client pages while `results.length >= limit` |
| `GET|POST …/_all_docs` | tooling, not replication |
| not called | `_ensure_full_commit`, `_find`, attachments |

Errors use CouchDB's `{ error, reason }` shape and codes (401 → `denied`, 404, 409).
CORS: explicit `origins` echoed with `Access-Control-Allow-Credentials: true`; cookies
`SameSite=None; Secure` when the UI is cross-origin.

### What the node is, in CouchDB terms

| CouchDB / Cloudant | `@docstack/server` |
| :--- | :--- |
| `_security` per db | `grant(principal).stacks[name]`; ungranted is 404 |
| `validate_doc_update` | the host pipeline on the API; `accept`/`serve` on replication |
| `_users` + `_session` / JWT | `POST /auth/session` over a server-owned credential store, or external JWT |
| `_replicator` | `upstreams[]` through `stack.sync()` |
| `couch_peruser` / Envoy | `stackTemplates['user-*']` |
| `_find` | `_ds/find` and `_ds/query` (SQL) |
| per-document access | scopes: per-session entitlement online, ciphertext for replicas |
| nothing | patches applied on the host, schema gate, `~Job` scheduler, the authority |

## Client changes (`@docstack/client`)

**Conditional exports** (landed in phase 1; proven first: `pouchdb-browser` throws at
module scope in Node on `self.setImmediate`, everything else the engine touches exists
in Node 22):

- `src/core/pouchdb.ts`: `setPouchDB(ctor)` / `getPouchDB()`. Runtime sites in
  `src/core/stack.ts`, `src/core/sync/index.ts` and `src/plugins/pouchdb.ts` use
  `getPouchDB()`; value imports became `import type`.
- `src/exports.ts` holds the re-export list; `src/index.ts` registers `pouchdb-browser`,
  `src/node.ts` registers `pouchdb`; `setPouchDB` exported for hosts.
- `rollup.config.js`: three configs (UMD on `index`, browser ESM with chunks, a
  self-contained Node ESM with `browser: false`); `pouchdb` in `external`.
- `package.json`: `"exports": { ".": { "types", "node": "./lib/node.js", "browser":
  "./lib/index.js", "default": "./lib/index.js" }, "./node", "./browser" }` (explicit
  subpaths for bundlers that ignore conditions and for jsdom runners); `pouchdb ^9` in
  the peers, both optional.
- Same change: the fossil Express block in `src/core/index.ts` deleted;
  `setDefaultLogLevel()` added to `src/utils/logger/index.ts`.

**Engine sessions** are in (ADR-0046); nothing further is needed in the client for the
API surface's confidentiality. The host-side pieces (entitlement, caching, feed fan-out)
are server code.

**`RemoteStack`** (`src/core/remote-stack.ts`, written in phase 2, unverified):
implements the shared abstract `Stack` over `_ds/*` + the SSE feed;
`Class.buildFromModel(remoteStack, model)` gives working `Class` objects. `StackConfig`
gains `mode?: 'local' | 'remote'` and the `connection` it already has becomes the server
URL in remote mode; `DocStack.addStack` constructs the right one. Auth via `headers` or
cookies, re-read on reconnect. Not in the bundle unless imported (own chunk).

**Server-owned credentials.** `ClientStack.authenticate()` never verifies a password
and mutates per-stack singleton session state, and `~User.password` is `maxLength: 50`;
the server keeps its own store (scrypt via `node:crypto`, attributes, optional wrapped
key material) and may mirror `~User` for the app.

## Package layout

```
packages/server/
  package.json        type: module, engines node>=22, bin { docstack-server, ds }, exports ".", files [lib]
                      deps: @docstack/client, @docstack/abe, @docstack/shared, @docstack/pouchdb-adapter-channel (workspace),
                            ws ^8.21, jose ^6.2, pouchdb ^9, pouchdb-adapter-memory ^9, pouchdb-find ^9, zod ^4.1
                      dev: typescript ^5.7, @types/node ^22, @types/ws, @types/pouchdb, @types/pouchdb-adapter-memory
  tsconfig.json       mirror packages/pouchdb-adapter-channel: ES2022, NodeNext, strict, composite, references shared/client/channel
  src/index.ts                createServer(config), defineConfig, types
  src/config/{schema,load}.ts Zod schema + defineConfig; import(ds.config.js) + DS_* env overrides
  src/engine/pouchdb.ts       one constructor: pouchdb + find + memory + ChannelPlugin; setPouchDB() once
  src/engine/stacks.ts        StackRegistry: ClientStack per stack (leveldb prefix / memory), keys, omni-key unlock, templates, readiness
  src/engine/logging.ts       process logger; quiets the client's module loggers
  src/session/entitlement.ts  principal attributes → attribute key → entitled scope ids (cached, invalidated on scope rotation)
  src/session/index.ts        builds the StackSession per request and hands it to stack.forSession(); decrypt-once/redact-per-session feed
  src/auth/principal.ts       Bearer JWT | cookie | Basic → Principal
  src/auth/jwt.ts             jose sign/verify, JWKS
  src/auth/users.ts           scrypt credential store
  src/auth/grants.ts          grant(principal) → api entitlement + host options (createClassFilter + isInternalDoc + custom fns)
  src/auth/authority.ts       pk/msk at rest, keygen, scope minting
  src/http/{server,router,errors}.ts   node:http listener, pattern router, Couch error JSON
  src/http/api.ts             /s/:stack/_ds/* under engine sessions
  src/http/feed.ts            SSE feed with heartbeat, per-session narrowing, reconnect from last seq
  src/http/couch.ts           /s/* replication routes over createChannelHost          (phase 3)
  src/http/changes.ts         normal + longpoll, limit on accepted rows              (phase 3)
  src/http/session.ts         /auth/session, /auth/me
  src/http/ui.ts              static workbench + SPA fallback, gated by ui grant     (phase 4)
  src/ws/{transport,server}.ts   ChannelTransport over ws; upgrade-time auth; serveChannel per connection   (phase 4)
  src/jobs/scheduler.ts       jobScheduler.start per stack                          (phase 5)
  src/upstreams/index.ts      server-managed stack.sync()                           (phase 5)
  src/cli/{main,init,serve}.ts
  test/harness.mjs            server on port 0, memory storage; RemoteStack and ClientStack via @docstack/client/node
  test/*.spec.mjs             node:test
```

`packages/pouchdb-adapter-channel`: export `createChannelHost`, add `revsDiff` +
`fetchDoc`, fix accepted-row `limit` with a regression test.

Root `package.json`: `start:server`/`develop:server`/`build:server` point at a
`./server` directory that does not exist; the server-only dependencies (`express`,
`express-winston`, `cookie-parser`, `cors`, `dotenv`, `jsonwebtoken`, `winston*`, `fs`,
`pouchdb-node`, `pouchdb-replication-stream`) and their `@types` move into the package
or go, together with the UI's build devDependencies moving into `packages/ui`. Listed
because AGENTS.md forbids doing it unasked; it is part of this rewrite (phase 6).

## Phases

0. **Design record.** *(Done 2026-09-11, `e2e7ee5`.)* `specs/03-server.md` and
   ADR-0047, with the addendum to ADR-0030 that both replication bindings share one host
   method table and the note that ADR-0029 is a downstream proposal; the 0047 row in
   `packages/docs/docs/contributing/decision-records.md`.
1. **Client: conditional exports.** *(Done 2026-09-11.)* The runtime seam above, then
   the Node spike checked in as `packages/server/test/00-engine.spec.mjs` in a fresh
   minimal `packages/server`: a `ClientStack` on memory and on leveldb in a tmp dir,
   system patches applied, two Node stacks replicating in-process, no `self` shim.
   Proved: Playwright green, `import '@docstack/client'` works in Node,
   `stack.sync({ remote: 'http://…' })` resolves through the Node http adapter.
2. **Online mode.** *(Written 2026-09-11, unverified; WIP `ce057be`.)* Config, engine,
   keys + omni key, auth (`/auth/session`, JWT, credential store), grants, entitlement +
   `stack.forSession` per request, `_ds/*` routes, SSE feed, `init` + `serve`;
   `RemoteStack` + `mode: 'remote'` in the client. Proves: a `RemoteStack` in Node runs
   a query, adds through `Class`, and receives the change on its feed; two sessions with
   different attributes read different plaintext from the same document (one sees
   `amount`, the other `null`) and a write into a scope the session does not open is
   refused; a viewer principal cannot write a `class` document; an ungranted stack is
   404; React hooks unchanged against a remote stack (cross-package check).
3. **Replication surface.** `createChannelHost` extraction, `couch.ts` + `changes.ts`,
   replication grants. Proves: a `ClientStack` replicates both ways over real HTTP with
   `stack.sync({ remote: url })` unchanged; checkpoints resume; longpoll wakes; the sync
   marker round-trips; an encrypted attribute crosses as ciphertext; pull-only sees
   `denied`; tombstones travel through class filters.
4. **WebSocket channel + workbench.** `ws/*`, grant parity with HTTP; feed over the
   socket; UI hosting at `/docstack/app` with `mode: 'remote'` stacks and the UI's login
   switched to `POST /auth/session`.
5. **Operations.** `upstreams`, `jobs`, `/health` (503 while opening; warm-open
   templates), graceful shutdown. Proves: a change reaches an upstream node; a scheduled
   `workerPlatform: 'server'` job runs unattended.
6. **CLI extras and docs.** `authority setup`, `user add`, `token issue`, `scope mint`;
   rewrite `packages/docs/docs/reference/server.md`, the intro/installation "not
   published" notes, the React guide's mode section; runner tables in `AGENTS.md`,
   `CONTRIBUTING.md` and `monorepo-and-builds.md` (Jest → `node:test`); drop the server
   special-case in `packages/docs/docusaurus.config.ts`; root cleanup.
7. **Durable stores and deployment.** `@docstack/pouchdb-adapter-firestore` first,
   `@docstack/pouchdb-adapter-gcs` second (both transfer adapters on the Drive adapter's
   pattern, see below), the `durable` config section, the Dockerfile and compose file,
   the Cloud Run recipe, and the adapter benchmark harness. Proves: a node on the
   memory adapter rehydrates from each store, converges continuously, survives
   `SIGTERM` with per-write durability, and the benchmark table is reproducible.

## Deployment shapes

Three kinds of state, treated differently: **stack data** (one LevelDB directory per
stack, holding checkpoints, the sync marker, the ledger and job schedule state),
**authority material** (the ABE master pair: losing `msk` ends key minting and scope
rotation, so it is backed up out of band), and **regenerable secrets** (JWT secret, the
server uuid that seeds replication ids, the credential store; persist the uuid or every
replica re-scans from zero).

- **Stateful node (VM, Docker with a volume).** One named volume: `data/<stack>/` for
  LevelDB, `state/authority.json` (msk encrypted under `DS_AUTHORITY_PASSPHRASE`),
  `state/node.json` (uuid, jwt secret). Config mounted read-only at
  `/etc/docstack/ds.config.js`; passphrase, document keys and IdP secrets from
  environment or `DS_*_FILE` secrets, never from the volume. LevelDB imposes one process
  per directory (no shared volumes; scaling out is several nodes with their own volumes
  converging through `upstreams`) and no consistent hot copy (backup is replication to
  another store, with `lastConvergedAt` as the honesty signal; `ds backup` covers the
  cold case). `HEALTHCHECK` on `/health`; `SIGTERM` stops the scheduler, drains jobs,
  finishes the upstream cycle, closes stacks; non-root user.
- **Stateless node over CouchDB/Cloudant.** `storage` points at the http adapter; the
  container holds no data, Couch owns durability and clustering. Every engine read is a
  network hop, and nodes booting together take a startup lock before applying patches.
  Authority material is a secret, not state.
- **Scale-to-zero (Cloud Run).** Working store in instance memory (`adapter: 'memory'`,
  or LevelDB on tmpfs), a durable store behind a transfer adapter, boot is a pull,
  runtime is a live push. Not LevelDB on a FUSE mount: no locking, whole-object
  rewrites, no compare-and-swap, and instances overlap during deploys. Costs to state:
  durability lag unless `awaitConvergence: 'per-write'`; cold start proportional to the
  change log unless a snapshot object (working store gzip to GCS at graceful shutdown or
  on a schedule) plus a tail since it, or lazy per-stack hydration with an LRU;
  request-based CPU throttling stalls the live push and the scheduler, so either CPU
  always allocated or per-write durability plus Cloud Scheduler hitting `/jobs/tick`
  (the client scheduler's idempotent `tick()` was built for external wake signals);
  open SSE feeds and longpolls pin instances, so feeds carry an idle timeout and clients
  reconnect from their last sequence. Secrets from Secret Manager.

```javascript
durable: {
    remote: (stack) => new PouchDB(stack.name, { adapter: 'firestore', project: 'my-app' }),   // or 'gcs'
    hydrate: 'pull-then-serve',                // boot: pull until converged, then answer requests
    push: 'live',
    awaitConvergence: 'per-write' | 'async',   // API responds after the write reached the store, or not
    lease: false,                              // true for stores without transactions (GCS): one active writer
    snapshot: { to: 'gs://my-app-snapshots', every: '@daily' },
},
```

## Durable-store adapters

Both follow the Drive adapter's shape (a store holding stored-form documents with rev
trees and an ordered change log, driven only by the replicator, `pouchdb-merge` inside
`_bulkDocs`, the five obligations of `specs/01-sync.md` as the checklist). Ciphertext
stays ciphertext in either store.

| | Firestore | GCS |
| :--- | :--- | :--- |
| Multi-writer | Safe: sequence allocated in a transaction, real CAS per document; several instances converge through the store, no lease | One active writer per bucket via a generation-match lease object |
| Per-write durability | Tens of ms, 500 ops atomic per batch: affordable as the default | One object upload per batch: async by default |
| Inbound changes | `onSnapshot` on the changes collection pushes other writers' changes to the node | Poll |
| Rehydration | Billed per document read, per instance; pair with a GCS snapshot object or lazy per-stack hydration | One download per log object; log compaction needed |
| Limits | 1 MiB per document (attachments to GCS by reference); stale `_local` checkpoints pruned by age | Object semantics only; FUSE is for reading snapshots and inspection, never the lease or the log |
| Layout | `stacks/{stack}/meta/state`, `docs/{id}` (winner, rev tree, seq), `changes/{seq}`, `checkpoints/{id}` | `stacks/{stack}/meta.json`, `changes/{n}.json`, `snapshots/{seq}.tar.gz` |
| Ecosystem | Firebase Auth is a JWKS for `auth.jwt`; the backup is queryable from the console, Functions and BigQuery export | Cheapest storage; also the snapshot sidecar for the Firestore shape |

Recorded follow-on, not the first cut: Firestore as primary storage (a storage adapter
with a warm cache: instant cold start, no memory bound, every engine read a round trip,
Mango and SQL pushdown needing a query translation).

## Adapter benchmarks

Once the adapters exist, one harness compares them on the same workload so the
deployment choice is measured rather than argued: cold-start rehydration time and cost
per 10k/100k documents, per-write convergence latency (p50/p95), sustained push
throughput, live-change propagation delay between two nodes, and the storage bill per
month at a fixed change rate. Candidates: leveldb (stateful baseline), memory +
Firestore, memory + GCS, http over CouchDB, and the channel host in-process as the upper
bound. Same shape as the client's `zz-bench`, opt-in behind `BENCH=1`, figures quoted
in the deployment docs come from it.

## Verification

- **Runner:** `node --test` on `.mjs` specs against the built `lib/` (the channel
  package's build-then-test flow, zero new dependencies). Suites: `00-engine`, `api`
  (query, docs, feed, entitlement, scope refusal, class-write grant), `replication`
  (both directions, checkpoint resume, marker, ciphertext), `grants` (pull-only, 404,
  class filter, tombstones), `changes` (longpoll, `limit`/`last_seq` under filtering),
  `channel-ws`, `auth`.
- **Client:** Playwright suite (154 today, including `engine-sessions`,
  `crypto-predicate` and `query-bare-from`) unchanged after phase 1; a cross-package
  check (outside the default suite, per CONTRIBUTING) runs the React hooks against a
  `RemoteStack`.
- **Workbench:** the smoke test in `packages/ui/smoke/` against the production build
  (one React in the bundle, a fresh stack opened, export and restore through the debug
  panel) before the hosted build under `packages/docs/static/app` is refreshed.
- **Build copy:** on WSL, rsync to an ext4 copy with `packages/*/lib`,
  `test/vendor-bundle.js`, `test-results`, `.rollup.cache`, `packages/ui/build` and the
  built site excluded, then rebuild before any test run; `npx playwright test` skips
  `pretest`, and a stale `lib/` copied over silently tests old code.
- **Manual:** `npx @docstack/server init && serve`, `curl` `_ds/query` and the Couch
  routes, open `/docstack/app` and log in as two principals with different roles
  against one sealed document; mirror to a `couchdb:3` container and watch
  `lastConvergedAt`.
- **Benchmarks:** `BENCH=1 node --test test/zz-bench.mjs` runs the adapter comparison
  above against emulators (Firestore emulator, fake-gcs-server) locally and against
  real services in a manual run.

## Known limits, stated in the spec

- Class-scoped replication grants leak metadata (`_revs_diff`, `_bulk_get` errors
  reveal ids/revisions), as CouchDB does; the dispatcher answers `missing` where it can.
- A blind hub's API returns `null` for sealed fields to every session; that is the
  deployment's choice, not a bug.
- Attribute keys outlive tokens; revocation is scope rotation.
- Attachments, `_find`, transactions over the API (`forSession` closes
  `beginTransaction`) and the `continuous` feed are deferred.
- Scale-to-zero nodes trade durability lag or per-write latency for zero idle cost; the
  deployment page states which the `durable` config chose.
