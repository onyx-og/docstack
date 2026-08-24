# ADR-0002 — `stack.db` is a guarded handle

Status: accepted · Date: 2026-08-24

## Decision

`stack.db` returns a proxy over the PouchDB instance. Reads and ordinary writes are
unchanged; the routes that skip the stack's authoring path throw
`StackWriteGuardError`. The unguarded instance is internal, reachable only through
`stack.getReplicationHandle()`.

## Why

Fixing the replication write path meant teaching `StackPlugin.bulkDocs` to store
documents verbatim when `new_edits === false`. That is correct for replication and
is also a one-line way for any caller to write anything into a stack — schema
validation, relation checks, triggers and encryption all skipped. Shipping it on
the public handle would have traded one bug for a worse one.

Three doors, not one:

| Door | Note |
| :--- | :--- |
| `bulkDocs(docs, { new_edits: false })` | Flag arrives in the request envelope *or* in options; both are read. |
| `put(doc, { new_edits: false })` and `put(doc, { force: true })` | `force` is the same hatch under another name — PouchDB rewrites it into `new_edits: false` to mint a deliberately conflicting revision. |
| `_bulkDocs`, `_put`, `_remove`, `_bulkGet` | Adapter methods, below the plugin, invisible to it. |

`put`/`post`/`remove` are untouched: they route through `bulkDocs`, so they were
already validated and still are.

## Why not hide `stack.db` entirely

It is documented API. Jobs receive a stack and read through `stack.db.get`; the
architecture docs use it throughout; `Class`, `Domain` and the query engine are
built on it. Removing it would break real code to fix a problem that is really
about four methods. TypeScript could not enforce it either — `protected` is
unavailable while sibling classes in `@docstack/shared` reach for `stack.db`.

Guarding is the narrower and more honest change: the handle keeps doing what it
documents, and stops doing the thing it should never have offered.

## Why the proxy binds forwarded members

Unbound forwarding leaves `this` as the wrapper, and PouchDB's public methods
delegate through `this` — `bulkGet` calls `this._bulkGet`, `put` may call
`this._put`. Those internal hops would hit the block list instead of the adapter,
breaking ordinary reads. Bound to the real instance, the blocks only ever catch a
caller reading the method off the handle, which is the only thing they are meant to
catch.

`constructor` is exempt. `Function.prototype.bind` does not copy static properties,
so binding it would silently strip `PouchDB.plugin`, `PouchDB.replicate` and the
rest off `db.constructor`.

## Why refusals are rejections, not throws

A synchronous throw is the one shape PouchDB's `bulkDocs` never produces. The guard
answers in whichever style the caller asked in — a rejected promise, or the error
passed to their callback — so error handling that works for a PouchDB conflict also
works here.

## Consequences

- Replicating into a stack from outside DocStack now fails loudly, pointing at
  `stack.sync(...)`. That is intended: the sync layer is where the internal-document
  filter, the schema gate and the encryption-preserving read path live.
- The plugin keeps its `new_edits: false` short-circuit as defence in depth, for any
  path that reaches it.
- `getReplicationHandle()` restores pristine `bulkDocs` **and** `bulkGet` — the
  plugin's `bulkGet` decrypts on read, which would push plaintext to a remote meant
  to hold ciphertext.
