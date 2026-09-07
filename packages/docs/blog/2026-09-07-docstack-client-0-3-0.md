---
slug: docstack-client-0-3-0
title: "@docstack/client 0.3.0: access is a property of the ciphertext"
description: "Cryptographic access scopes replace the rule-based policy engine, with @docstack/abe carrying the CP-ABE primitive."
authors: [onyx]
tags: [release, client]
date: 2026-09-07
draft: true
---

`@docstack/client` 0.3.0 makes access control cryptographic. Content belongs to a **scope** whose content key is sealed under an **attribute policy**, and a session's attribute key either satisfies the formula, opening the scope, or does not, in which case the same ciphertext reads `null`. Denial is decryption failure, not a check, so it binds the device owner too. The JavaScript-rule policy engine is gone, and a new package, `@docstack/abe`, carries the primitive.

<!-- truncate -->

## Access scopes

A scope is an `~AccessScope` document: a 32-byte content key sealed with CP-ABE (the AC17 scheme, rabe compiled to WASM) under a monotone formula such as `("role:manager" and "dept:sales") or "clearance:secret"`, plus the key's id and a per-scope canary. The authority half, `setup`, `keygen` and `wrapCek` from `@docstack/abe`, runs wherever the application controls it; `ClientStack.buildAccessScope` assembles the document, and an application patch ships it to every device.

A device supplies its attribute key through the new `accessKeys` option at open, or later through `stack.unlockScopes(key)`, which attempts every declared scope and admits only content keys that match the scope's key id and open its canary. Documents join a scope with a `~scope` label or inherit their class's `defaultScope`; the scope decides under which key a document's `encrypted: true` attributes seal, and the schema still decides which attributes. `isScopeLocked`, `lockedScopeIds` and the `scopeUnlocked` event report the per-scope state.

The crypto engine's single document key became a keyring dispatched by key id: the document key, retired keys, and admitted scope keys in read-write or read-only mode, which is what makes rotation lazy and revocation a new scope version. Every scope-sealed payload is bound to its label as AES-GCM additional data, and a write whose label disagrees with its payload's key is refused with `StackScopeMismatchError` rather than re-sealed, closing the induced-downgrade attack a tampered label is fishing for. Writing into a sealed scope throws `StackLockedError` with `scopeId` set; a patch that touches a sealed scope defers until the scope opens.

The guide is [Scope your data](/docs/guides/access-scopes); the model and its limits are in [Access control](/docs/concepts/access-control/). The reasoning is [ADR-0045](https://github.com/onyx-og/docstack/blob/main/specs/adr/0045-access-control-is-cryptographic-cp-abe-scopes-beside-the-engine.md).

## The policy engine is removed

Client-side rule evaluation could never bind the holder of the device, so DocStack no longer presents it as access control. The five enforcement call sites, the per-class default-policy seeder and the pre-authentication throw are gone; system patch `~sys-0.0.18` deactivates the three seeded `~Policy` documents, and the class stays inert for legacy data. Losing read access now seals encrypted fields to `null` instead of throwing. Behavioural rules move to application code; conditional access, "published means public", is write-time scope labeling.

## Upgrading

```bash
npm install @docstack/client@0.3.0 pouchdb-browser pouchdb-find
```

`@docstack/abe` is installed as a dependency and loaded lazily, only when a stack declares scopes. Applications that wrote `~Policy` documents keep them as inert data; nothing reads them. `@docstack/react` 0.1.2 updates its dependency range to this release and is otherwise unchanged.

The cryptography is experimental pending audit: rabe's BN254 backend carries roughly a 100-bit modern margin, and an audit gates any production claim. The [threat model](/docs/concepts/access-control/threat-model) states what is guaranteed, to whom, and what is not.
