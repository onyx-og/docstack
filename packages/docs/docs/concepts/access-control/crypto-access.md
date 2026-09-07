---
title: "Scopes & keys"
description: "How scope keys are sealed, admitted to the keyring at unlock, managed by the application, rotated on revocation, and what they cost."
sidebar_position: 3
---

# Scopes & keys

The mechanics behind [attribute policies](./policy-model.md). Implemented
(ADR-0045); the CP-ABE primitive ships as `@docstack/abe`, full specification
in `specs/02-crypto-access.md`.

## The construction

CP-ABE (ciphertext-policy attribute-based encryption) never encrypts bulk
data — it seals **keys**:

1. Each scope owns a symmetric content key (CEK). Documents labeled with the
   scope have their encrypted attributes sealed under that CEK by DocStack's
   existing crypto engine (field-level AES-GCM) — the scope chooses the key,
   the schema chooses the fields.
2. The scope's CEK travels ABE-encrypted under the scope's policy formula, in
   a scope document that replicates with the data.
3. At unlock, the session's attribute key *attempts* each scope's CEK. Success
   admits the CEK to the stack's keyring (verified against the scope's canary
   first — a wrong or rotated-away key is an error at unlock, not garbage
   later); failure leaves the scope sealed.

A stack is therefore **partially locked** in general: some scopes open, others
sealed, each following the locked-stack discipline DocStack already enforces —
sealed reads null what they cannot open, writes into a sealed scope refuse
rather than degrade to plaintext, deferred work replays when the scope opens.

## Key management is the application's

DocStack never invents, stores, or transports key material (ADR-0018:
*transport is the application's responsibility*). The application supplies the
session's attribute key from its own infrastructure — a server, a cloud grant,
a passphrase-derived vault — adopting it before first unlock and persisting it
on the device so later boots work offline.

The authority side — setup, issuing attribute keys from the identity model,
sealing scope CEKs — ships in `@docstack/abe` as `setup`, `keygen`, and
`wrapCek`. It runs where the application controls it (its server; an admin
ceremony; eventually the `@docstack/server` package), never in the client's
public surface. The client half is decrypt-only.

## Using it

**Authority (once, off the client):** mint the master key pair, seal a scope's
key under a policy, issue each user their attribute key.

```ts
import { setup, keygen } from "@docstack/abe";
import { ClientStack } from "@docstack/client";

const { pk, msk } = await setup();                 // msk is SECRET — never ships to a device

// A scope document — publish it into the stack like any other document.
const hrScope = await ClientStack.buildAccessScope({
  scopeId: "hr",
  policyString: '"role:hr" or "clearance:exec"',
  pk,
});

// A user's attribute key — hand this to that user's devices, out of band.
const aliceKey = await keygen(msk, ["role:hr"]);
```

`buildAccessScope` needs only the public key: it mints the scope's CEK, seals
it under the policy, stamps the key id, and mints the per-scope canary. Publish
the returned document (`stack.db.bulkDocs([hrScope])`); it replicates like any
other.

**Client:** hand the session's attribute key to the stack. The key is adopted
and persisted by the application, exactly as it provisions `documentKey` today
(before first unlock, offline thereafter).

```ts
const stack = await ClientStack.create("db-app", {
  documentKey: KEY,
  accessKeys: {
    attributeKey: await myVault.getAttributeKey(),
    // Optional: called when scopes remain sealed, so you can fetch newer material.
    requestAttributeKey: async (lockedScopes) => myServer.fetchKeyFor(lockedScopes),
  },
});

// Or later / after re-auth, adopt a key at runtime:
const { unlocked, locked } = await stack.unlockScopes(attributeKey);
```

**Labeling:** a document joins a scope with a `~scope` field; a class may set a
`defaultScope` its documents inherit (the document's own label wins). The scope
decides *under which key* the class's `encrypted: true` attributes seal.

```ts
await tasks.addCard({ title: "Q3 comp review", amount: "…", "~scope": "hr" });
```

A session whose key opens `hr` reads `amount`; one whose key does not reads it
as `null`. Writing into a scope the keyring cannot open throws
`StackLockedError` (carrying the `scopeId`); relabeling a document to a scope
its ciphertext was not sealed for throws `StackScopeMismatchError` — the write
is refused, never silently re-sealed under the weaker key. `stack.isScopeLocked(id)`
and `stack.lockedScopeIds()` report what is sealed.

## Revocation is re-keying

Revoking access rotates the scope (ADR-0030 §8: *keys move with grants, or the
grant is fiction*): the authority seals a fresh CEK under a formula the
revoked key no longer satisfies; writers re-encrypt lazily; the old CEK stays
decrypt-only until the sweep completes, then retires. A revoked member keeps
only what they could already have copied — no crypto system un-reads data, and
this page will not pretend otherwise. Attribute-level revocation (shrinking a
key rather than rotating a scope) is a recorded roadmap item.

## What it costs

Unlocking a scope costs one ABE decapsulation — **~24 ms, flat regardless of
policy complexity** — paid once per scope at open, so even dozens of scopes
unlock in under a second. The `@docstack/abe` WASM artifact is ~630 KB
(~180 KB gzipped), embedded in the bundle but instantiated lazily: a stack that
never touches scopes compiles no WebAssembly. Scope-sealed documents replicate
as stored ciphertext with zero added sync cost. The cryptography is
experimental pending audit — see the [threat model](./threat-model.md).
