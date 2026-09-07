---
title: "Crypto engine"
description: "The key hierarchy today, the canary, locked stacks, key identifiers and the keyring, which reads decrypt and which deliberately do not, and how scopes will choose the key a document is sealed under."
sidebar_position: 5
---

The crypto engine encrypts the attributes a class flags `encrypted: true`, per field, with AES-GCM through the browser's Web Crypto API. It sits inside the authoring pipeline on the way in and inside the read path on the way out. What follows is how it decides which key, when, and for whom.

## The key, and who holds it

There is one **document key** per stack today: a 256-bit AES key the application supplies as a hex string, at open (`documentKey`) or later (`stack.unlock(hex)`). DocStack never generates it. A key invented per session could not outlive the session, and a second device would invent a different one; that was a real data-loss bug, and its fix is the rule that the key is the consumer's to supply, from wherever it can hand the same value to every device of a user.

An optional **credentials path** derives a key from a password with PBKDF2 and the salt on the `~User` document, and uses it to unwrap the `wrappedDocumentKey` stored there. `stack.authenticate({ username, password })` and the `credentials` option at open take that route. It is a way to *recover* the document key, not a different key model.

## The canary

The first key a stack sees is used to encrypt a small marker, stored as `encryptedMarker` in the `~crypto-engine-config` document. Every later `unlock` decrypts that marker before the key is accepted. AES-GCM authenticates its ciphertext, so a wrong key fails to decrypt rather than yielding plausible garbage, which makes the marker a reliable test: a key is accepted if and only if it opens the canary. A rejected key leaves the stack exactly as it was.

The same document pins the stack to its encryption setting. `disableCryptoEngine: true` is persisted on first use and cannot be flipped on a later open.

## Locked stacks

A stack whose crypto engine is enabled but which holds no key is **locked**. It opens, fires `ready`, and behaves in three deliberate ways: encrypted attributes read back as `null` and fully sealed rows drop out of results; a write to any class carrying an encrypted attribute is refused with `StackLockedError` rather than stored in the clear; and a patch that would write or re-encrypt encrypted data is deferred, recorded in the ledger as dormant, and replayed when `unlock` supplies a key. Bootstrap documents DocStack must write before any key can exist are written in the clear and repaired on the first unlock. `unlocked` fires once the replay is done.

## Key identifiers and the keyring

Every payload the engine writes carries `kid`, the identifier of the key it was encrypted under:

```json
{ "__enc": true, "iv": "…", "data": "…", "alg": "AES-GCM", "kid": "a1b2c3…" }
```

A payload without a `kid` predates the field and is assumed to belong to the primary key. With it, a database that holds two keys is legible: `retireDocumentKey(oldKey)` keeps a key available for reading but never for writing, `unlock(newKey)` makes the new one the writer, and the fields still under the old key can be found by comparing their `kid` with `getKeyId()`. Re-keying therefore becomes incremental and restartable rather than a single offline pass. `getReadableKeyIds()` lists what the engine can open, current key first.

This is the seam the scope model builds on: generalise "one document key plus retired keys" into a keyring dispatched by `kid`, and a scope becomes a key in that ring. See below.

## What decrypts, and what does not

| Path | Result |
| :--- | :--- |
| `stack.db.get(id)`, `getDocument`, `findDocuments`, `query`, `getCards` | The winning revision, decrypted when the key is held. |
| Change events delivered through `subscribeClassDocs` and `subscribeDomainDocs` | Decrypted before delivery, so live views render plaintext. |
| `stack.db.get(id, { rev })`, `{ open_revs }`, `bulkGet` with revisions | The **stored form**, always. These are the reads replication makes. |
| Replication, through the internal replication handle | Stored form. Ciphertext travels; the key never leaves the device. |
| A locked stack, any read | Encrypted attributes as `null`. |

The distinction between winning-revision reads and revision-addressed reads is load-bearing. PouchDB hard-binds its instance methods, so a naive override of `get` decrypted every revision replication fetched and pushed plaintext to the remote under the local revision id. That defect shipped in `@docstack/client` 0.1.8 and was closed in 0.2.0; remotes written by 0.1.8 should be treated as having held plaintext.

## Where it plugs in

The engine is wired through a PouchDB plugin that replaces `bulkDocs`, `get` and `bulkGet` on the stack's database, with the original methods captured *before* replacement and passed in explicitly. PouchDB installs those methods per instance, so capturing them from the prototype yields `undefined`, and capturing them from the wrapped database recurses; the explicit hand-off is what makes the override correct and what lets the sync layer restore the pristine methods for its own reads.

Web Crypto was chosen over a JavaScript implementation for two reasons: native PBKDF2 and AES-GCM are markedly faster, and standard, vetted browser primitives leave less surface for implementation error.

## Scopes beside the engine

Field encryption decides *which fields* are ciphertext. [Access control](./access-control/index.md) decides *under which key*: content belongs to a scope, each scope owns a content key, and that key is sealed under an attribute policy so only a session whose attribute key satisfies the formula can admit it to the keyring. The engine's AES-GCM, `kid` stamping and retired-key mechanics are exactly what a scope key rides on; the scope layer adds the sealing, per-scope canaries and partial locks. [Scopes and keys](./access-control/crypto-access.md) describes that construction and what it costs.

The decisions are [ADR-0018](https://github.com/onyx-og/docstack/blob/main/specs/adr/0018-docstack-document-key-lifecycle.md) (the key lifecycle and locked stacks), [ADR-0019](https://github.com/onyx-og/docstack/blob/main/specs/adr/0019-stackplugin-pristine-capture.md) (pristine capture), [ADR-0020](https://github.com/onyx-og/docstack/blob/main/specs/adr/0020-change-events-carry-ciphertext.md) (change events decrypt), [ADR-0032](https://github.com/onyx-og/docstack/blob/main/specs/adr/0032-reads-decrypt-policies-arm-on-active.md) (reads decrypt again) and [ADR-0040](https://github.com/onyx-og/docstack/blob/main/specs/adr/0040-sync-while-locked-junction-hazards.md) (revision-addressed reads serve the stored form).
