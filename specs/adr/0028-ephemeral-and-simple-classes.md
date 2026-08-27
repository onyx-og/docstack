# ADR-0028 — Ephemeral and simple classes

Status: accepted · Date: 2026-08-26

Replaces the shape-sniffing in [ADR-0027](0027-log-records-recognised-by-shape.md) with two
properties of a class, and moves the client's own log records onto both.

## Decision

Two booleans on the class model, added together in system patch `0.0.15`:

| flag | meaning |
| :--- | :--- |
| `ephemeral` | Documents describe *this run of this client*: emptied when the stack next opens, never replicated. |
| `simple` | Documents are stored as given: no schema, so no validation, no triggers, no relation checks, no field encryption. |

`~Log` is both, and the logger writes to it.

## Why a class property rather than a filter rule

ADR-0027 taught the replication filter to recognise a log record by its payload shape. That
worked, and it was the wrong shape of answer: it put knowledge of one particular kind of
document inside a general mechanism, and every future kind of derived local state — a
cache, a draft, a materialised view — would have needed the filter taught again.

`ephemeral` says the same thing once, declared where the fact lives, and an application can
declare it for its own classes without DocStack knowing they exist. The shape test is kept
only as legacy cover: records written before `~Log` existed are already on disk with a bare
UUID and no class, and nothing about the writer can reach them.

## `ephemeral`: emptied when the stack opens

"One run" ends at stack open, not at logout:

- A crash is cleaned up by the next open, so nothing accumulates on disk indefinitely.
- Diagnostics survive a logout — which is exactly when someone logs out to report a problem.

The purge runs in `initdb` **after** the patches, so the ephemeral classes they declare are
known, and **before** `setListeners`, so a clear-out does not arrive as a burst of change
events to whatever has just subscribed. It goes through the pristine `bulkDocs`, not the
authoring path, and its failure is logged and swallowed: a stack that cannot clear its
scratch data should still open.

Replication excludes ephemeral classes structurally. The set is resolved once when
`sync()` starts and forms part of the filter identity — PouchDB calls a filter
synchronously, once per change, and reading class models is neither. A class that becomes
ephemeral later takes effect on the next `sync()` rather than silently mid-stream.

## `simple`: no schema, and therefore no authoring path

Log records were written as a bare `{ log }` with no `~class` at all, to avoid the cost of
having a class. Measured, that cost was:

| 150 writes | |
| :--- | ---: |
| bare, no `~class` | 860 ms |
| through the authoring path | 1549 ms |

**1.8×** — real, and much smaller than the fear it produced. The dominant cost is the
IndexedDB write itself. But the per-document part of the difference is a class-model
lookup, a database round trip, and that is what `simple` removes.

**Simple means no triggers, not only no schema.** If a simple class could carry triggers,
the plugin would still have to load the class to discover them, and the round trip would
remain. "A bag of documents" is the whole proposition.

The flag is answered from a `Set` held on the stack, refreshed when the datamodel is in
place and whenever a class model changes — because the plugin needs the answer *before*
deciding whether to load the class, and loading it to find out is the cost being avoided.
An unknown class is not in the set, so it takes the full path and still fails as "Class not
found": the fast path never becomes a way to write to a class that does not exist.

## The query engine was never involved

The open question was whether a class with no attributes can be queried. It can, and not by
accident: the engine keys on `~class` and the class model's **name**, never on its
attributes. `getCards` builds `{"~class": {$eq: name}}` and projects whatever columns the
query asked for; `canApplyQueryLimitEarly` consults crypto and policies;
`computeProjectionFields` derives from the query's own columns. None of them reads a schema.

Verified against a simple class holding deliberately heterogeneous documents: `WHERE`,
`ORDER BY` and `LIMIT` over a field no schema declares, a field only one document has, and
a `JOIN` to a schema'd class all behave normally.

## Does a simple class still need a definition?

Yes, and deliberately. The model is what `FROM SimpleEvent` resolves against, what carries
`ephemeral`, what policies target, what `getClasses()` lists, and what puts the class in the
simple set at all. Dropping it would trade a cheap declaration for a bag of documents that
cannot be queried, listed, governed or replicated-except.

## Consequences

- **A simple class cannot encrypt a field.** Field encryption is driven by attribute
  config, and there is none. `~Log` is the case that motivated this and it is also the case
  that must never leave the device, so the two properties are set together.
- **A class with no primary keys can no longer build a primary-key design document.**
  `addDesignDocumentPKs` emitted `const hasAllKeys = ;` for an empty list — a map function
  that does not parse. It now refuses, which is the normal case for a simple class.
- **`getClassModels` projects `ephemeral` and `simple`.** Its field list is fixed, so a flag
  missing from it reads as `false` on every class — which is how the first attempt at this
  silently found no ephemeral classes at all.
- **Diagnostics from before patch `0.0.15` applies are not stored.** `~Log` does not exist
  during a stack's own startup; the sink's existing catch drops them and they still reach
  the console.
- **The `~log-` id prefix is kept** alongside the class: it costs nothing, states intent at
  the write site, and still covers databases holding pre-`~Log` records.

## Beyond logs

An application can declare its own ephemeral class — a cache, derived state, anything a
peer neither needs nor should receive — and get local, queryable, live-updating storage
that never syncs and clears itself on open. With `useQuerySQL` now live (ADR-0026), that is
a queryable client-side store with reactive reads, which is the ground a redux or
react-query layer would otherwise have to build for itself.

## Tests

`packages/client/src-test/ephemeral-classes.test.ts` — `~Log` is ephemeral and does not
replicate while an ordinary class does; an application declares its own ephemeral class,
its documents are gone after a reopen, and the durable class beside it is untouched.

`packages/client/src-test/simple-classes.test.ts` — a simple class holds heterogeneous
documents and answers `WHERE`, `ORDER BY`, `LIMIT`, a sparse field and a `JOIN`; and its
writes do not look up the class model, asserted as *growth* against document count rather
than as wall-clock time, which was flaky under load.
