# Finding — sync on a locked stack: the transport is right, three junctions are not

Status: resolved upstream (see Resolution) · Date: 2026-09-03

**For dispatch to the DocStack repository.** Written after tracing the whole path in
`@docstack/client` 0.1.8, prompted by a consumer asking what actually happens when Drive
replication runs against a locked stack. The short answer is that replication itself is
handled carefully and correctly — and that the care stops at three junctions where
replication meets patches and propagation.

---

## What is verified correct, first

Because it is worth keeping and worth not breaking:

- **Replication uses the pristine handle** (`getReplicationHandle`), with the plugin's
  `bulkDocs`/`bulkGet` restored. Reads leave ciphertext as ciphertext — a locked or
  unlocked stack pushes the same bytes, and no plaintext reaches the remote. Writes land
  with their own revisions and **bypass the authoring path entirely**: no validation, no
  triggers, no propagation runs on pulled documents. For documents at rest, locked sync
  is safe in both directions.
- **The patch ledger stays home.** `patch`-class documents are device-local by default
  (`OPTIONAL_INTERNAL_DOC_CLASSES.patchLedger`), so one device's record of having applied
  a patch cannot poison another device's dedupe.
- **Patch-seeded documents stay home.** `seededDocIdsFromPatches` folds every id a
  configured patch carries into the internal-docs filter, so class models (and any marker
  documents a consumer seeds) are reconstructed from code on each device rather than
  replicated — the schema travels in the app, never in the database.

## Junction 1 — the schema gate cannot see consumer patches

`checkSchema` compares `stack.schemaVersion` against the version published on the remote.
But `schemaVersion` is set only by `applyPatches` — the **system** patch path. The
consumer path, `applyConsumerPatches`, never touches it (and `applyPatch`, which both
share, does not either).

So two devices on the same build always agree at the gate, whatever their consumer
schemas are doing:

- Device A applied consumer patch `1.6.0`; device B has it **deferred** behind the
  document key, or failed. Same build → same system version → gate passes → B pulls
  documents shaped by a schema B does not have.
- The version published to the remote is the system version, so consumer-patch skew
  between *builds* passes the gate just as silently.

The gate's docblock says it "refuses a remote written by a newer build", and for the
system schema it does. The proposal: fold the highest applied **consumer** patch version
into what is published and compared — it is already recorded per device in the patch
ledger, so it is one query at `start()`.

## Junction 2 — the deferred replay propagates over pulled documents, and `add` overwrites

This is the one that can corrupt data across devices, and it is a pincer of three
behaviours that are each defensible alone:

1. While B is locked with `1.6.0` deferred, replication (junction 1 let it run) **pulls
   A's documents that already carry the new attributes** — occurrences with `series` and
   `detached` set. Pristine handle: no validation, correctly.
2. On unlock, the deferred patch replays. Writing the class model through the guarded
   path triggers propagation: the bulkDocs interceptor diffs the schemas and runs
   `applySchemaDelta` over **every existing document of the class** — the pulled ones
   included.
3. `attributeEffect("add")` does `doc = { ...doc, ...attribute.getEmpty() }` —
   `{ series: null }` — **overwriting the pulled value unconditionally**, and then
   validates the result.

From there one of two things happens, and which one deserves a runtime check:

- If `validate(null)` rejects (the attribute builder produces `.optional()`, never
  `.nullable()`, so it should), the replayed patch **throws and fails on the first pulled
  document** — and keeps failing on every unlock for as long as pulled documents exist.
  The device's schema trails permanently, with sync running the whole time.
- If it passes, the propagation quietly **nulls the new attribute on every pulled
  document** and the ordinary push replicates the damage back to the device that had the
  data right.

The `applySchemaDelta` early-return defect (separate finding) currently decides which
attribute this happens to, which is not a mitigation so much as a lottery.

The fix is one line in spirit: **`add` must fill, never overwrite** —
`if (!(attribute.name in doc)) Object.assign(...)` — which also makes "re-add an
attribute some documents already carry" (any repair patch) safe. The merge-semantics
proposal asks for the same thing for the same reason.

## Junction 3 — propagation reads and writes through paths that mind the lock

