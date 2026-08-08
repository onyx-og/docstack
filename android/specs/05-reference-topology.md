# 05 — Reference topology: a team-capable Todo app

Status: **reference, not a deliverable** · Owner: Onyx

## Why this exists

A worked example used to test the architecture against a real product shape. It is
not a specification of the Todo app, and nothing here is built as part of
`permetic` or `docstack-*`. Its value is in the findings at the end: what the
architecture absorbed without change, and the one place it had to change.

Read it when a product decision seems to demand a contract change — this is the
record of which ones actually did.

## The product

- Todo app on Android. Data lives on the device and syncs to the user's own Google
  Drive.
- A paid **teams plan**: a team shares a database. The team leader buys the plan.
- Push notifications for tasks and events.

## Components

| Piece | Role |
| --- | --- |
| Web app | The Todo app. Unchanged code, runs in a browser or under Permetic. |
| `permetic` + `-push`, `-billing` | WebView host; auth, push, billing, background. |
| `docstack-store` + `-permetic` | Native document store, mode C. |
| `docstack-headless` | Replication with no WebView attached. |
| `@docstack/server` | CouchDB-protocol facade, a component inside Strapi. |
| Strapi (Cloud Run) | Accounts, rosters, entitlements. Postgres-backed. |
| Firestore | Durable document storage behind `@docstack/server`. |
| Google Drive | Each user's own replica, written only by their own device. |

## Databases and their topologies

**One database, one sync topology.** This is the rule that keeps the system
comprehensible; breaking it produces replication cycles that cost bandwidth and
checkpoints forever.

| Database | Topology |
| --- | --- |
| Personal todos | device ↔ user's Drive |
| Team todos | device ↔ `@docstack/server`; one-way push to the user's Drive as backup |
| View indexes | local only, never replicated |

The server never touches anyone's Drive. Every Drive file is created by the app's
own OAuth client on behalf of its own user, so `drive.file` suffices — no
restricted scope, no annual security assessment, no per-member consent to a server.

Team data reaches a member as: member writes locally → `docstack-headless`
replicates to the server → server persists to Firestore → other members replicate
down. Drive is a personal replica, not a sync node.

## Where each capability lands

- `auth` — Google token for Drive. Also, see finding F-1, a session token for the
  app server.
- `push` — FCM registration token, posted to Strapi by the web app. Inbound
  messages wake the sync worker.
- `billing` — the leader's purchase. The token goes to Strapi; the entitlement
  lives there. See F-2.
- `background` — schedules the sync worker, per database.
- `storage` — mode C, several databases in parallel.

## Server design

`@docstack/server` is a **stateless CouchDB-protocol facade over
PouchDB-on-Firestore**. It holds no authoritative local database.

The tempting alternative — an ephemeral in-process database rehydrated at startup —
breaks on Cloud Run. Instances are load-balanced, so each would hold a different
replica, and members hitting different instances would get inconsistent
`_revs_diff` answers and divergent checkpoints. Session affinity is best-effort and
not a correctness guarantee. Pinning to one instance discards the scalability the
design exists for, and scale-to-zero would make every cold start rehydrate the
whole database before serving anything.

A per-instance cache is fine as an optimisation. It must never be authoritative.

### Durability split

| Durable in Strapi/Postgres | Durable in Firestore | Not durable anywhere |
| --- | --- | --- |
| Accounts, team rosters | Documents, revision trees | Anything in the container |
| Entitlements, purchase tokens | `_local` replication checkpoints | |
| FCM tokens, successor pointers | Attachment metadata (blobs in Cloud Storage) | |

The entitlement is the record proving the plan was paid for. It never lives
anywhere a client can rewrite.

### Firestore constraints that shape its adapter

- **`_changes` sequencing is the hard problem, and the first to solve.** Firestore
  has no monotonic counter; distributed counters cap near one write per second, and
  server timestamps are not strictly monotonic across concurrent commits. A reader
  checkpointing on a timestamp can miss a write that commits late with an earlier
  stamp.
- **Billing is per document read.** `_revs_diff` and `bulkGet` over a large
  database can mean thousands of reads per member per sync. Design the schema
  around the replication protocol's access patterns, or the cost goal inverts.
- **1 MiB document limit.** Attachments go to Cloud Storage keyed by digest, with
  only metadata in Firestore.

## Findings

**F-1 — the one contract change this forced.** Background team sync needs an app
server session with no WebView running, so the web app cannot supply it. `auth`
needs a provider dimension — `getToken('google', scopes)` and `getToken('app')` —
or a small separate native credential store. Ruled out: putting the token in a
replicated database.

**F-2 — entitlement is not a device fact.** `queryPurchases()` on the leader's
device cannot gate the team plan; the JS is OTA-updatable and the bridge is
reachable, so it is spoofable. The purchase token goes to Strapi and is verified
against the Play Developer API. Renewals, cancellations, grace periods and refunds
are not observable from the device — Real-time Developer Notifications over Pub/Sub
are required. Add to spec 01, task 8.

**F-3 — replicate whole, hide client-side.** Filtered per-member replication plus
revision trees produces missing ancestors and checkpoint mismatches. Whole-database
replication with client-side visibility is both safer and simpler.

**F-4 — multi-database is the normal case, not an edge.** A member holds a personal
database, a team database, and view indexes. Specs 02 and 04 currently read as if
there is one; they need to state N explicitly, including how the sync worker
schedules across them.

**F-5 — push payload is a privacy decision.** Data-only messages that wake the sync
and compose the notification locally keep task content off Google's
infrastructure, but Doze and background limits can delay them. Content in the
payload is prompt and leaks. Choose deliberately; record the choice.

**F-6 — the server's protocol surface is load-bearing.** If `@docstack/server`
speaks the CouchDB replication protocol (`_revs_diff`, `_bulk_docs`, `_all_docs`,
`_changes`, `_local`), the device uses `pouchdb-adapter-http` unchanged. Anything
bespoke means a third remote adapter to write and maintain.

## What the architecture absorbed without change

Teams, an app server, an ephemeral tier, and a second cloud backend all landed
without touching `permetic`, `docstack-store`, or the adapter. Permetic never
learns what a team is; it hands out a token, a purchase, and a worker schedule.
Only F-1 reached the contract.

## Open questions

- **Q-1** Does the leader-availability protocol survive? With Firestore durable,
  nothing depends on the leader being online. It was a solution to a problem this
  design removed.
- **Q-2** Does a member's Drive hold a backup of the team database, or only their
  personal one? Backing up both doubles Drive usage for data the server already
  holds durably.
- **Q-3** Firestore security rules: deny all direct client access and let Strapi be
  the only writer, or allow scoped client reads later?
