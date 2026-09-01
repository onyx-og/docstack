# Finding — the document key is regenerated per session and never verified

**For dispatch to the DocStack repository.** Found while planning to switch encryption on
in a consumer app, before writing any application code. Observed by reading
`@docstack/client@0.1.5`; not yet reproduced in a test, which is the first thing to do.

---

## What happens

`ClientStack.ensureCryptoConfigDocument()` (`lib/core/stack.js`) contains:

```js
if (!this.cryptoEngineDisabled && !this.cryptoEngine.getDocumentKey()) {
    const randomBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randomBytes);
    const documentKey = /* hex of randomBytes */;
    await this.cryptoEngine.setDocumentKey(documentKey);
    logger.info("Initialized new document key");
}
```

**A stack with no key generates a new random one, sets it on the in-memory CryptoEngine, and
never persists it.** The marker document it writes alongside holds `_id`,
`cryptoEngineDisabled`, `createdAt` and `encryptedMarker` — not the key, wrapped or
otherwise.

So on the next open the same branch runs again and produces a *different* key.

## Why nothing catches it

`validateCryptoConfig(existing)` makes two checks:

1. that `cryptoEngineDisabled` matches how the stack was created, and
2. that the engine is enabled if `encryptedMarker` is an encrypted payload.

**It never decrypts `encryptedMarker`.** The canary is written and then never read, so a
key that cannot decrypt a single stored field still passes validation — check 2 asks only
whether *a* key is present, not whether it is *the* key.

## Consequence

Any consumer that marks an attribute `encrypted: true` and does not call `authenticate()`
or `setAuthSession()` will:

- write ciphertext under key K1 in session one,
- open cleanly under key K2 in session two,
- and read every encrypted field back as undecryptable, with **no error at any point**.

The failure is silent, it is data loss, and it looks like corruption rather than
misconfiguration. It is scoped to the no-authentication path — a stack created with
`credentials`, or handed a session through `setAuthSession`, has a key before this branch
is reached and is unaffected.

## Suggested fixes, cheapest first

1. **Read the canary.** In `validateCryptoConfig`, attempt to decrypt `encryptedMarker` and
   throw if it fails. This alone converts silent data loss into a clear, actionable error,
   and the marker already exists for exactly this purpose — it is simply never used.
2. **Do not invent a key.** If encryption is enabled and no key has been supplied, either
   refuse to open the stack or open it with encryption inert. Generating a key that cannot
   outlive the session is worse than having none, because it makes writes look successful.
3. **If a generated key is meant to persist, persist it** — wrapped, in the marker document,
   the way `wrapDocumentKey` / `unwrapDocumentKey` in `crypto-engine/utils` already allow.

## Test worth having either way

Open a stack, write a document with an encrypted attribute, close it, reopen it without
credentials, read the document back. Today that returns unreadable data and no error;
whichever fix is chosen, it should return either the plaintext or an exception.

---

# Decision

**Status:** accepted — 2026-08-24. Supersedes the "suggested fixes" above, which it adopts
in full.

## Verified first

