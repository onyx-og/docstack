# ADR-0047 — The server is a peer and a service: one engine, two surfaces, confidentiality per session at the host

Status: accepted · Date: 2026-09-11 · Spec: `specs/03-server.md`

## Context

`packages/server` is an Express application with its own 1,100-line `Stack`
reimplementation, RSA-encrypted passwords, a Cloudant-specific replication service, and
an import of a file that does not exist; the docs say not to build on it. The
maintainer discarded it and asked for a design around the consumer experience.

The first design made the host a replication peer only: a Couch-compatible surface, blind
to content, offline-first as the product. It was rejected on three points. **Data
volume**: a client should not have to replicate a whole stack to use it; it must be able
to open a stack against the server and pull live. **Confidentiality**: if the engine runs
on the host for a session, deciding what plaintext that session sees is the host's job,
and it can do it because it is the authority. **Precedent**: ADR-0029 is a downstream
proposal from Pads, not a ruling, and ADR-0030's refusal of the ops-proxy is scoped to
primary storage inside the hub topology; the docs' own premise for a server already
listed an HTTP API over the same documents ("third parties do not replicate; they
call").

Two facts were established before this record. The engine runs in Node 22 with one
packaging change (the static `pouchdb-browser` import fails on `self.setImmediate`;
everything else it touches exists). And the engine had no notion of a session, which
ADR-0046 closed: `stack.forSession(session)` narrows reads, refuses foreign-scope
writes, attributes writes and reaches triggers and jobs. This record builds on both.

## Decision

1. **One engine, on the host, unchanged.** `@docstack/server` runs `@docstack/client`
   under Node 22 through the `node` conditional export. No second engine, no Rust, no
   QuickJS (an interpreter without a JIT runs the same JavaScript five to thirty times
   slower, and every storage adapter is Node-native). A single binary, if wanted, is
   Node SEA; a Rust wrapper, if ever, is a supervisor.
2. **Two surfaces over that engine.** An **API surface** (`/s/:stack/_ds/*`) for online
   clients and integrations, where every request runs under an engine session and the
   authoring pipeline runs on the host; and a **replication surface** (`/s/:stack/*`)
   that PouchDB's http adapter drives unchanged, on which the host ships stored form
   and is blind by default. Online mode ships first: it answers the data-volume
   objection and it is where the host adds what CouchDB cannot.
3. **Confidentiality is per session on the API, cryptographic on replication.** A
   trusted node holds the document key (configuration or a KMS hook) and opens every
   scope with an authority-minted omni key; each session gets exactly the scopes its
   attribute set satisfies, decided with the same CP-ABE mathematics a device would
   run, and the engine enforces it (ADR-0046). A node without keys is a blind hub, a
   legitimate deployment stated as such. Replicas open what their own keys open.
4. **Three layers of access, in three places.** Reachability is a grant per principal
   (stacks, `api`, `pull`/`push`, class filters; an ungranted stack is 404, never 403);
   content is scopes; behaviour is the pipeline on the API and `accept`/`serve`
   predicates on replication. This is ADR-0030 §5 applied to a server: partition is
   datamodel, grant is host configuration, enforcement is the host half.
5. **The host is the authority.** `setup()` at `init`, `msk` encrypted at rest or behind
   a KMS hook, `keygen` at session issuance, scope minting from the CLI. This is the
   roadmap's "authority tooling as its own package", housed where the roadmap said it
   would land.
6. **A thin client is first-class.** `RemoteStack` implements the shared abstract
   `Stack` over the API and a live feed; the React hooks and `Class` need no change
   because they already reach data only through that contract. An application picks
   `mode: 'remote'` or a local replica per stack, and may mix the two.
7. **One host method table for both replication bindings.** `createChannelHost` is
   extracted from the channel adapter's host half; the HTTP routes and the WebSocket
   binding are two bindings over it, so grants are enforced identically and one spec
   runs against both. Addendum to ADR-0030: its table's "Server-hosted" row (client
   drives, Node host over leveldown, WebSocket binding) stands, and gains an HTTP
   binding beside the socket.
8. **No framework.** `node:http` with a hand-written router and `ws` for upgrades.
   Roughly twenty-five routes, one of which streams; a framework would only be in the
   way of the longpoll and the upgrade.
9. **Credentials are the host's own.** `ClientStack.authenticate` never verifies a
   password and mutates per-stack singleton state, so the host keeps a scrypt-hashed
   store of its own and issues sessions from it; external IdPs are verified as JWTs.
10. **Topology and durability are configuration.** `upstreams` mirror to CouchDB,
    Cloudant or another node through the engine's own `stack.sync()`; durable-store
    transfer adapters (Firestore, GCS) make scale-to-zero a configuration, and are
    benchmarked before a number is quoted.

## Consequences

- The old `packages/server` is replaced wholesale, not evolved; its `src/` goes when the
  new package's first test lands (phase 1), and the docs' TypeDoc entry and
  `skipErrorChecking` special-case go with it.
- Two client changes: conditional exports (phase 1) and `RemoteStack` with
  `StackConfig.mode` (phase 2). Engine sessions are already in.
- The channel adapter gains `createChannelHost`, `revsDiff`, a Couch-shaped `fetchDoc`,
  and applies `limit` to accepted rows; the latter is a latent bug in the channel driver
  today and gets its regression test there.
- Two documents fields, `~createdBy` and `~updatedBy`, become meaningful on a host: the
  host's word about who wrote, honest on the API where the write is authenticated,
  absent on replicated writes. Writer authentication by revision signatures stays on
  the roadmap.
- Stated limits: class-scoped replication grants leak the ids and revisions of withheld
  documents (as CouchDB does); attribute keys outlive tokens; attachments, `_find`,
  transactions over the API and the `continuous` feed are deferred.

## Alternatives considered

- **Replication peer only.** Rejected: it makes a full replica the price of using a
  stack and leaves confidentiality entirely to devices, which is a limitation the docs
  would then have to sell as a feature.
- **The server's database as the client's primary storage** (PouchDB's http adapter as
  the stack's own store, the pipeline running in the caller's process). Kept as a thin
  mode for scripts only: every read pays a round trip and the pipeline runs on the
  wrong side of the trust boundary. The API surface is the right shape for the same
  need.
- **A session facade outside the engine.** Rejected in favour of ADR-0046: a wrapper
  could not reach triggers, stamp attribution inside the pipeline, or stop host code
  from turning a key on the shared stack.
- **Express, Hono, Fastify.** Express was the incumbent and is heavier than the surface;
  Hono was the runner-up (web-standard, portable) and was declined by the maintainer in
  favour of no framework at all.
- **Rust with rquickjs.** Rejected for the engine on performance and on the storage
  adapters; possible later as a supervisor.

## Notes on earlier records

- ADR-0029 is a proposal dispatched from the Pads project; it informed ADR-0030 and
  does not itself rule on DocStack's server.
- ADR-0030 decisions 3–7 (host-side two-sided enforcement, a tenant is a stack, keys move
  with grants, topology is configuration) are applied as written; §8's key
  distribution over the channel becomes an explicit per-stack grant flag on the host,
  which is the channel's end and not a relay.

## Pinned by

The suites named in spec 03 §13 as they land: `00-engine`, `api`, `replication`,
`grants`, `changes`, `channel-ws`, `auth` under `packages/server/test`, the client's
Playwright suite after the conditional-exports change, and the cross-package check of
the React hooks against a `RemoteStack`.
