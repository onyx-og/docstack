# Findings: `@docstack/client` 0.1.6

Written 2026-08-26 from `paper`, replicating a real stack against Google Drive via
`@docstack/pouchdb-adapter-googledrive@0.1.5`.

Reproduced by [`packages/web/tests/drive-id-collision.spec.ts`](../../packages/web/tests/drive-id-collision.spec.ts)
— `npm run test:e2e` with `GOOGLE_DRIVE_ACCESS_TOKEN` set.

---

## 1. Document ids are minted from a counter replication never advances

**Severity: silent data loss.** This is the root cause behind every Drive symptom we saw,
and it needs no second device — one client that has pulled anything is enough.

### Reproduction

A fresh stack syncs against a remote holding one Paper, then creates a Paper of its own:

```
lastDocId before sync:        1
Paper ids pulled from Drive:  ["Paper-2"]
lastDocId after sync:         1          <-- unchanged by the pull
created:  {"title":"ids-…","_id":"Paper-2","~class":"Paper","active":true, … }
Paper ids after the create:   ["Paper-2"]     <-- one document, not two
titles via the class layer:   ["handoff-…"]   <-- the pulled one; the new one is gone
```

`Class.add` returned a document — with no `_rev` — and reported success. The document does
not exist. Nothing threw, nothing logged, and the caller has every reason to believe it
saved.

### Why

`ClientStack.lastDocId` is established when the stack opens and incremented by local
writes. Replication writes bypass that path entirely — correctly, since they go through
`getReplicationHandle()` — so a pulled `Paper-2` never advances the counter. The next
`add()` computes `lastDocId + 1`, mints `Paper-2` a second time, and PouchDB resolves the
two as revisions of one document.

The same arithmetic makes two devices collide from the first document each: both start at
`lastDocId: 1`, both mint `Paper-2`, and the winner is whichever revision hash sorts higher.

Note that the schema in `paper` already gives `Paper.slug` a collision-safe value through a
trigger calling `stack.cryptoEngine.generateRandomString(12)`. The `_id` — the thing
replication actually keys on — is the one identifier that is not safe.

### Suggested fix

Sequential ids cannot be made safe by patching the counter; recomputing the maximum at
write time still races two devices. The identifier has to stop being derived from local
state:

- Mint `_id` from the same random source the slug trigger already uses, or
- prefix the sequence with a stable per-client id (`Paper-<client>-7`), so two devices
  cannot produce the same string.

If sequential, human-readable ids must be kept, then a document that arrives by
replication has to advance the counter — the sync layer would have to feed the changes
feed back into the stack — and even then two offline devices still collide. The random
identifier is the only version of this that is correct.

Worth adding regardless: `Class.add` should not return a document-shaped value with no
`_rev`. Whatever the id strategy, a write that did not land should throw.

---

## 2. The client's own log records replicate

**Severity: moderate.** Costs quota, bandwidth and remote storage on every sync.

After a sync the local database holds documents shaped like this:

```json
{
  "log": {
    "level": "info", "message": "getCards - selector", "module": "class",
    "className": "Paper", "selector": { "~class": { "$eq": "Paper" }, "active": true }
  },
  "_id": "01b4ebdc-90fc-4b70-ac5d-3c4aa908f430",
  "_rev": "1-eaf43c6b4cbefbc66d9e7ad367da5ae5"
}
```

These are the client's log records — the successor to the winston `PouchDBTransport` —
written into the stack's own database. They carry **no `~class`**, so the internal-document
filter does not recognise them and replicates them.

They dominate the remote. Of 134 document ids on Drive, **111 were log records** and 23
were real. Every client pushes more on every sync, and every other client pulls all of them.

### Suggested fix

Give log records a `~class` the internal filter excludes, or have
`createReplicationFilter` reject documents whose payload is a bare `log` field. Writing
diagnostics into the database that is replicated is worth reconsidering on its own —
`logLevel: 'info'` should not be a network cost.

---

## 3. Internal documents reach the remote

**Severity: moderate.** Contradicts the documented behaviour of `internalDocs`.

`StackSyncOptions.internalDocs` is documented as keeping "`~system`, the crypto marker,
design documents, locks, sessions and the patch ledger on this device", and defaults to on.
The remote nevertheless held:

```
system              ~AuthModule    AuthMod-Classic         Job-Auth-Classic
~Job                ~JobRun        ~Group                  Group-Admin
Group-Default       ~Policy        Policy-Admin            Policy-System-Classes
Policy-User-SelfAccess            ~User                    ~UserSession
```

Both the internal class definitions and their instances. Sessions and policy documents are
per-device state; replicating them between devices on one account is confusing at best,
and a correctness problem once more than one identity exists.

Instances like `Group-Admin` and `Policy-Admin` are worth a close look: they are internal
but carry no `~` prefix, so a filter keyed on the prefix would miss them.

---

## Suggested order

1. **Id allocation (#1).** Nothing else is worth measuring while writes disappear.
2. **Log records (#2).** Cheap, and it shrinks the remote by ~80%, which makes every other
   investigation legible.
3. **Internal-document filter (#3).**

There is a separate, real adapter bug in
[docstack-gdrive-adapter-0.1.5.md](docstack-gdrive-adapter-0.1.5.md), but it is not the
cause of the data loss above and is much less urgent.
