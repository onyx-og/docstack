# ADR-0030 — Hub support: the channel is an adapter, a tenant is a stack

Status: accepted · Date: 2026-08-28

Answers the proposal in [0029-hub-support.md](0029-hub-support.md). Working code follows
from the Phase 1 hub spike, as 0029 itself stipulates; this document fixes the design the
spike builds against, and corrects the proposal in four places where the codebase already
holds a stronger answer than the proposal assumes.

## Decision

1. **Item 1 requires no change to the sync layer.** The transfer adapter is a new adapter
   package on the seam ADR-0001 already built — `remote` is any `PouchDB.Database` from a
   `RemoteResolver`. Nothing "gains a replication target"; the transport plugs in.
2. **The adapter is three parts, kept separable from day one:** a *driver half* (a PouchDB
   adapter marshalling the replication-facing method surface as RPC), a *host half*
   (binds a duplex channel to any local, real PouchDB and enforces scope), and a
   *transport binding* (MessagePort first; a wire binding later without touching the
   other two).
3. **Scope enforcement lives in the host half, and it is two-sided**: what a channel may
   *pull* (`_changes`, `_bulkGet`, `_allDocs`) and what it may *push* (`_bulkDocs`) are
   independent grants, enforced where the data lives — never in the driver, which cannot
   be trusted once the two halves are on different machines.
4. **A tenant is a stack** — its own database — not a filter within one. Fine-grained
   class filtering survives only *inside* a genuinely shared stack.
5. **`Class.tenants` is a static list (the proposal's Option A).** The *partition* (which
   tenant a class belongs to) is datamodel; the *grant* (which tenants an origin gets) is
   hub configuration derived from the channel; *enforcement* is the host half. The
   proposal conflates the first two.
6. **Document-key distribution is inside item 1's scope.** Replication moves ciphertext
   (ADR-0020); a channel grant without the matching key grant replicates unreadable
   documents. The two grants are one decision or the trust boundary is fiction.
7. **Topology is configuration, not a capability.** DocStack ships the halves, the
   bindings and the rendezvous *contract* — never a topology. Any realm may run any
   number of driver and host halves over one stack concurrently, so pair portal, hub
   star, room mesh, chain and healing re-link are all compositions the consumer writes;
   upstream may ship them as thin *recipes* over the same primitives, never as modes
   baked into the package.

## 1 — The seam already exists

0029 proposes that "`docstack.sync` gains a channel/`postMessage` replication target
alongside Drive". It already has one — it has *any* target. ADR-0001 made the remote a
resolver-produced `PouchDB.Database` precisely so DocStack never learns what a transport
is, and the repository already carries the precedent packages
(`packages/pouchdb-adapter-native`, `packages/pouchdb-adapter-tauri-sqlite`, the gdrive
adapter out of tree). The contribution is a package, and the spike can start against the
seam today: `stack.sync({ remote: () => channelDb })` is the whole integration.

One nuance so the spike does not overbuild: mechanically the transfer adapter **is** an
ops-proxy database — PouchDB replication needs a database API at the far end; there is no
raw "replication protocol over postMessage" to invent. What 0029 rightly refused is using
that proxy as *primary storage*. Driven only by the replicator, in batches, the refused
pattern's costs dissolve exactly as 0029 claims: per-op latency amortises, live queries
never touch the channel, no chokepoint.

## 2 — The gdrive adapter is the working specification

The method surface `pouchdb-replication` actually drives is enumerated, working, and
commented in the gdrive adapter's `adapter.ts`: `_info`, `_get` (with `open_revs`),
`_allDocs`, `_bulkGet`, `_bulkDocs` (`new_edits: false` passthrough), `_changes`
(`style: 'all_docs'` leaves, `return_docs`, `since`/`limit`, live), `_getRevisionTree`,
`_putLocal`/`_getLocal`/`_removeLocal` (replication checkpoints), `_close`, `_destroy`.
That list is the RPC vocabulary of the driver half. Nobody traces `pouchdb-replication`
again.

