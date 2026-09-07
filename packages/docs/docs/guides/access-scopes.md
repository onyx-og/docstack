---
title: "Scope your data"
description: "Seal content under attribute policies with access scopes: mint a scope and issue attribute keys where you control them, label documents, hand devices their keys, and read what the mathematics allows."
sidebar_position: 6
sidebar_label: "Access scopes"
---

An access scope is a named set of content whose encrypted fields seal under one content key, and that key is itself sealed under an **attribute policy** such as `("role:manager" and "dept:sales") or "clearance:secret"`. A device whose attribute key satisfies the policy opens the scope; one whose key does not holds the same ciphertext and reads `null`. There is no check to bypass: denial is decryption failure, on the device owner's own machine included.

Scopes decide *under which key* a document's `encrypted: true` fields seal. The schema still decides *which fields*; see [Encrypt fields](./encrypt-fields.md). The model, its formula language and its limits are in [Access control](../concepts/access-control/index.md); this page is the API.

:::info Version
Scopes ship in `@docstack/client` from the release after 0.2.0 (they are on `main`). `@docstack/abe`, the CP-ABE primitive, is installed as a dependency of the client and is never imported by application code on a device. The cryptography is experimental pending audit; see the [threat model](../concepts/access-control/threat-model.md).
:::

## 1. Mint a scope where you control it

The **authority** half runs wherever the application controls: its server, an admin ceremony, a script. Master keys never belong on end-user devices.

```typescript
import { setup, keygen } from '@docstack/abe';
import { ClientStack } from '@docstack/client';

// Once per deployment. Keep `msk` secret; `pk` may be public.
const { pk, msk } = await setup();

// A scope document: a fresh 32-byte content key, sealed under the policy,
// with the key id and a per-scope canary stamped in.
const hrScope = await ClientStack.buildAccessScope({
    scopeId: 'hr',
    policyString: '"role:hr" or "clearance:exec"',
    pk,
});
```

`buildAccessScope` needs the authority *public* key only and returns the document without writing it. Publish it into the database from any stack you control, or ship it in a [patch](./patches.md):

```typescript
await stack.db.bulkDocs([hrScope]);
```

The document replicates with the data, so every device receives it. That is safe by design: the policy is public, the content key inside it is sealed, and the canary lets a device verify a key it opens before trusting it.

```json
{
  "_id": "~scope-hr-v1",
  "~class": "~AccessScope",
  "scopeId": "hr",
  "policyString": "(\"role:hr\" or \"clearance:exec\")",
  "abeWrappedCek": "<opaque>",
  "kid": "3f9a1c…",
  "version": 1,
  "encryptedMarker": { "__enc": true, "iv": "…", "data": "…", "kid": "3f9a1c…" },
  "active": true
}
```

## 2. Issue attribute keys

```typescript
const aliceKey = await keygen(msk, ['role:hr', 'dept:people']);
const bobKey = await keygen(msk, ['role:sales']);
```

An attribute key embeds a person's attributes in the key material. Alice's key satisfies the `hr` policy; Bob's does not, and no amount of client-side effort changes that. Keys and scope blobs are opaque strings: store and transport them verbatim, never parse them.

How a key reaches a device is the application's contract, exactly as it is for the document key: your server hands it over at login, or a cloud grant does, and the device persists it. DocStack stores nothing of it.

## 3. Hand devices their key

```typescript
const stack = await ClientStack.create('my-app', {
    documentKey,
    accessKeys: {
        attributeKey: await vault.get('attributeKey'),
        // Called once at open when declared scopes remain sealed after the key above was
        // tried. Return newer material to try it immediately, or null to stay partially locked.
        requestAttributeKey: async (lockedScopes) => myServer.fetchAttributeKey(lockedScopes),
    },
});

// Later, or instead: an idempotent attempt that opens whatever the key satisfies.
const { unlocked, locked } = await stack.unlockScopes(attributeKey);
```

`unlockScopes` tries every declared scope. For each one the key can open, it checks the recovered content key against the scope document's `kid` and canary, admits it to the keyring, and dispatches a `scopeUnlocked` event (`detail: { stackName, scopeId, version, mode }`). Scopes are attempted after patches at open, because a patch may carry the scope documents themselves, and a patch that was deferred behind a sealed scope replays once the scope opens.

```typescript
stack.isScopeLocked('hr');          // true until a key that satisfies the policy is admitted
await stack.lockedScopeIds();       // every declared scope this session cannot open
stack.addEventListener('scopeUnlocked', (e) => console.log(e.detail.scopeId));
```

## 4. Label documents

A document joins a scope with the reserved `~scope` field, or inherits its class's default:

```typescript
await salaryClass.add({ who: 'alice', amount: '100000', '~scope': 'hr' });
```

```json
{ "_id": "Salary", "~class": "class", "name": "Salary", "defaultScope": "hr", "schema": { "…": "…" } }
```

