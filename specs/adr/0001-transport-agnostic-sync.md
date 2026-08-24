# ADR-0001 — Sync belongs to DocStack, transports do not

Status: accepted · Date: 2026-08-24

## Decision

`@docstack/client` owns the replication lifecycle and exposes it as
`stack.sync({ remote, ... })` / `docstack.sync({ remote })`. The `remote` is a
PouchDB database, or a function returning one. DocStack takes no dependency on any
transport and learns nothing about one.

## Why not leave sync to the application

Because replicating into a stack is not a neutral act, and three of the things that
make it safe are facts only DocStack holds.

**The write path.** `pouchdb-replication` writes with `new_edits: false`.
`StackPlugin` replaces `bulkDocs` and did not check the flag, so replicated
documents ran the authoring path: class validation rejected anything authored by a
device one patch ahead, relation validation rejected anything whose endpoints had
not arrived yet — and replication batches carry no dependency ordering, so retries
hit the same wall — and after-triggers minted fresh revisions inside a
`new_edits: false` write. An application cannot fix this from outside.

**The internal-document taxonomy.** `~system`, `~crypto-engine-config`,
`lastDocId`, `_design/*`, `~lock-*`, sessions, the patch ledger. Getting the list
wrong is not a warning, it is `checkSystem` reading a peer's schema version on the
next mount. The set grows as DocStack grows, so it cannot be a snippet an
application copies once.

**Class knowledge.** An allow-list has to carry the data model or the remote is
unreadable; relations are classified by `~domain` and their endpoints, not by
`~class`. Both are DocStack's model, not the application's.

Beyond correctness: an application with three planned transports (Drive for
personal multi-device, Firestore for teams, peer for self-hosted) would write the
lifecycle three times. Owned here, it is three remote factories and one lifecycle,
one status surface, one conflict story.

## Why not depend on the transports instead

Making `@docstack/pouchdb-adapter-googledrive` a dependency of the client would
force a Google Drive HTTP client on every consumer and hardcode one backend into
the core package. It would also fix the wrong layer: the token lifetime, the OAuth
scope and the folder layout are the application's, and the adapter already inverts
that with `accessToken: async () => string`.

`RemoteResolver` being a *function* is what keeps it that way — DocStack calls it
again on every `restart()`, so a refreshed credential reaches the new replication
without either side reaching into the other.

## Why not add pouchdb-replication as a dependency

It is already there. `pouchdb-browser@9`, which `@docstack/client` already depends
on, is a prebuilt bundle containing replication, sync and `activeTasks`;
`PouchDB.replicate` and `PouchDB.sync` are present and are what this layer drives.
Adding `pouchdb-core` + `pouchdb-replication` on top ships two PouchDB copies in
one bundle.

## Consequences

- One lifecycle, status model and filter chain, whatever the transport.
- `~system` cannot be the schema gate's source of truth, because the filter keeps it
  local and a remote never has one. DocStack publishes its own
  `_local/docstack-sync` marker instead (spec 01).
- Adapters acquire a contract they did not visibly have: ordered changes batches,
  `style: 'all_docs'` leaves, tombstone bodies. Three real bugs in the Drive adapter
  came out of writing this down.
- Filters must carry a configuration-derived identity, because PouchDB hashes
  `filter.toString()` into the replication checkpoint and every factory-built filter
  otherwise shares one.
