# Proposal: DocStack support for the Pads hub architecture

Owner: `onyx-og/docstack`
Status: **Ready to dispatch** (2026-08-28). Patterns are settled; shipped as one
design proposal because the two items justify each other (access control via scoped
replication needs both). Two things follow rather than precede dispatch, stated
here so they are not read as omissions: **working code** arrives from the Phase 1
hub spike (prototyped against local checkouts via the ADR-0002 vendoring seam, as
[live-usequerysql](live-usequerysql.md) did), and the **error taxonomy** is an
explicit output of that spike — real failures, not guessed ones.
Motivated by: [specs/shell-and-tabs.md](../specs/shell-and-tabs.md),
[ADR-0013](../adr/0013-workspace-doc-on-the-sync-layer.md),
[ADR-0014](../adr/0014-home-auth-in-the-hub.md)

## The situation upstream would be asked to serve

Pads homes suite state and auth in a same-site hub: a `pads.ink/hub` iframe (plus a
SharedWorker on that origin) hosting the one DocStack instance whose storage all
`*.pads.ink` apps reach over `postMessage`. Today `@docstack/client` assumes one
instance, one origin, one tenant, its own PouchDB. The hub needs instances on
*different origins of the same site* to converge — the hub replica as the shared
peer — and one instance (the hub's) to serve several apps' data spaces at once.

Two contributions would let DocStack serve this natively instead of Pads hand-rolling
a bespoke RPC layer above it:

## 1. Crossing the origin boundary — replication transport (decided)

Two shapes were considered; the **storage-adapter pattern was refused** and the
**replication transport chosen**.

### Refused: bridge PouchDB storage adapter (ops proxy)

A PouchDB adapter whose backing store would be a PouchDB in another JS realm — every
read/write proxied over the channel to the single hub instance (`worker-pouch`'s
pattern). One copy of the data, but: every operation pays channel latency, the
`changes` live-query machinery needs its own forwarding protocol, attachments need a
bespoke chunking/backpressure story, the hub becomes a throughput chokepoint, and
access control needs a permission layer bolted onto the proxy. Refused in favor of
the pattern below, which dissolves each of these.

### Chosen: replication over `postMessage` — the transfer adapter

Each origin runs a **traditional idb-backed PouchDB**; the app's and the hub's
databases **replicate with each other over a `postMessage` transport** — a DocStack
sync transport ("transfer adapter"), not a storage adapter.

- Every read/write is local and synchronous-fast; live queries run against the local
  idb natively (no `changes` forwarding protocol — replication events feed them).
- PouchDB's replication protocol already brings batching, checkpoints and resumption,
  answering the backpressure/chunking question for free.
- No single-instance chokepoint: the hub replica is a peer, not a gateway; a slow tab
  can't stall another tab's reads.
- Failure gets *softer*, not forked: with the hub unreachable an app still reads its
  local replica; the [ADR-0014](../adr/0014-home-auth-in-the-hub.md) guided-repair
  stance applies to *boot/auth*, while brief hub outages just delay convergence.
- Cost: N+1 copies of whatever replicates to an origin, and convergence latency
  (local-channel small — but the shell must stay honest about eventual consistency,
  which [ADR-0013](../adr/0013-workspace-doc-on-the-sync-layer.md) already demands).
- Upstream shape: `docstack.sync` gains a channel/`postMessage` replication target
  alongside Drive — one replication concept, two transports.

Cadence and conflicts are settled at this altitude:

- **Cadence is a per-tenant replication policy**, not a global knob. The workspace
  tenant replicates continuously — writes are tiny and rare, and the rail must be
  instantly current. Bulk document tenants may debounce (with forced flush on tab
  switch / blur) or rely on PouchDB's own batching; the real cost of continuous on a
  local channel is chatter and checkpoint write amplification, not latency.
- **Conflict surface is shrunk structurally, residue handled natively.** The
  workspace state is not one hot doc: one small doc per tab and per recents entry,
  referenced/assembled by querying the tenant (no index doc — that would recreate
  the hot spot). A conflict then needs two writers on the *same tab* in one sync
  window, and its fields are ones where deterministic last-write-wins is correct.
  For the residue, both ends of the transfer adapter are real PouchDBs, so the
  revision-tree machinery is native; the rule to carry over from
  `docstack-pouchdb-adapter-gdrive` (validated two-device back-to-back in tokido's
  expo app) is transport-side: **replicate all leaves, never just winners**, or
  replicas silently diverge — plus deterministic winner selection and periodic
  pruning of resolved conflict leaves.

**Deferred to the spike, by design**: the error taxonomy the repair guide needs
([shell spec](../specs/shell-and-tabs.md)) — enumerated from real observed failures
during the hub spike rather than guessed here.

## 2. Multitenancy in `@docstack/client`

The hub instance serves several tenants at once: the suite shell (workspace doc) and
each app's document space (Note today; Slide and Sheet later), possibly for several
concurrently open tabs. Upstream, an instance currently equals one tenant.

- Tenancy declared **at the datamodel definition**, not as a client API or a naming
  convention: `Class.tenants = ["tenantX", "tenantY"]` on the model class. The
  framework then applies tenancy uniformly — querying, writing and synchronizing all
  scope per-tenant because the model says so, and a model with no `tenants` stays
  single-tenant with zero migration cost (Paper-as-Note unchanged).
- Each tenant carries its own replication policy (the workspace doc's Drive choice is
  per-tenant — [ADR-0010](../adr/0010-what-replicates-to-drive.md)) and its own
  access rules (a Note channel must not address Sheet's namespace).
- One shared auth/Drive connection across tenants ([ADR-0009](../adr/0009-drive-connection-outlives-the-page.md)
  already points this way: the connection outlives any one page — under the hub it
  also outlives any one *app*).
- Replication scheduling across tenants (don't let a bulk Note sync starve the
  workspace doc's small writes).

- **ACLs bind through `docstack.sync` itself**: with the transfer adapter, what a
  channel may see *is* what the hub agrees to replicate over it. Access control
  becomes scoped, filtered replication per channel — the model's `tenants`
  declaration drives which databases/docs the hub offers a given origin — instead of
  a separate permission layer bolted onto an ops proxy. Item 1 and this item meet
  exactly here, and it is what decided the pattern choice: replication is already
  the framework's trust boundary (it is how Drive access is scoped today), so
  reusing it adds no new security surface.

- **Declaration and selection split across layers**: the datamodel declares the
  tenant space a class can have (build-time, the basis for partitioning and ACLs);
  a `docstack.sync` filter selects the subset a given target/channel receives. The
  filter can only narrow the declaration, never exceed it — preserving
  replication-as-trust-boundary while one model serves differently-scoped channels.
  A target with no filter defaults to the tenants its channel's origin is entitled
  to, which the hub derives from the channel.

### `Class.tenants` semantics — options for upstream to weigh

Deliberately not pre-decided by Pads; the options, with the Pads case as the worked
example:

| Option | Example | Pro | Con |
| --- | --- | --- | --- |
| **A. Static list** | `Tab.tenants = ["workspace"]`; `Note.tenants = ["note"]` | Analyzable at build time: partitioning, ACLs and sync filters all derivable before any data exists. Simplest mental model. | Tenants that only exist at runtime (per-user spaces, per-document collab rooms) can't be expressed. |
| **B. Runtime-resolved** | `Note.tenants = (doc) => [doc.notebook]` | Expresses dynamic spaces; one class can span an open-ended tenant set. | Partition of a doc knowable only with the doc in hand; ACL checks move to write/replicate time; harder to reason about and to index. |
| **C. Static list + resolver escape hatch** | Static default, `tenantOf(doc)` override where declared | Pads needs only A today; C keeps the door open without complicating A callers. | Two code paths upstream must maintain and test. |

Pads' position: **A satisfies everything in this proposal**; C is the shape we'd pick
if upstream anticipates dynamic tenancy soon. On multi-tenant docs: a doc *class* may
declare several tenants, but a doc *instance* should live in exactly one — sharing
across tenants is expressed by reference (id links resolved per-tenant), not by
double-homing, which would reintroduce cross-tenant conflict surface and ambiguous
replication ownership.

**Hard constraint on the design** (not a task): backward compatibility for upstream's
existing single-tenant consumers must be zero-cost *by construction* — a model with
no `tenants` declaration keeps today's behavior exactly (same on-disk database
layout, queries, replication), so upgrading the library costs existing callers
nothing and no data migration exists.

## Bottlenecks and risks to discuss (both items)

- `postMessage` serialization cost on large docs/attachments; SharedWorker
  availability quirks (notably iOS Safari history) — the hub spike measures both.
- The transfer adapter trades the refused proxy's throughput chokepoint for storage
  duplication and eventual consistency between origins.
- Version skew: apps ship independently (submodules — [ADR-0011](../adr/0011-restructure-into-the-pads-suite.md)),
  so bridge protocol and tenant API need explicit versioning from day one.

## Relation to existing findings

The vendoring seam ([ADR-0002](../adr/0002-vendor-docstack-from-sibling-checkouts.md),
[ADR-0008 area](../adr/README.md)) means Pads prototypes both items against local
checkouts during the hub spike; working code follows this document upstream as a
companion, the way [live-usequerysql](live-usequerysql.md) carried its own.