The effort estimate collapses accordingly. The gdrive adapter is ~3,200 lines because
Drive is a dumb store, so the adapter itself maintains revision trees (`pouchdb-merge`
inside `_bulkDocs`), winner selection, sequence discipline, and ETag CAS over
`_meta.json`. At the far end of a channel sits a **real PouchDB** — all of that is native
on the other side of the port. The driver half degenerates to marshalling; the host half
to a dispatcher.

What transfers from the gdrive experience and what does not:

- **Does not transfer, by construction:** its hardest failure class — multi-writer
  sequence collisions, CAS races, replay regressions (its ADRs 0001/0003/0004/0006) — is
  a consequence of multiple writers sharing dumb storage. Every topology in this design
  gives each database exactly one owner realm, with replication as the only cross-realm
  path. The class is absent, and that is the strongest argument that the chosen pattern
  is the cheap one.
- **Does transfer: the live `_changes` gate.** Its adapter documents the bug of a
  checkpoint moving past a change the feed never emitted, and the fix — gate the batch
  against the pre-batch `lastSeq`, emit in seq order, advance once. Port delivery is
  ordered and the hub PouchDB's feed emits ordered seqs, so the gate is nearly free —
  write it deliberately anyway, citing that comment.
- **Attachments are downgraded as a risk** for the local binding: structured clone moves
  `ArrayBuffer`s zero-copy between realms. The spike should still measure large-document
  clone cost; the attachment half of 0029's first risk bullet applies only to wire
  bindings (§3).

## 3 — Driver / host / transport binding, and why the split is load-bearing

The three parts are separable so the same code serves topologies 0029 never asked for:

| topology | driver half | host half | binding |
| :--- | :--- | :--- | :--- |
| Hub (0029) | each app origin | hub SharedWorker | MessagePort |
| Portal (peer↔peer through a relay) | peer X | peer Y | relayed wire |
| Server-hosted | client | Node worker over leveldown | WebSocket |

