# ADR-0032 — Reads decrypt again, and a policy arms on `active: true`

Status: accepted · Date: 2026-09-01

Two contracts surfaced by porting the stack-backed jest suites to the browser tests
(the suites had never actually run, so both behaviors were unpinned). One was a
regression and is fixed; the other was questioned and confirmed as design.

## Decision

1. **Single-document reads decrypt.** The plugin's `get` override is restored, so
   `stack.db.get` and `stack.getDocument` return plaintext for encrypted attributes -
   symmetrically with `bulkGet`, `find` and the query engine. Ciphertext is the
   *changes feed's* property (ADR-0020) and replication's (`getReplicationHandle`),
   never a read's.
2. **The `put` override stays retired.** pouchdb-core routes `put` through `bulkDocs`,
   and the plugin's active `bulkDocs` owns encryption; a put override that encrypted
   too would encrypt twice. The retired code stays in the file as a comment, with the
   reason beside it.
3. **A policy enforces only while `active: true`.** An unflagged or explicitly
   inactive `~Policy` does not apply. This mirrors document visibility - `findDocuments`
   injects the same `active: true` everywhere - and is confirmed as the intended
   contract, not a fail-open bug.

## 1 — How reads stopped decrypting, and nobody decided that

The decrypting `get` override was written in `Optimize encrypted read handling`
(cdabd0a, 2025-11-30) and commented out five weeks later inside
`Fully specified imports, plugin loading shim` (d60418d9) - a commit whose message
says nothing about encryption. Restoring it surfaced the actual mechanism: the shim
broke the override's capture - `PouchDB.prototype.get` resolves `undefined` in the
UMD build, so `pouchGet.call(...)` threw on the first read and every stack failed to
initialize. The override was commented out to stop the bleeding instead of being
recaptured, and no ADR recorded it. From then on the read surface was asymmetric:
`stack.query` returned plaintext while `stack.getDocument` returned
`{__enc: true, ...}` payloads for the same document - and the jest test that pinned
decrypt-on-read could not catch it, because it could not open a database under Node
at all.

The recapture is the fix ADR-0019 already prescribes for `bulkDocs` and `bulkGet`:
`get` joins `PristineDbMethods`, captured from the raw instance before the plugin
shadows it, handed in as an argument rather than looked up.

One consequence reaches the sync layer: the replication handle's contract is reading
documents *exactly as stored*, and it restores the pristine `bulkGet` for that reason
- so it now restores the pristine `get` too, or the decrypting override would leak
plaintext into the one surface built to carry ciphertext.

The restoration is not a plain uncomment. The plausible motive for disabling it was
cost - the old override built a class snapshot (a database find) on *every* get. The
restored override asks the cached class model "does this class encrypt anything?"
first, so a get on a class with nothing encrypted pays a cache lookup, and only
encrypted classes pay the snapshot and the decrypt.

Two side effects of the restoration are improvements:

- **Update flows on encrypted classes stop re-wrapping ciphertext.** A
  read-merge-write that fetched ciphertext would spread the `__enc` payload into the
  next revision and encrypt it again. Reads returning plaintext make the round trip
  symmetric.
- **`getDocument` matches its own documentation** - and jobs, which read through
  `stack.db.get` (ADR-0002), see the same values queries see.

Pinned by the `encrypts marked fields at rest and decrypts them on read` test:
stored form carries `__enc` with no plaintext anywhere in it; `getDocument` and
`SELECT` both return the plaintext.

## 3 — Why `active` arming is design, not fail-open

The question was raised as a security finding: a `~Policy` written without
`active: true` is silently not enforced, which reads like fail-open. The ruling is
that it is the intended semantic. `active` is DocStack's document-wide visibility
flag - `findDocuments` injects `active: true` into every selector, so an unflagged
document is invisible to ordinary reads everywhere, and a policy is not special:
inactive policies are not enforced.

What makes this acceptable rather than a foot-gun is that it is now *stated and
pinned*: the policy loader's comment names the contract, and the
`a policy enforces only while active` test proves both directions - a dormant
(unflagged or `active: false`) deny-all does not apply, and arming the same rule
flips the outcome on the next write.

Consequence for authors: write policies through the authoring path, or set
`active: true` explicitly when writing them raw. The system patches and
`ensureDefaultPolicyForClass` already do.
