---
title: "Decision records"
description: "Every architecture decision record in specs/adr, with its status, date and a one-line summary, plus the specs that accompany them."
sidebar_position: 4
---

Non-trivial changes to DocStack are recorded as architecture decision records in [`specs/adr/`](https://github.com/onyx-og/docstack/tree/main/specs/adr). Some are decisions; some are findings dispatched from applications built on DocStack, kept because the fix they led to is only legible next to the failure. The numbering is sparse on purpose: 0001 and 0002 are DocStack's own first records, and 0003 through 0017 were never in this repository.

| # | Title | Status | Date | In one line |
| :--- | :--- | :--- | :--- | :--- |
| [0001](https://github.com/onyx-og/docstack/blob/main/specs/adr/0001-transport-agnostic-sync.md) | Sync belongs to DocStack, transports do not | accepted | 2026-08-24 | `remote` is any PouchDB database; DocStack owns the lifecycle, filters and the schema gate, and never takes a transport dependency. |
| [0002](https://github.com/onyx-og/docstack/blob/main/specs/adr/0002-guarded-database-handle.md) | `stack.db` is a guarded handle | accepted | 2026-08-24 | Writes that skip the authoring path throw `StackWriteGuardError`; replication uses an internal handle. |
| [0018](https://github.com/onyx-og/docstack/blob/main/specs/adr/0018-docstack-document-key-lifecycle.md) | The document key lifecycle | finding, accepted | 2026-08-24 | DocStack never invents document keys; a keyless stack opens locked; the canary is the admission test. |
| [0019](https://github.com/onyx-og/docstack/blob/main/specs/adr/0019-stackplugin-pristine-capture.md) | `StackPlugin` pristine capture | finding, fixed | 2026-08 | PouchDB installs core methods per instance; the plugin receives the originals as an argument. |
| [0020](https://github.com/onyx-og/docstack/blob/main/specs/adr/0020-change-events-carry-ciphertext.md) | Change events carry ciphertext | finding, fixed | 2026-08 | Live subscriptions decrypt before delivery; ciphertext belongs to replication, never to a read. |
| [0021](https://github.com/onyx-og/docstack/blob/main/specs/adr/0021-one-changes-feed-per-stack.md) | One changes feed per stack | accepted | 2026-08-25 | Subscribers demultiplex one feed; building a class does not subscribe it. |
| [0022](https://github.com/onyx-og/docstack/blob/main/specs/adr/0022-react-0.0.9.md) | Findings: `@docstack/react` 0.0.9 | findings, addressed | 2026-08-26 | The provider raced itself under double effects; hooks reported "loaded" during startup. |
| [0023](https://github.com/onyx-og/docstack/blob/main/specs/adr/0023-client-0.1.6.md) | Findings: `@docstack/client` 0.1.6 | findings, fixed | 2026-08-26 | Sequential ids lost writes under replication; log records and internal documents leaked to the remote. |
| [0024](https://github.com/onyx-og/docstack/blob/main/specs/adr/0024-identifiers-and-what-replicates.md) | Random document ids, and replicating only what binds two instances | accepted | 2026-08-26 | Ids are `Type-<24 hex>`; what replicates is what the peer cannot already derive. |
| [0025](https://github.com/onyx-og/docstack/blob/main/specs/adr/0025-live-usequerysql.md) | Proposal: make `useQuerySQL` live | proposal, implemented | 2026-08-26 | Subscriptions derived from the query's AST. |
| [0026](https://github.com/onyx-og/docstack/blob/main/specs/adr/0026-live-queries-and-subqueries.md) | Live SQL views, and the subquery paths that never ran | accepted | 2026-08-26 | `useQuerySQL` is live by default; `IN`, `NOT IN` and `EXISTS` subqueries fixed and pinned. |
| [0027](https://github.com/onyx-og/docstack/blob/main/specs/adr/0027-log-records-recognised-by-shape.md) | Log records recognised by shape | accepted | 2026-08-26 | Pre-existing bare log records stay local; the default sink level drops to `warn`. |
| [0028](https://github.com/onyx-og/docstack/blob/main/specs/adr/0028-ephemeral-and-simple-classes.md) | Ephemeral and simple classes | accepted | 2026-08-26 | Two class flags: purged on open and never replicated; stored as given with no pipeline. |
| [0029](https://github.com/onyx-og/docstack/blob/main/specs/adr/0029-hub-support.md) | Proposal: hub architecture support | proposal, dispatched | 2026-08-28 | Cross-origin convergence and tenancy declared on the model. |
| [0030](https://github.com/onyx-og/docstack/blob/main/specs/adr/0030-channel-is-an-adapter-tenant-is-a-stack.md) | The channel is an adapter, a tenant is a stack | accepted | 2026-08-28 | Topology is configuration; a tenant is its own database; keys move with grants or the grant is fiction. |
| [0031](https://github.com/onyx-og/docstack/blob/main/specs/adr/0031-scheduling-jobs-on-a-client.md) | Scheduling jobs on a client | accepted | 2026-08-28 | An allow-listed scheduler the application starts; missed occurrences collapse; cron refused. |
| [0032](https://github.com/onyx-og/docstack/blob/main/specs/adr/0032-reads-decrypt-policies-arm-on-active.md) | Reads decrypt again, and a policy arms on `active: true` | accepted | 2026-09-01 | The decrypting `get` override restored; the legacy rule engine's `active` contract confirmed. |
| [0033](https://github.com/onyx-og/docstack/blob/main/specs/adr/0033-sync-binds-to-the-stacks-that-existed-when-it-was-called.md) | `DocStack.sync()` binds to the stacks that existed when it was called | finding, fixed | 2026-09-01 | A workspace mounted after `sync()` replicated nothing while every status read healthy. |
| [0034](https://github.com/onyx-og/docstack/blob/main/specs/adr/0034-late-stacks-join-a-running-sync.md) | Late stacks join a running sync | accepted | 2026-09-01 | An un-scoped `sync()` is a standing instruction; `getSyncCoverage()` tells idle from unbound. |
| [0035](https://github.com/onyx-og/docstack/blob/main/specs/adr/0035-react-usefind-never-applies-an-empty-result.md) | `useFind` never applies an empty result | finding, fixed in react 0.1.1 | 2026-09-01 | A list could never lose its last row; staleness is now owned by a run counter. |
| [0036](https://github.com/onyx-og/docstack/blob/main/specs/adr/0036-applyschemadelta-applies-one-attribute.md) | `applySchemaDelta` applies one attribute | finding, fixed | 2026-09-03 | Propagation returned from inside its loop and skipped in-place edits. |
| [0037](https://github.com/onyx-og/docstack/blob/main/specs/adr/0037-class-patches-should-merge-not-replace.md) | A class patch should say what changed | proposal, accepted in property | 2026-09-03 | Restating a class dropped whatever the restatement forgot. |
| [0038](https://github.com/onyx-og/docstack/blob/main/specs/adr/0038-a-class-patch-merges-schema-null-drops-an-attribute.md) | A class patch merges its schema, and `null` drops an attribute | accepted | 2026-09-03 | Every delta entry applies; schemas merge attribute by attribute. |
| [0039](https://github.com/onyx-og/docstack/blob/main/specs/adr/0039-transactions-stage-above-the-plugin-and-commit-through-it.md) | Transactions stage above the plugin and commit through it | accepted | 2026-09-03 | Named write transactions with overlay reads and reported atomicity. |
| [0040](https://github.com/onyx-og/docstack/blob/main/specs/adr/0040-sync-while-locked-junction-hazards.md) | Sync on a locked stack: three junctions | finding, resolved | 2026-09-03 | The consumer schema gate; locked deferral of class patches; revision-addressed reads serve the stored form. |
| [0041](https://github.com/onyx-og/docstack/blob/main/specs/adr/0041-the-patch-ledger-arms-on-active.md) | The patch ledger arms on `active` | accepted | 2026-09-03 | A ledger entry records success, deferral or a legacy application; failures retry. |
| [0042](https://github.com/onyx-og/docstack/blob/main/specs/adr/0042-a-patch-chain-applies-through-one-internal-transaction.md) | A patch chain applies through one internal transaction | accepted, implemented | 2026-09-03 | Chains compose in memory and land as one batch; all-or-nothing. |
| [0043](https://github.com/onyx-og/docstack/blob/main/specs/adr/0043-bulkdocs-class-resolution-ignores-the-batch.md) | `bulkDocs` class resolution ignores the batch | finding, fixed | 2026-09-04 | A patch can introduce a class and seed its first document in one batch. |
| [0044](https://github.com/onyx-og/docstack/blob/main/specs/adr/0044-a-patch-carries-one-shot-jobs.md) | A patch carries one-shot jobs | accepted, implemented | 2026-09-04 | `preApply` and `postApply` migration jobs, staged with the model. |
| [0045](https://github.com/onyx-og/docstack/blob/main/specs/adr/0045-access-control-is-cryptographic-cp-abe-scopes-beside-the-engine.md) | Access control is cryptographic: CP-ABE scopes beside the engine | accepted, implemented 2026-09-06 | 2026-09-04 | One access-control language, enforced by decryption; the rule engine is removed, `@docstack/abe` carries the primitive. |

## Specs

- [`specs/01-sync.md`](https://github.com/onyx-og/docstack/blob/main/specs/01-sync.md): the replication lifecycle, filters and their identity, the schema gate, the adapter contract.
- [`specs/02-crypto-access.md`](https://github.com/onyx-og/docstack/blob/main/specs/02-crypto-access.md): the cryptographic access architecture in full and the integration checklist for the cycle that builds it.
- [`specs/pouchdb-adapter-tauri-sqlite.md`](https://github.com/onyx-og/docstack/blob/main/specs/pouchdb-adapter-tauri-sqlite.md): the brief for an in-repo storage adapter that is not yet published.

## Reading them

An ADR states a decision, the reasoning, and the consequences, and names the tests that pin it. When a page on this site makes a claim about behaviour, the ADR it links is where the claim is argued. If you change code that an ADR describes, update or supersede the ADR in the same change.