Already filed as *class-model patches are never deferred*, and sharpened by what the
propagation driver does: `classObj.getCards()` is a decrypting read, so on a locked stack
the propagation throws `StackLockedError` — which now rejects `ClientStack.create` and
unmounts the stack for the session (see that finding's addendum). One more consequence of
the same read is worth a check while there: `getCards()` hands back **decrypted**
documents, and the propagated updates go back in through `stack.db.bulkDocs`. If that
write path does not re-encrypt the untouched encrypted attributes, a propagation is a
silent decrypt-at-rest of every document it touches. The consumer could not verify this
from outside; it needs one assertion in the client's own suite.

## The consumer's position meanwhile

Tokido's exposure today is bounded but real: one device applies `ws-1.6.0` while another
holds it deferred, both sync, and the second device's unlock replays into junction 2.
Nothing consumer-side can prevent it — the propagation runs inside `applyPatch` — so the
mitigation is operational: keep every device on current builds so the deferral window
stays short, and treat a repeated `StackLockedError`/validation failure at unlock as this
finding rather than as key trouble.

## Reproduction sketch

Two stacks, one remote, a class with an encrypted attribute and one plain attribute added
by a consumer patch:

1. Stack A: apply the patch, write a document with the new attribute set, sync.
2. Stack B: open with the patch deferred (locked), sync — the document arrives.
3. Unlock B.
4. Observe: either the replay rejects on validation, or the document's new attribute is
   null on B — and after the next sync, on A too.

## Resolution (upstream)

All three junctions are closed — and reproducing junction 2 uncovered a fourth, worse
than any of them: **the "verified correct" section was false on the traced build.**

**Junction 0 — replication was pushing plaintext.** Running the reproduction showed
the remote holding every encrypted attribute in plaintext under the *local* revision
id, from the pristine handle, on a bare `PouchDB.replicate`. The mechanism defeats
the handle by construction: PouchDB hard-binds instance methods at creation
(`this.bulkGet = adapterFun(...).bind(this)`), so the captured pristine `bulkGet`
runs against the raw instance no matter what it is bound to - and pouchdb-core's
bulkGet shim, plus `get`'s own `open_revs` branch, fetch **per revision through
`this.get`**, which is the plugin's decrypting override (restored in ADR-0032; the
leak shipped with that restoration). The fix is at the one place every dispatch
lands: the override now serves the **stored form for any revision-addressed read**
(`{rev}` / `{open_revs}`) - taxonomically the same line ADR-0020 draws, since naming
a revision is a replication/forensic read; the winning-revision read still decrypts.
Pinned by `locked-sync.test.ts` "junction 0": remote ciphertext, no plaintext
anywhere in the serialized document, app reads unaffected.

**Junction 1 — the gate now sees consumer patches.** The sync marker gained
`consumerSchemaVersion`; `checkSchema` compares the remote's against the highest
applied consumer patch in the local ledger (one raw query) and refuses with
`SyncSchemaMismatchError { scope: "consumer" }`; non-pull replication publishes it.
A device holding a deferral is *behind* by the ledger's own accounting, so exactly
the trailing device refuses - and passes after unlock replays. A remote written only
by older builds records nothing and gates nothing.

**Junction 2 — fixed by ADR-0038, now pinned cross-device.** `attributeEffect("add")`
fills only documents lacking the key, and the early-return lottery is gone. The
reproduction sketch above runs verbatim as the "junctions 2+3" test: the pulled value
survives the deferred replay, still ciphertext-adjacent and validated.

**Junction 3 — class-model patches now defer.** `patchNeedsDocumentKey` treats a
class-model update as needing the key when the stored or carried schema encrypts
anything: propagation decrypts (`getCards`) and re-encrypts (the rewrite), key work
on both sides. A class that does not exist yet still applies while locked - that is
how the schema arrives pre-unlock. The re-encryption half is asserted as requested:
`schema-propagation.test.ts` pins that a propagated rewrite puts untouched encrypted
attributes back as ciphertext.

**Found on the way:** the consumer-patch dedupe read the ledger through the
visibility-filtered path, and ledger documents carry no `active` flag - so every
open re-applied every consumer patch and posted a duplicate ledger document. Reads
raw now; pinned by the reopen test in `stack-patches.test.ts`.
