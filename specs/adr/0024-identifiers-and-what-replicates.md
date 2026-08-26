# ADR-0024 — Random document ids, and replicating only what binds two instances

Status: accepted · Date: 2026-08-26

Answers the findings in [0023-client-0.1.6.md](0023-client-0.1.6.md).

## Decision

1. **Document ids are random, not sequential.** `ClientStack.generateDocId(type)` returns
   `Task-<24 hex>` — the class prefix kept, the counter gone.
2. **`createDoc` throws on conflict.** It no longer returns its in-memory draft as though
   the write had landed.
3. **Log records are identified by a `~log-` id prefix** and never replicate.
4. **Replication carries what a peer cannot derive.** The rule is not "is this DocStack's
   own?" but "can the peer already reconstruct this?" — and the patches answer it exactly.

## 1 — ids minted from a counter replication never advances

`_id` was `${type}-${lastDocId + 1}`. Only *local* writes advance that counter; a document
arriving by replication goes through `getReplicationHandle()`, which bypasses the counter
by design. So ids were consumed while the counter stood still, and the next local write
minted one the database already held. PouchDB resolved the two as revisions of one
document and the new one was gone.

Reproduced without a remote — writing through the replication handle *is* what a pull does:

```
count after a pull and a local create: 1     (expected 2)
```

And the case no counter repair can fix, two stacks that have never met:

```
device one → IdShared-4
device two → IdShared-4
```

Both start at `1`. Feeding replicated documents back into the counter still leaves two
offline devices colliding, because a sequence derived from local state cannot be unique
across devices that have not met. The identifier had to stop being derived from local
state at all.

96 random bits, matching the width applications already use through
`cryptoEngine.generateRandomString`. All four mint sites — `createDoc`, `createDocs`,
`createRelationDoc`, `createRelationDocs` — go through one method.

`lastDocId` is left maintained but is now vestigial for identifiers. It still costs a
`db.put` per document on a hot path; removing it touches `initIndex` and is left as
follow-up rather than folded into a correctness fix.

## 2 — the silence was a swallowed conflict

The other half of the finding — *"`Class.add` returned a document with no `_rev` and
reported success"* — was this:

```ts
} catch (e: any) {
    if (e.name === 'conflict') {
        fnLogger.info("Conflict! Ignoring..");
        // TODO: Handle conflict!
    }
    …
}
return doc;   // the draft. No _rev. No error.
```

Random ids make a conflict mean a genuine concurrent write rather than an exhausted
counter, so it is now thrown. This is the third instance of the same swallow-and-return
pattern found in this file (see ADR-0021 for `createRelationDoc`); the batch variants
always rethrew.

## 3 — log records replicated because nothing could recognise them

Written as a bare `{ log: record }` via `db.post`: no `~class`, a random id, nothing any
filter could match. On one measured remote, **111 of 134 documents were log records**,
pushed by every client and pulled by every other.

**Not fixed with a `~class`.** That was the first attempt and it breaks the write path: a
`~class` makes the document `isDocument()` to `StackPlugin`, which then demands a class
model and rejects it — silently, because the sink swallows its own failures, so logging
would simply have stopped. A `~log-` id prefix reaches `INTERNAL_DOC_ID_PREFIXES`, where
`~lock-` already lives, and touches nothing on the write path.

## 4 — what replicates

Measured first. In a stack with **no application data at all**, 23 of 47 documents passed
the filter, every one of them DocStack's own — plus a log record for roughly every
operation the client had performed.

The first rule tried was "`~`-prefixed means DocStack's own, keep it local", recognising a
class model by its id (`~Policy`) and an instance by its `~class` (`Policy-Admin`). It
catches all 23 — and it is wrong, because it also catches `user-alice [~User]` and a group
an administrator created at runtime. Those are DocStack's classes, but no peer can
reconstruct them, and holding them back breaks exactly the case replication exists for.

The right question is not *is this DocStack's own?* but **can the peer already derive
this?** Patches are applied by every client independently, so every document they seed
exists everywhere already. That set is not a judgement call — it is enumerable:

```ts
export const SYSTEM_SEEDED_DOC_IDS = [...new Set(
    syspatches.flatMap(p => (p.docs ?? []).map(d => d._id))
)];
```

Derived from the patches rather than hand-listed, so it cannot drift as the datamodel
grows. Documents therefore sort three ways:

| | example | travels |
| :--- | :--- | :---: |
| seeded by patches everywhere | `Policy-Admin`, `~User`, `Group-Admin`, `system`, `class` | no |
| device-local by nature | `~JobRun`, `~UserSession`, `~lock`, `~log-…` | no |
| **binds the two instances** | app data, app class models, `user-alice`, a runtime `~Group` | **yes** |

`~JobRun` joins the device-local set on the same reasoning as `~lock`: a peer's execution
history is not something this client can act on, and both write their own.

An application's **own** patches seed documents on every client too, so
`StackSyncHandle` reads their ids from the stack's configured patches and folds them in —
an application should not have to enumerate its own seeded ids to get correct replication.
Those ids are part of the filter identity, so changing them forces a fresh replication
checkpoint instead of silently resuming from the previous configuration's.

`replicateSystemDocuments` now means only "send the patch-seeded ones anyway". It does not
govern runtime identity, which always travels.

## Consequences

- **Existing sequential ids keep working.** Only newly minted ids change shape; nothing
  reads an id as a number.
- **A write that does not land now throws.** Callers that relied on `createDoc` returning
  a draft after a conflict will see the error instead — which is the point.
- **Remotes shrink sharply.** On the measured shape, log records alone were ~80% of the
  documents.
- **A stack with no application data replicates nothing**, which is the assertion the new
  test makes.

## Tests

`packages/client/src-test/id-allocation.test.ts` — a local write survives alongside a
replicated one, and two independent stacks do not mint the same id.

`packages/client/src-test/replication-filter.test.ts` — a stack with no application data
leaks nothing; application documents and their class models still travel; a runtime
account and group travel while their patch-seeded counterparts do not; sessions can still
be opted back in, and the escape hatch never releases `~system`.