**How portal peers connect.** Neither browser can accept a connection, so both peers dial
*out* to the relay, whose real job is rendezvous: X creates a portal and shares its id out
of band (link, QR, the application's own backend); Y joins with that id; the relay
authenticates both sockets and from then on blindly forwards frames between them — the
socket pair *is* the transport binding on each side. Roles are assigned at the handshake,
not by who connected (both did): the creator hosts and the joiner drives, or the reverse —
it only has to be agreed, and it changes nothing about data flow (§4). From DocStack's
perspective Y never connects to X at all: Y binds the host half to its local PouchDB with
a scope grant and then does nothing but answer frames — identically to the hub's
SharedWorker. The portal is the hub topology with the host half relocated into a peer's
tab; no third kind of endpoint exists. What is genuinely new is rendezvous-layer, not
adapter-layer: *presence* (X may dial in before Y exists — the driver just sees a remote
that is not answering yet, which `retry: true` backoff and `restart()`'s remote
re-resolution already handle); *relay auth*, which is pipe-occupancy control only and
never the data trust boundary (the host's grant still enforces, ciphertext still crosses
unreadable); and an upgrade path that falls out for free — this handshake is exactly
WebRTC signaling, so swapping the binding for a DataChannel degrades the relay to
signaling-plus-TURN with no data through the server at all. Same driver, same host, third
binding.

**Groups: the pair is the primitive.** Replication is inherently pairwise, and N≥3 peers
never reach the adapter: a group is a graph of pairs, each link with its own binding,
role assignment and checkpoints (the replication id is derived from the two endpoints).
CouchDB-style multi-master makes any graph that stays connected *over time* converge by
gossip — a peer re-offers what it pulled on its other links, `revs_diff` dedupes,
revision trees make the route irrelevant. So one-by-one spreading is not a topology to
build: if X↔Y and Y↔Z portals exist, X's changes reach Z through Y with zero new
machinery. The only product decision is whether a group must be *first-class* — declared
membership, store-and-forward without a peer chain, a global "has everyone converged"
answer (per-link `lastConvergedAt` exists; nobody in a chain sees the whole graph). When
it must, build a star: the relay-turned-host (§ table, third row — store-and-forward
returns, ciphertext-only storage survives) or an elected peer, which is the hub topology
with a peer in the hub seat. The WebRTC upgrade path above is the *pair's* sweet spot;
past small N the economics invert — O(N²) DataChannels and per-link changes chatter —
and the hosted star is the pragmatic group answer.

The disappearing middle peer deserves precision, because two different failures hide in
it. *Partition* — the remaining peers are online but the graph broke — has two P2P fixes
that need no store: **degree** (more pairwise portals than a chain: k links per peer
tolerate k−1 departures, mesh the extreme) and **healing** (X and Z form a direct portal
when Y goes — possible exactly because rendezvous is room membership: the relay knows
who is in portal P and brokers the replacement link). *Asynchrony* — peers never online
together — is irreducible: someone must hold the data while its author is away, and that
someone is a host half that stays up (the relay-turned-host, the hub, an always-on
peer). Degree and healing fix partition; only a store fixes asynchrony — the star is not
the only solution, it is the only solution to the second problem. Which of these a
product gets is composition, not a mode (Decision 7).

Two things generalize for N≥3, both rendezvous-layer:

1. **Rendezvous becomes room membership.** The relay stops pairing two sockets and
   tracks who is in portal P, brokering a channel per pair (mesh) or per member (star).
   Same handshake, plural.
2. **The role rule becomes deterministic per link.** Creator-hosts/joiner-drives does
   not cover a link between two joiners; the generalization is a total order on peer ids
   — the lexicographically smaller id hosts, say — so any two peers agree without
   negotiation.

And three properties sharpen at N≥3: **all-leaves becomes load-bearing across hops** — a
peer forwarding only winners silently breaks sibling propagation through the graph,
invisible in a pair, corrupting in a mesh; **scope composes by intersection along a
path** — X→Z through Y carries only what both links' two-sided grants admit, so a class
excluded on a middle link never arrives at the far end with no error anywhere (a
property to design with, not a bug: trust narrows with distance); and **keys become
membership management** — a transit peer is a blind *courier*, replicating ciphertext it
cannot read (though ids, class names and unencrypted fields are visible to every peer on
the path), and revoking a member means re-keying, not just dropping their channel.

Rules that keep the split honest, adopted now because they are cheap now and a rewrite
later:

- **Serialization lives in the binding.** The RPC layer hands the binding plain
  serializable frames and never assumes structured-clone semantics; a wire binding adds
  encoding and attachment chunking without the RPC layer noticing.
- **A dumb relay has no store-and-forward.** The hub and Drive both *store*; a relay
  does not, so portal writes move only while both peers are up. Async delivery means a
  server-side database — which is the hub pattern relocated, not a new design.
- **The degenerate case is already solved.** A server willing to expose a
  Couch-compatible HTTP surface needs no channel adapter at all:
  `stack.sync({ remote: "https://…" })` works today. The channel adapter earns its keep
  for relays, live push, multiplexing tenants over one socket, and refusing to expose an
  HTTP database.
- **E2EE falls out.** Ciphertext-by-design replication (ADR-0020) means a relay sees
  only ciphertext for encrypted attributes: a blind intermediary, no key ever
  server-side. The key-distribution question (§8) is between the endpoints.

Backpressure needs no machinery: the adapter surface is request/response, so the driving
replicator paces itself batch by batch (`batchSize`/`batchesLimit` already exist). Only
the live-changes subscription is push, and it may degrade to a bare poke that makes the
driver pull.

## 4 — Two-way transport comes from one-way driving

In PouchDB, bidirectional data flow does not require bidirectional driving.
`PouchDB.sync(local, remote)` — what the sync layer runs for `direction: "both"` — is two
replications *driven from the same side*: pull reads the remote's `_changes` and writes
locally; push reads the local feed and writes remotely via `_revsDiff` + `_bulkDocs`. The
far end is passive in both. So one end runs the driver half, the other the host half, and
documents flow both ways — asymmetric roles, symmetric data.

Consequences:

- **The host half already serves two-way**, because the §2 surface is read *and* write —
  including `_putLocal`, since the driver checkpoints on both databases.
- **Who drives is a topology decision.** In the hub, the app origins drive and the hub
  only hosts: each app owns its lifecycle, its `StackSyncHandle` status feeds its own UI,
  `restart()` re-resolves its own credentials, and the hub holds no replication state
  across N channels. In a portal, the connecting peer drives. Both sides driving is safe
  (replication is idempotent) but pure waste.
- **Live two-way costs one subscription, host→driver only.** The push direction watches
  the driver's own local feed natively.
- **Scope becomes two-sided** — the serve grant and the accept grant of Decision 3. A
  channel may be read-only, or write-only into one class. The driver picks
  `push`/`pull`/`both`; the host enforces what is actually allowed regardless of what was
  asked.

## 5 — Two-way is why tenancy is in the proposal at all

0029 says the two items justify each other; here is the mechanism. Two-way transport
makes the hub a *fan-out point*: one origin's push becomes every other origin's pull, and
the hub is the only realm that sees all tenants. Unscoped, any origin could write into
any namespace and have the hub replicate the damage outward. Item 1 without item 2 is a
safety hazard; item 2 without item 1 has nothing to enforce against.

The scoping design is three layers in three places:

1. **Partition** — datamodel: `Class.tenants` declares which tenant space a class
   belongs to. Build-time, ships with the app.
2. **Grant** — hub configuration: origin → entitled tenants, derived at the MessagePort
   handshake. This cannot live in the datamodel: every app ships its own model, and none
   is authoritative about the others' entitlements. The grant map is the trust anchor.
3. **Enforcement** — the host half, two-sided (§4).

0029's "a target with no filter defaults to the tenants its channel's origin is entitled
to" is layer 2; its `Class.tenants` is layer 1; the proposal treats them as one thing.

## 6 — A tenant is a stack

Too much of DocStack is a per-database singleton for two tenants to share one database:
the schema version and patch ledger, `~system`, the crypto-engine config and document
key, id allocation, design documents. 0029's own constraint forces the conclusion — apps
ship independently with independent patch sets, so Note's tenant and the workspace tenant
cannot share a `schemaVersion` or a patch history. A tenant must be its own database,
which in DocStack is exactly a **stack**.

Under that reading, most of item 2 already exists:

- The hub is one `DocStack` with N stacks — already what the core does, including safe
  concurrent opens (ADR-0023 area).
- Per-tenant replication policy is `stack.sync()` per stack — cadence, batching,
  direction each their own; `docstack.sync({ stacks })` already scopes which stacks a
  channel serves. 0029's per-tenant cadence bullet is available today.
- Per-tenant patches, schema gates and keys come free from tenant-is-a-database, instead
  of each being a hard sub-problem of tenant-is-a-filter.
- "The filter can only narrow the declaration" is structural: the sync layer's filter
  chain is a conjunction, so a channel filter can only subtract.

And the coarse grant becomes **structural rather than filtered**: a Note channel is bound
to the note stack and the workspace stack, and has no channel to Sheet's stack at all.
Sheet's namespace is not filtered out — it is unreachable. That is a materially stronger
property than a predicate saying no, and it is what makes 0029's "no new security
surface" claim literally true.

The residual fine grain lives in the one genuinely shared, multi-writer stack: the
workspace, where every origin pushes its own tab and recents documents. Tenant-level
binding cannot distinguish Note's tab doc from Sheet's; whether the host's accept-scope
there needs per-class or per-document ownership rules — or nothing, all origins being one
user's trust domain — is an explicit open question for the spike, and the only place the
grant vocabulary might need to be finer than `Class.tenants`.

## 7 — `Class.tenants`: Option A, more firmly than the proposal holds it

**A.** A static list, next to `ephemeral` and `simple` on the class model (ADR-0028 —
the pattern is fresh: a class-model flag resolved when `sync()` starts, folded into the
filter identity).

Against B: a resolver (`(doc) => [doc.notebook]`) makes a document's *database*
unknowable without the document in hand — partitioning, the schema gate and ACL
derivation all collapse from build-time facts into write-time checks. And B's motivating
case does not need B: dynamic tenant spaces (per-user, per-room) are dynamic *stacks*,
which DocStack already creates at runtime. The tenant set stays open-ended while the
declaration stays static. Against C: it buys nothing today and keeps a second code path
warm forever.

0029's rule that a doc instance lives in exactly one tenant is affirmed — under §6 it is
literally "a document lives in one database".

Backward compatibility is zero-cost by construction, as 0029 demands: no `tenants`
declaration → no filter stage, no layout change, nothing resolved at sync start — the
same shape as `hasClassRules` today.

Implementation trap, recorded so it is not rediscovered: `getClassModels` projects a
fixed field list, and silently dropped `ephemeral`/`simple` when they were added
(ADR-0028). `tenants` hits the same wall.

## 8 — The omission: keys move with grants or the grant is fiction

0029 never mentions the crypto engine, and must. Replication moves documents as stored —
`getReplicationHandle()` bypasses the plugin's decrypting read path, encrypted attributes
stay ciphertext (ADR-0020). A channel grant without the matching document key replicates
documents the receiving origin can store and never read. The document key is per-stack,
in memory, supplied by `unlock()` or an auth session (ADR-0018 — which also records that
the no-auth path currently regenerates the key per session, a live bug in exactly the
component the hub leans on; fix it before the spike trusts it).

Since the hub homes auth (Pads ADR-0014), the hub distributing key material to entitled
origins over the channel is part of item 1's real scope. Which origins get which tenants'
keys is the same decision as which stacks they get channels to — Decision 6. For the
portal topology this is a feature: the relay never joins the trust boundary (§3).

## 9 — What the proposal deferred that is already answered

- **Error taxonomy** (deferred to the spike): start from `SyncSchemaMismatchError`. The
  schema gate plus the `_local/docstack-sync` marker already refuse, with a clean typed
  error, when the hub was written by a newer schema — the data half of 0029's
  version-skew risk. The bridge-protocol half still needs its own versioning, as 0029
  says.
- **Diagnostics crossing the channel**: ephemeral classes (ADR-0028) are folded into
  every replication filter; `~Log` never travels between origins.
- **Per-channel checkpoints**: filter identity already guarantees that two channels with
  different scopes checkpoint separately, and that *changing* a channel's scope
  backfills instead of silently resuming.
- **Seeded documents**: the ADR-0024 rule — replicate only what a peer cannot derive —
  applies across the channel. It is correct only when both ends applied the same
  patches, which tenant-is-a-stack makes true per tenant: the hub opens each tenant's
  stack with that tenant's patches.
- **Cross-tenant replication scheduling** ("don't let Note starve the workspace"):
  handles are independent; no cross-handle scheduler exists and none should be built
  ahead of evidence. On a local channel the starvation risk is speculative — the spike
  measures before upstream grows a scheduler.

## 10 — Upstream work, concretely

Small, and in dependency order:

1. `tenants?: string[]` on `ClassModel` (+ the `getClassModels` projection, §7).
2. The grant deriver: origin entitlement → stack list + optional class filter for shared
   stacks — compiled onto the existing `docstack.sync({ stacks })` and `classes` options.
3. `@docstack/pouchdb-adapter-channel`: driver half (the §2 surface as RPC), host half
   (dispatcher + two-sided scope, re-entrant across channels — Decision 7 requires any
   number of halves per stack, formed at runtime), MessagePort binding. The ADR-0001
   adapter contract — ordered batches, `all_docs` leaves, tombstone bodies — is the test
   checklist; the gdrive adapter's replication tests are the model.
4. The key-distribution channel message (§8), gated by the same grant as step 2.
5. Fix ADR-0018's key regeneration before any of it is trusted with encrypted tenants.
