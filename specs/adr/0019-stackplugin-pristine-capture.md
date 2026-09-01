# Finding — `StackPlugin` captures `pouch.prototype.bulkDocs`, which does not exist

**For dispatch to the DocStack repository.** A regression in the current working tree of
`packages/client` (post `d367a7c`, "fix: repl and encryption++"), found while consuming the
new build in a real application. **It stops the client from performing any write at all**,
so it blocks ADR-0018 from being exercised by a consumer.

---

## Symptom

Every write fails at the first `bulkDocs`:

```
TypeError: Cannot read properties of undefined (reading 'call')
    at klass.bulkDocs (@docstack/client/lib/index.js — `pouchBulkDocs.call(this, ...)`)
```

The database is created, the stack logs `initdb - starting initialization` and
`Crypto engine enabled, processing encryption`, and then nothing lands.

## Cause

`src/plugins/pouchdb.ts`, the first two lines of `StackPlugin`:

```ts
export const StackPlugin: StackPluginType = (pouch: PouchDB.Static, stack: Stack) => {
    const pouchBulkDocs = stack.db ? stack.db.bulkDocs : pouch.prototype.bulkDocs;
    const pouchBulkGet  = stack.db ? stack.db.bulkGet  : pouch.prototype.bulkGet;
```

`src/core/stack.ts` now calls it **before** `this.db` exists — deliberately, per its own
comment:

```ts
// Captured before `this.db` is assigned, so it wraps the pristine PouchDB
// methods rather than double-wrapping (see StackPlugin's `stack.db ? ... : pouch.prototype...` fallback).
const stackPlugin = StackPlugin(PouchDB, this);          // ← stack.db is undefined here
const rawDb = new PouchDB(conn, toPouchConfiguration(options));
this.pristineDbMethods = { bulkDocs: rawDb.bulkDocs, bulkGet: rawDb.bulkGet };
```

So the `pouch.prototype` branch is taken — and **that branch has always been dead code.**
Measured in a browser at the moment `StackPlugin` runs:

```json
{
  "hasStackDb": false,
  "stackDbBulkDocs": "undefined",
  "pouchType": "function",
  "hasProto": true,
  "protoBulkDocs": "undefined",
  "protoKeys": ["constructor","activeTasks","query","viewCleanup","replicate","sync",
                "createIndex","find","explain","getIndexes","deleteIndex"],
  "protoParentKeys": ["constructor","_setup"]
}
```

`PouchDB.prototype` carries only **plugin-added** methods — `query`/`viewCleanup` from
mapreduce, `replicate`/`sync` from replication, `find`/`createIndex` from
`pouchdb-find`. The core document methods, `bulkDocs` among them, are not there; on
PouchDB 9 they are installed per instance. `pouch.prototype.bulkDocs` is therefore
`undefined`, always.

## Why the published 0.1.5 did not hit it

It took the same dead branch, and then threw the result away. Published `lib/index.js`:

```js
PouchDB.plugin(StackPlugin(PouchDB, this));     // 7195 — stack.db undefined, capture is undefined
this.db = new PouchDB(conn);                    // 7202
this.db.bulkDocs = StackPlugin(PouchDB, this).bulkDocs;   // 7203 — re-invoked, now captures the instance method
this.db.bulkGet  = StackPlugin(PouchDB, this).bulkGet;    // 7204 — same
```

`StackPlugin` was invoked three times, and the two invocations whose output was actually
installed happened **after** `this.db` existed. Collapsing that to a single, earlier
invocation is the right change; it just made a latent dead branch load-bearing.

## Fix

The correct values are already captured two lines below the failing call. Construct the
database first, then build the plugin from the pristine instance methods, and delete the
`pouch.prototype` fallback rather than leaving a branch that cannot work:

```ts
const rawDb = new PouchDB(conn, toPouchConfiguration(options));
// Unbound on purpose: StackPlugin forwards with `.call(this, ...)`.
this.pristineDbMethods = { bulkDocs: rawDb.bulkDocs, bulkGet: rawDb.bulkGet };

const stackPlugin = StackPlugin(PouchDB, this, this.pristineDbMethods);
(rawDb as any).ping = stackPlugin.ping;
(rawDb as any).bulkDocs = stackPlugin.bulkDocs;
(rawDb as any).bulkGet = stackPlugin.bulkGet;
```

with `StackPlugin(pouch, stack, pristine)` taking the methods explicitly instead of
guessing where to find them. Passing them in also removes the ordering trap: the plugin
can no longer be constructed at a moment when its capture is wrong, because the capture is
an argument.

### The obvious wrong fix recurses

Worth stating because it is the first thing anyone will try. Deferring the capture so that
it resolves through `stack.db` at call time — rather than at plugin-construction time —
looks like it fixes the ordering, and hangs the process instead:

```
stack.db.bulkDocs           → guardedBulkDocs        (guarded-db.ts)
  → db.bulkDocs.apply(db)   → stackPlugin.bulkDocs   (installed on rawDb)
    → pouchBulkDocs.call()  → stack.db.bulkDocs      → …
```

The guarded proxy forwards to `rawDb.bulkDocs`, which *is* the plugin method. There is no
error, no stack overflow within a reasonable time — the tab simply stops responding, which
is a much worse failure to debug than the `undefined` one. `stack.db` is never a valid
source for this capture; only the pristine instance methods are. Passing them in as an
argument is what makes that unambiguous.

**Verified locally**: shimming those two constants to resolve from `stack.pristineDbMethods`
only makes the consumer application boot, bootstrap both databases, complete onboarding,
seed content, and round-trip encrypted attributes across a reload. The shim is a proof of
diagnosis, not a proposed patch — the argument above is.

## Tests worth having

1. **`pouch.prototype.bulkDocs` is not a valid source.** Assert directly that
   `PouchDB.prototype.bulkDocs === undefined` on the supported PouchDB, so the next person
   who reaches for it is stopped by a red test rather than by a consumer.
2. **A stack performs a write immediately after `create()`** — the smallest possible
   regression test, and the one this would have failed. Nothing in the existing suite
   appears to exercise `StackPlugin`'s capture from a stack constructed the new way.

## Two smaller things found alongside

- **ADR-0018's "Consequences" repeats an error from the brief it answers.** It says
  nothing changes "for stacks opened with `credentials` or a session — both already held a
  key before the offending branch ran". A stack given a session does **not** hold a key:
  `setAuthSession(proof)` is still `this.authSession = proof` and drops
  `proof.documentKey`, while `clearAuthSession` does clear the engine's key. So
  `isLocked()` — `cryptoEngine.isEnabled() && !cryptoEngine.getDocumentKey()` — is still
  true after `setAuthSession`. That came from my original brief, which stated it wrongly;
  it is corrected in `docstack-document-key-lifecycle.md` §2. Either make
  `setAuthSession` install `proof.documentKey` the way `clearAuthSession` clears it, or
  drop the clause from the ADR and point custom flows at `unlock()`.
- **`lib/core/*.js` is stale build debris.** `lib/core/stack.js` is dated a day before
  `lib/index.js` and still contains the pre-ADR-0018 code. Nothing consumes it — `main`
  and `types` both point elsewhere — but it reads as current source to anyone grepping the
  package, which is how a diagnosis goes wrong. Worth clearing between builds.
