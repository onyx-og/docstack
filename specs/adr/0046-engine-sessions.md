# ADR-0046 — Engine sessions: a request-scoped context the pipeline honours

Status: accepted, implemented · Date: 2026-09-11

## Context

`@docstack/client` is a single-user engine by construction. A `ClientStack` holds one
keyring (the document key, retired keys, the scope CEKs its attribute key opened), one
`authSession`, one class cache; `setAuthSession` installs a principal's material on
the stack itself; triggers receive `(document, classObj, stack)` and jobs
`(stack, params, job)`. On a device that is exactly right: the device is the
principal.

A host is not. `@docstack/server` (spec 03, in design) serves many principals from
one stack, and for online clients it runs the engine *for* them: it holds every key
(the document key from configuration, every scope through an authority-minted omni
key), so confidentiality for those sessions is decided on the host, not by the
ciphertext on their device. That needs the engine to answer "what may *this* request
open" and "who wrote this" - and nothing in the engine could carry that. The first
server design wrapped the stack from outside in a "session facade" that narrowed
reads and refused writes. The wrapper could not reach the pipeline: a `before`
trigger still saw no principal, attribution had to be stamped before the write
(outside the guarded path), and any code path on the host could still call
`authenticate` or `dropScopeKeys` on the shared stack and change every session's
view at once. The facade was an admission that the engine had no notion of a
session.

## Decision

1. **A session is an engine concept.** `StackSession` (`@docstack/shared`) carries an
   opaque `id`, a `principal` (`sub`, informational `attributes`), the `scopes` the
   session may open, and whether unlabelled document-key content is open to it
   (`documentKey`). Entitlement is the *caller's claim* - a host decides it with the
   same CP-ABE math a device would run - and the stack's keys are the ceiling: a
   session can never open more than the keyring holds.
2. **`stack.forSession(session)` returns a view with the stack's own shape.** Built
   with `Object.create(stack)`, so `instanceof` holds and every member not shadowed is
   the stack's. Shadowed: the reads (`findDocuments`, `findDocumentsIterator`,
   `getDocument`, `query`, `queryStream`, the live subscriptions) open only entitled
   payloads and null the rest, exactly the locked-read convention at session
   granularity; the writes (`createDoc`, `createDocs`, `deleteDocument`) carry the
   session on the write's options; `getClass`/`getClassSnapshot` build classes bound
   to the view (never subscribed - a view is per request), so `Class` writes and
   reads route through it; `db` is a narrowed handle (winning-revision `get` reads
   through the session, writes carry it, destructive members throw). The query engine
   reaches data only through `findDocuments`, `findDocumentsIterator` and
   `getClass().getCards` - the seam ADR-0039's transaction overlay already relies on -
   so `runQuery`/`runQueryStream` handed the view run narrowed with no executor change;
   early LIMIT pushdown is off under a session because a fully sealed row drops after
   the fetch.
3. **The pipeline honours the session.** `bulkDocs` options carry `session`. The
   plugin stamps `~updatedBy` on every write and `~createdBy` on a document's first
   write (reserved fields, like `~scope`; a caller's value is overwritten), refuses a
   write labelled with a scope outside the session's entitlement or unlabelled
   encrypted content without the document-key grant - with `StackLockedError`, the
   same error a sealed scope raises on a device, because to the writer it is one -
   and hands the session to `before` and `after` triggers as their **fourth
   argument**. `JobEngine.executeJob(id, args, triggerType, session)` hands it to
   `execute(stack, params, job, session)` the same way, and a trigger's `jobId` path
   forwards it.
4. **Whole-stack members are closed doors through a view.** `authenticate`,
   `setAuthSession`, `clearAuthSession`, `unlock`, `unlockScopes`, `close`, `reset`,
   `sync`, `cancelSync`, `applyPatch`, `exportContent`, `importContent`,
   `beginTransaction`, `commit`, `discardTransaction`, `forSession`, and
   `db.destroy/close/compact/viewCleanup` throw `StackSessionError` naming the member.
   The list is explicit on purpose: a new whole-stack member has to be added to
   become reachable, rather than leaking by default. `setAuthSession` stays public
   for device-side custom auth flows and is documented as whole-stack state a host
   must never call.
5. **No session, no change.** Every entry point's session parameter is optional and
   trailing; a stack used as before behaves as before, byte for byte on the wire.

## Consequences

- The host in spec 03 constructs one `StackSession` per request and needs no facade;
  triggers and jobs can attribute and refuse by principal ("stamp the author",
  "refuse unless manager"), which the docs hand to a host as behavioural rules.
- Two documents fields are new and reserved: `~createdBy` and `~updatedBy`. They are
  excluded from the "nothing visible" check like the timestamps, replicate like any
  field, and are absent on writes with no session.
- `prepareChangeDocument` gains a third parameter; the base implementation in
  `@docstack/shared` accepts it and ignores it.
- Not done here, recorded: a feed serving N sessions decrypts each change once per
  session (decrypt once, redact per session is the host's optimisation to build on
  `prepareChangeDocument`); transactions and `exportContent` under a session are
  closed rather than narrowed; the entitlement cache and its invalidation on scope
  rotation live in the host, keyed on the principal's attribute set and the stack's
  scope registry generation.

## Pinned by

`packages/client/src-test/engine-sessions.test.ts`: a stack holding two scopes and a
view entitled to one - reads, SQL (a predicate on a sealed attribute sees `null`),
streaming, `getDocument` and `db.get`, document-key content under the grant; a
foreign-scope write and delete refuse with `StackLockedError`; attribution on create
and update by two sessions; the trigger's fourth argument; a `Class` built from the
view routes through it; the feed is narrowed; a job's fourth argument; closed doors
throw `StackSessionError`; the session is frozen; the view is a `ClientStack`.