The document's own label wins over the class default. A document with neither seals under the legacy document key, unchanged. Only `encrypted: true` attributes seal; ids, timestamps, the label itself and unflagged attributes stay plaintext, which is what keeps lists, joins and replication working without a key.

## 5. What reads look like

A session that has opened the scope reads plaintext. One that has not reads the sealed fields as `null` and everything else as written: the outsider in the example sees `who: 'alice'` and `amount: null`. Queries, `findDocuments`, class reads and live subscriptions all behave the same way, because the seal is on the ciphertext, not in the read path.

Every sealed payload is bound to its label: the scope id and key id are authenticated into the AES-GCM ciphertext as additional data, so a relabeled or stripped label does not merely look inconsistent, its decryption fails.

## 6. What writes refuse

- **Writing into a sealed scope** throws `StackLockedError` with `scopeId` set. A device that cannot open `fin` cannot author into `fin`; writing would seal under the wrong key or none.
- **Relabeling content the writer could not open** throws `StackScopeMismatchError` (`docId`, `scopeId`). A document labeled `fin` that carries a payload sealed under `hr`'s key is refused and never re-sealed under `fin`. That refusal is the guard against the induced-downgrade attack: a tampered label tricking an authorised writer into re-sealing content under a weaker scope. A legitimate move between scopes opens the source scope first, so the payloads arrive as plaintext and seal cleanly under the target.

## 7. The formula

Policies are monotone formulas over quoted attributes: `and`, `or`, parentheses, `"kind:value"` literals. No negation, no code, no document inspection. The scheme's parser needs balanced parentheses, so `buildAccessScope` and `wrapCek` normalise the formula first: `"a" and "b" and "c" and "d"` becomes `(("a" and "b") and ("c" and "d"))`. `normalizePolicy` from `@docstack/abe` does the same on its own and throws on `not`. Vocabulary and patterns are in [Attribute policies](../concepts/access-control/policy-model.md) and the [recipes](../concepts/access-control/recipes.md).

## 8. Rotate a scope, revoke a member

Revoking membership is rotating the scope. The authority mints a new version with a policy the departed key no longer satisfies:

```typescript
const hrV2 = await ClientStack.buildAccessScope({
    scopeId: 'hr',
    policyString: '"role:hr" and "staff:permanent"',
    pk,
    version: 2,
});
await stack.db.bulkDocs([hrV2]);
```

A device whose key satisfies the new policy admits version 2 as its **read-write** key and keeps version 1 read-only, so documents re-seal under the new key as they are next written and old ones stay readable in the meantime. A device that satisfied only the old policy keeps what it could already read; no cryptosystem un-reads data. Attribute-level revocation, shrinking a key rather than a scope, is the scheme's known weak point and is on the [roadmap](../contributing/roadmap.md).

## 9. Replication

Scope documents are ordinary documents of the `~AccessScope` class and replicate with the data. A remote holds sealed keys and public policies, nothing it can open. If you replicate with a `classes.include` allow-list, add `~AccessScope` to it: the class is not part of the data-model set that rides along automatically, and a replica without the scope documents has nothing to unlock. See [Filter what replicates](./filtering.md).

## 10. What this does not do

The mathematics binds the device owner to the policy. It does not bind the *application*: what your code does with an open scope, which screens it shows, is your logic. It does not hide existence, counts or labels, only sealed field values. It does not stop a writer with replication access from vandalising labels; that never becomes disclosure, but preventing it needs writer authentication, which is not built. And the primitive, rabe's AC17 on BN254 compiled to WASM, is unaudited. The [threat model](../concepts/access-control/threat-model.md) states each of these plainly.

## API summary

| Where | Member | Purpose |
| :--- | :--- | :--- |
| `@docstack/abe` (authority) | `setup()` | Mints `{ pk, msk }`. |
| `@docstack/abe` (authority) | `keygen(msk, attributes)` | Issues an attribute key. |
| `@docstack/abe` (authority) | `wrapCek(pk, policy, cek)` | Seals a 32-byte key; used by `buildAccessScope`. |
| `@docstack/abe` | `normalizePolicy(policy)`, `parsePolicy`, `policyAttributes` | Formula helpers. |
| `ClientStack` (static) | `buildAccessScope({ scopeId, policyString, pk, cekHex?, version? })` | Assembles an `~AccessScope` document. |
| `StackOptions` | `accessKeys: { attributeKey?, requestAttributeKey? }` | The session's key at open. |
| `stack` | `unlockScopes(attributeKey)` | Attempts every declared scope; returns `{ unlocked, locked }`. |
| `stack` | `isScopeLocked(scopeId)`, `lockedScopeIds()` | Per-scope lock state. |
| `stack` | `resolveScopeLabel(doc, classModel?)` | Which scope a write seals under. |
| Events | `scopeUnlocked` | One per admitted scope key. |
| Errors | `StackLockedError.scopeId`, `StackScopeMismatchError` | Sealed-scope write, label/key mismatch. |
