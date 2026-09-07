---
title: "Security overview"
description: "The five properties the engine enforces on its own, how sessions are established, what leaves the device, and the limits stated plainly."
sidebar_position: 9
---

DocStack's security model is one model, enforced in one place: the engine. Access is a property of the ciphertext; what the storage holds and what the wire carries follow from that.

## Six properties

1. **Encryption happens before storage and before replication.** An attribute flagged `encrypted: true` is AES-GCM ciphertext when it reaches IndexedDB and when it reaches a remote. The document key is the application's to supply and never leaves the device. See [Encrypt fields](../guides/encrypt-fields.md).
2. **Access is by scope.** Content belongs to a scope sealed under an attribute formula; a session whose attribute key does not satisfy the formula cannot produce the plaintext, on any device, through any code path. Denial is decryption failure, not a check. The former rule-based policy engine is gone: nothing evaluates `~Policy` documents, and the seeded ones are deactivated by system patch 0.0.18. See [Access control](./access-control/index.md) and [Scope your data](../guides/access-scopes.md).
3. **Labels cannot downgrade content.** A scope-sealed payload authenticates its scope and key id into the ciphertext, and a write whose label disagrees with its payload's key is refused rather than re-sealed, so tampering with a label never turns into disclosure.
4. **Device-local documents never leave.** The system record, the encryption marker, indexes, propagation locks, sessions, the patch ledger, job runs and log records are filtered out of replication automatically. See [What stays on the device](../reference/internal-documents.md).
5. **The write path cannot be skipped.** `stack.db` refuses `new_edits: false` writes and the adapter methods beneath the plugin with `StackWriteGuardError`, because those writes skip validation, relation checks, triggers and encryption alike. Replication uses them through an internal handle that DocStack keeps for itself.
6. **Executable content is opt-in.** Triggers and jobs are JavaScript stored in documents that replicate. `new Function` is not a sandbox; the code runs with the application's authority. Unattended execution is therefore an explicit allow-list (`jobScheduler.start({ jobs })`), with `pinnedHashes` to pin the code a job is expected to have. Treat write access to class and job documents as administrative access.

## Sessions

`stack.authenticate({ username, password })` looks up the `~User` document, runs the configured authentication job (password verification and key derivation), writes a `~UserSession` document, and installs the derived key and the unwrapped document key on the stack. Sessions are documents, kept on the device that logged in; `stack.clearAuthSession()` ends one.

The server preview establishes sessions over HTTP instead: a `POST /login` that verifies credentials, writes the same `~UserSession` document, and returns a JWT as an `httpOnly` cookie, with every private route re-checking that the session is still active. That flow vouches for identity only; it carries no key material. See [Server (preview)](../reference/server.md).

## What leaves the device

Replication reads the database as stored. Flagged attributes cross as ciphertext; everything else crosses as written, so a field a remote should not see has to actually be flagged. Replication filters shape what a device bothers to carry, not what someone with access to the remote can read; partitioning belongs to the topology, a database per workspace, a Drive folder per account.

## Limits, stated plainly

- **A client-side check cannot bind the device owner.** That is why there is exactly one access-control language and it is cryptographic. What the application does with an open scope, which screens it shows, which buttons exist, is its own logic and its own responsibility.
- **Unsealed fields are visible.** Ids, `~class`, timestamps, scope labels, counts and update rhythms are plaintext at rest and in sync, necessarily. If the existence of a record is sensitive, that is a modelling problem.
- **Key handling is the application's half of the contract.** An application that stores keys beside the ciphertext has rebuilt the facade the design exists to escape.
- **Writers are not yet authenticated.** Anyone with write access can vandalise; the design guarantees vandalism never becomes disclosure. Revision signatures are on the roadmap.
- **The scope cryptography is experimental pending audit.** The primitive is rabe's AC17 on the BN254 curve compiled to WASM, about a 100-bit modern margin and unaudited; an audit gates any production claim. See the [threat model](./access-control/threat-model.md).
- **Remotes written by `@docstack/client` 0.1.8** should be treated as having held plaintext for encrypted attributes, and be re-created or purged.
