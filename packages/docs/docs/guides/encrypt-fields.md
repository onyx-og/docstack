---
title: "Encrypt fields"
description: "Flag an attribute as encrypted, supply the document key the application owns, work with a locked stack, rotate keys, and know what reaches a remote."
sidebar_position: 5
---

Mark an attribute `encrypted` and its value is AES-GCM ciphertext before it reaches storage. It stays ciphertext on disk and on every remote it replicates to, and it is decrypted only on the way out, for a session holding the key.

## Flag the attribute

```typescript
await userClass.addAttribute({ name: 'ssn', type: 'string', config: { encrypted: true } });
// or, when creating:
await Attribute.create(userClass, 'ssn', 'string', 'Social security number', { encrypted: true });
```

What is stored:

```json
{
  "_id": "User-k2m9q1w4x7f3",
  "~class": "User",
  "username": "alice",
  "ssn": { "__enc": true, "iv": "…", "data": "…", "alg": "AES-GCM", "kid": "a1b2c3…" }
}
```

`kid` identifies the key the value was encrypted under, which is what makes rotation incremental (below). Everything not flagged is plaintext, on purpose: ids, `~class`, timestamps and unflagged attributes are what lists, indexes, queries and replication work on. Model sensitive data as flagged fields.

A `simple` class has no schema and therefore cannot encrypt a field.

## Supply the key

DocStack never invents the document key. A key generated per session could not outlive it, and a second device would generate a different one. The key is the application's to provision, from wherever it can hand the same value to every device of a user, typically its own server, a cloud grant, or a passphrase-derived vault.

```typescript
// At open:
const stack = await ClientStack.create('my-app', { documentKey: hexKey });

// Or open locked and unlock later:
const stack = await ClientStack.create('my-app');
if (stack.isLocked()) await stack.unlock(await myServer.fetchDocumentKey());
```

`documentKey` is a hex string. Omitting it opens the stack **locked**. `stack.unlock(hexKey)` checks the key against the stack's canary before accepting it, so the wrong key throws (`The supplied document key does not match this stack`) instead of quietly producing unreadable writes. The first key a stack ever sees mints the canary, a small encrypted marker in the `~crypto-engine-config` document, which is what makes every later open verifiable.

Encryption can be switched off per database with `disableCryptoEngine: true`. The choice is persisted on first use and cannot be flipped when the same database is reopened.

### The credentials path

Applications with a local user model can recover the key from the user document instead. `~User` documents carry a `keyDerivationSalt` and a `wrappedDocumentKey`; `stack.authenticate({ username, password })` derives a key from the password with PBKDF2, unwraps the document key with it and installs it. Passing `credentials` to `ClientStack.create` does the same at open time. It is an alternative to provisioning the key directly, not a different key model: the document key is still one value shared by every device that reads the same encrypted data.

## What a locked stack does

A stack with encryption enabled and no key is locked. It is usable, with three differences:

- **Reads null what they cannot open.** Encrypted attributes read back as `null`; a query row consisting only of `null` values is dropped.
- **Writes refuse.** A write to any class carrying an encrypted attribute throws `StackLockedError` rather than storing plaintext.
- **Patches defer.** A patch that would write or re-encrypt encrypted data is held back, recorded in the ledger as dormant, and replayed when the stack unlocks. A locked device is honest at the sync gate: it does not claim a schema version it has not installed.

`ready` fires locked; a separate `unlocked` event fires once `unlock` has accepted a key and replayed what was waiting. Locked stacks and sync are covered in [Sync to a remote](./sync.md#the-schema-gate).

Locks are also per scope. A document labeled with an access scope seals under that scope's key rather than the document key, and a scope the session's attribute key cannot open behaves like a locked stack for its content alone: its sealed fields read `null`, writes into it throw `StackLockedError` with `scopeId` set, and patches touching it defer until `unlockScopes` opens it. See [Scope your data](./access-scopes.md).

## Rotate the key

Re-keying is incremental and resumable. Retire the old key first, then unlock with the new one; fields written under either open while the database is rewritten a piece at a time.

```typescript
await stack.cryptoEngine.retireDocumentKey(oldKey);   // still readable, never written with
await stack.unlock(newKey);                           // now encrypts under newKey

const current = stack.cryptoEngine.getKeyId();
// Find what still needs rewriting: any payload whose kid is not the current one.
for await (const doc of stack.findDocumentsIterator({ '~class': 'User' })) {
    if (doc.ssn && doc.ssn.kid !== current) await userClass.updateCard(doc._id, doc);
}
```

`getReadableKeyIds()` lists every key the engine can read with, current first. `deriveKeyId(hexKey)` is exported for computing the identifier of a key you hold.

## What reaches a remote

Replication reads documents exactly as they are stored, not through the decrypting read path your queries use. Flagged attributes cross the wire and land on the remote as ciphertext, and the key never leaves the device. This is a property of how the sync layer reads the database, not a setting.

Two consequences follow. Fields not flagged `encrypted: true` replicate as written, so a field a remote should not see has to actually be flagged. And a remote written by `@docstack/client` 0.1.8 should be treated as having held plaintext for encrypted attributes: that version's replication read through the decrypting path, which 0.2.0 fixed. Re-create or purge such remotes.

## Which fields to encrypt

Encrypt what must not be readable by whoever holds the storage: the remote, a stolen laptop, another tenant's device that replicated your ciphertext. Leave in the clear what the application needs to list, sort, join and filter without a key. Existence, counts, ids and update rhythms are visible either way; if the existence of a record is itself sensitive, that is a modelling problem this layer does not solve.

## Which key: scopes

The document key is the default. To seal a document under a key that only holders of certain attributes can open, give it a `~scope` label (or give its class a `defaultScope`) and ship the scope in a patch: its content key travels ABE-sealed under an attribute policy, and a session either satisfies the policy or reads `null`. The flag on the attribute still decides *which* fields seal; the scope decides *under which key*. The API is in [Scope your data](./access-scopes.md).

How the engine fits together, what decrypts and what does not, and how scopes are constructed beside it are in [Crypto engine](../concepts/crypto-engine.md) and [Scopes and keys](../concepts/access-control/crypto-access.md).
