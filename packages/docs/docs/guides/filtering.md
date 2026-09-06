# What replicates

By default, a stack replicates its data and its data model, and keeps its own
bookkeeping on the device. You can narrow that by class, or with a predicate of
your own.

## What DocStack keeps local for you

Every stack writes documents that describe *this device's copy* of the database
rather than its contents. Replicating them is never right — two devices each write
their own, so they collide on identical ids with unrelated revisions.

| Kept local | Why |
| :--- | :--- |
| `~system` | Carries this database's `schemaVersion`, read on every mount. A peer's copy would claim patches this device has not applied. |
| `~crypto-engine-config` | Pins a database to its encryption setting. A peer's copy says nothing about this one. |
| `_design/*` | Mango indexes, built on demand per device. |
| `~lock-*` | Guards an in-flight class-model propagation on *this* device. |
| `~UserSession` | Sessions belong to the device that logged in. |
| `patch` ledger | Each device applies its own patches; patches ship with your code. |

This list is DocStack's to maintain rather than yours to guess, and it grows as
DocStack does. Sessions and the patch ledger can be opted back in:

```typescript
stack.sync({
  remote,
  internalDocs: { replicateSessions: true },
});
```

Classes, domains, policies, users and groups **do** replicate — they are authored
data model, and a peer needs them to make sense of anything else.

## Filtering by class

```typescript
// Everything except one class
stack.sync({ remote, classes: { exclude: ['Draft'] } });

// Only these classes
stack.sync({ remote, classes: { include: ['Task', 'Project'] } });
```

Two things this does that a hand-written predicate would not:

**An allow-list keeps the data model.** `include: ['Task']` taken literally would
produce a remote holding Task documents and no Task class model — a database the
next device could not open. Class models, domains, policies, users, groups and auth
modules ride along automatically. `includeDataModel: false` turns that off, for a
remote that is not meant to be a readable replica.

**Relations are judged by their endpoints.** A relation document carries `~domain`
plus `sourceClass`/`targetClass`, not `~class`, so a predicate reading only
`~class` lets every relation through — including ones pointing at documents you
just filtered out, which arrive on the peer as dangling references. A relation
replicates only when both of its endpoints do.

One asymmetry worth knowing: `exclude: ['Draft']` drops documents *of* Draft, but
the Draft **class model** still crosses, because it is `~class: "class"`. That is
deliberate — it keeps the remote readable. To keep a model local too, name its id:

```typescript
stack.sync({
  remote,
  classes: { exclude: ['Draft'] },
  internalDocs: { extraDocIds: ['Draft'] },
});
```

(A class created through `Class.create` has its name as its id.)

## Filtering with a predicate

For anything class rules do not express:

```typescript
stack.sync({
  remote,
  filter: (doc) => doc.archived !== true,
});
```

It is ANDed with everything above, and must be pure — it runs once per change.

Prefer `classes` where it fits. A bare function has no configuration DocStack can
see, which matters for the next section.

## Changing a filter re-replicates

PouchDB identifies a replication — and therefore its resume point — partly by the
filter. DocStack derives that identity from your filter's *configuration*, so:

* Change which classes replicate, and replication re-scans from the beginning and
  **backfills** the documents the new filter admits.
* Keep the configuration, and it resumes where it left off. Listing the same
  classes in a different order does not count as a change.

The backfill is the behaviour you want — a widened filter that silently skipped
history would leave documents permanently missing — but it is a full pass over the
changes feed, so it is not free.

A bare `filter` function is identified by its own source text, so two closures over
different data with identical source read as the *same* filter and will resume from
each other's position. Use `classes` if the rule is really a configuration.

## Two things filters do not do

**They are not access control.** A filter shapes what a device bothers to carry.
Partitioning belongs to the topology — a database per workspace, a Drive folder per
account. Do not use a filter to keep data away from someone who can reach the
remote.

**They do not clean up.** Documents that already replicated under a looser filter
stay on the remote. Tightening a filter stops new ones crossing; removing the old
ones takes an actual delete.

## Options that look like they should work, but do not

PouchDB's `doc_ids` and `selector` are handed to the *source adapter*, and the
Google Drive adapter implements neither. Passed to a Drive sync they sit in the
options looking like configuration while everything replicates anyway. Use `filter`
or `classes` — those are applied by the replication layer itself, whatever the
transport.