The finding reproduces exactly as described. A test asserting the broken behaviour landed
before any fix, in `src-test/crypto-config.test.ts` ("ADR-0018: document key regenerates
per no-auth session…"): two consecutive no-auth opens of the same stack produce different
keys, the reopen does not throw, and decryption of the first session's ciphertext returns
the ciphertext unchanged with no error raised anywhere.

## The key is the consumer's to supply

DocStack does not invent document keys. A key is provisioned by the application developer —
ideally server-side, where it can be issued to every device of the same user.

This was weighed against generating one client-side and protecting it locally. Both
candidates were rejected:

- **OPFS is not a security boundary.** It is origin-scoped, evictable storage with the same
  threat model as IndexedDB: readable by any script on the origin, destroyed by "clear site
  data". It is somewhere to put a key, not a way to protect one. Where a key must be held
  locally, a **non-extractable `CryptoKey`** (`extractable: false`) structured-cloned into
  IndexedDB is strictly better — the raw bytes are unreachable from JS and only
  encrypt/decrypt operations are possible.
- **WebAuthn PRF cannot be silent.** It is the correct primitive for deriving a stable
  secret from an authenticator, but it requires a user gesture and user verification on
  every retrieval, which the product requirement of "no forms or prompts" rules out. It also
  only helps across devices when the passkey is a *synced* credential; a device-bound one
  yields a different secret per device — the very bug this ADR exists to remove, with more
  machinery in the way.

The general point: **silent and cross-device are not simultaneously achievable client-side.**
Any key a device invents is a key its sibling device does not have. Multi-device encrypted
data requires key transport, and transport is the application's responsibility.

DocStack already carries one such transport for the authenticated path, and it is kept: the
`auto-wrap-document-key` trigger wraps the document key under the user's password-derived
KEK into `~User.wrappedDocumentKey`, which replicates; a second device authenticates and
`unwrapAndStoreDocumentKey` recovers *the same* key. The gap this ADR closes is the
unauthenticated path only.

## Locked stacks

A stack whose crypto engine is enabled but which has been given no key opens **locked**
rather than inventing one (fix 2) or refusing outright.

Locked is a real operating state, not an error:

- Reads succeed for everything that needs no key. Encrypted attributes read back as `null`
  and fully-encrypted rows drop out — the behaviour `processReadableDocument` already had,
  now intentional.
- Writes to a class carrying encrypted attributes are refused. Degrading to plaintext, as
  the code did before this decision, is the failure mode being eliminated.
- `unlock(key)` moves the stack to unlocked. The key is verified before acceptance (below).

Refusing to open was rejected because a key must be settable *after* creation — see
"Supplying the key" — and a stack that will not open cannot be given anything.

The state generalises beyond encryption: a locked stack is one operating on the subset of
its schema that needs no key. `@docstack/server` is expected to reuse it to serve public
data from a stack whose private classes stay sealed.

## The canary decides which keys are accepted

`validateCryptoConfig` decrypts `encryptedMarker` and rejects any key that fails (fix 1).
This is the single admission check, and it replaces the tempting but wrong rule of "a key
may only be set while the stack holds no encrypted data" — that rule would make it
impossible for a second device to open a stack the first device had already written, which
is the primary multi-device case.

The rule is therefore:

- **A canary exists** → a key is accepted if and only if it decrypts the canary.
- **No canary yet** → any key is accepted, and becomes *the* key for that stack.

The canary is minted on first unlock, not at creation: with no key, `encryptValueForMarker`
returns `null` and the marker document is written without one. This is fix 3 — what
persists is not the key but proof of which key is correct, which is what allows a
mistake to be reported instead of silently corrupting data.

## Application patches are deferred at a barrier

Application-supplied patches stop before the first one that would write an encrypted
attribute, and resume on unlock.

Three properties make the mechanism work:

1. **It is a barrier, not a filter.** Patches apply in order because each may assume the
   schema left by its predecessors. Application walks forward and *stops* at the first
   keyed patch; it never skips one to apply a later keyless patch.
2. **Classification is lazy.** A patch is judged immediately before it would be applied, by
   resolving each of its documents' classes against current database state *plus any class
   model the patch carries itself* — a patch can introduce an encrypted attribute and write
   a document using it in one go. Nothing simulates schema evolution ahead of time;
   everything earlier has already landed, so the reading is accurate by construction.
3. **The deferred set is not persisted.** It lives on the stack instance. Reopening replays
   the same `StackOptions.patches` through the same check, so there is no stored state that
   can drift from the options the application actually passed.

Re-encrypting consumer data after the fact was rejected as the alternative: PouchDB retains
revision history, so a document written in plaintext and re-encrypted later leaves the
plaintext readable in a superseded revision until compaction. Deferring means consumer
plaintext is never written at all.

## System bootstrap is the one exception

System patches are *not* deferred, and this is deliberate rather than an oversight.

The constraint is circular. `~User.password` is `encrypted: true` from `~sys-0.0.8` onward,
and system patches seed the `system` user after that point (`~sys-0.0.8`, `~sys-0.0.14`).
But on a brand-new database there is no `wrappedDocumentKey` to recover a key from — the
wrapped key lives *on a user document*, and the first user is the one being seeded. Deferring
it would leave nothing to authenticate against, so `ClientStack.create(conn, { credentials })`
could never bootstrap a fresh database at all.

The seed user is therefore written in the clear, and repaired on unlock:

- What is exposed is the published constant `"system"`, so no secret is disclosed. This is
  the only document DocStack itself writes before a key can exist.
- `unlock` rewrites it through the authoring path, which encrypts its attributes and lets
  `auto-wrap-document-key` run for the first time — producing the `wrappedDocumentKey` that
  lets a second device recover this same document key.
- Without that repair a stack bootstrapped while locked could never authenticate: the
  trigger no-ops with no key held, and `authenticate` would later fail on the missing
  wrapped key.

The narrower guarantee is therefore: **no application data is ever written unencrypted**.
DocStack's own bootstrap constant is, and is fixed up as soon as a key arrives.

Note that `authenticate` itself works on a locked stack — it reads `keyDerivationSalt` and
`wrappedDocumentKey`, neither encrypted, and derives from the *caller-supplied* password
rather than the stored one. So the ordinary path for an existing database is: open locked,
authenticate, unlock as a consequence.

## Readiness

`ready` fires when a stack is locked, carrying the lock state; a separate `unlocked` event
fires if and when the key arrives. Readiness means "usable for what it currently permits",
not "fully initialised".

Withholding `ready` until unlock was considered and rejected: consumers wait on it before
touching the stack, so a locked stack that never signals readiness hangs every caller —
including the one that was about to supply the key.

## Supplying the key

Per-stack, and settable after creation:

- `ClientStack.create(conn, { documentKey })` — keyed from the start.
- `stack.unlock(documentKey)` — keyed later; verified against the canary.

A `DocStack`-level default that new stacks inherit is acceptable sugar. A module-level
global is not: `DocStack` manages several stacks at once, and one ambient key across all of
them is ambiguous.

## Consequences

- Applications that enable encryption and never authenticate now get a locked stack and an
  explicit error on encrypted writes, where they previously got silent, unrecoverable
  ciphertext. This is a breaking change, and the intended one.
- A wrong key is reported at open time rather than becoming unreadable data.
- Stacks may exist in a partially-patched state; `schemaVersion` may legitimately trail the
  newest patch until unlocked.
- Nothing changes for `disableCryptoEngine: true`, or for stacks opened with `credentials`
  — those already held a key before the offending branch ran.
- A stack given a session through `setAuthSession` **did not** hold a key: the method
  applied only the session half of the proof and dropped `proof.documentKey`, while
  `clearAuthSession` cleared the engine's key — so a custom flow was left holding a session
  it could decrypt nothing with, and `isLocked()` stayed true. An earlier revision of this
  section claimed otherwise. `setAuthSession` now installs the key when the proof carries
  one, making the pair symmetric; flows with no key of their own should call `unlock()`.
  Reported in ADR-0019.

---

## Related, not a bug

Two things worth confirming rather than assuming, both surfaced by the same reading:

- **`encryptValueForMarker` is used only for the crypto-config canary**, not for searchable
  encryption. Equality selectors against an encrypted attribute cannot match, because
  `encryptWithAesGcm` draws a fresh random IV per write, so the same plaintext never
  produces the same ciphertext. Reading is transparent — `findDocuments` decrypts results
  through `decryptDocument` — but *filtering by* an encrypted value is not supported. If
  that is intended, it deserves a line in the docs, because "encrypted attributes work
  through DocStack's own query methods" is true of reads and not of predicates.
- **Turning encryption on for an existing stack** appears to be a migration, not a flag:
  `validateCryptoConfig` throws when the stored `cryptoEngineDisabled` disagrees with how
  the stack is being opened. Whether documents written before the switch are re-encrypted,
  and by what, is not obvious from the outside.
