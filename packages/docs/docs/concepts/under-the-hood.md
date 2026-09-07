---
title: "Under the hood"
description: "The libraries the engine is built on, the engines and where each lives in the source, and the patterns that recur across them."
sidebar_position: 10
---

## Tech stack

| Library | Role | Why |
| :--- | :--- | :--- |
| PouchDB (`pouchdb-browser`, `pouchdb-find`, `pouchdb-selector-core`) | Storage and replication | A mature implementation of the CouchDB replication protocol with revision trees, conflict detection and a changes feed: the substrate an offline-first store needs, and a remote ecosystem to replicate against. |
| Zod 4 | Validation and type inference | A class's hydrated schema is a Zod object, so one definition validates at runtime and types at compile time. |
| jsondiffpatch | Schema evolution | A precise delta between the old and new class schema is what propagation applies to existing documents. |
| semver | Patch ordering | Consumer and system patches sort and compare by semantic version. |
| Web Crypto (`crypto.subtle`) | Encryption | Native PBKDF2 and AES-GCM: faster than a JavaScript implementation and a smaller surface for error. |
| rabe (Fraunhofer AISEC), compiled to WASM | Attribute-based encryption | The AC17 CP-ABE scheme, vendored into `@docstack/abe`, seals scope keys under attribute policies. Loaded lazily, only when a stack declares scopes. |
| Playwright | Tests | The client suite runs the compiled library in a real Chromium against real IndexedDB. |
| Rollup, tsc, Webpack | Builds | Rollup emits the client as ESM plus a UMD bundle; the React package is plain `tsc`; the workbench is Webpack. |

## The engines

| Engine | Source | Responsibility |
| :--- | :--- | :--- |
| Stack | `core/stack.ts`, `core/index.ts` | `ClientStack`: the database handle, lifecycle, patches, reads and writes, and `DocStack`, which owns several stacks. |
| Schema | `core/class.ts`, `core/attribute.ts`, `core/domain.ts`, `utils/index.ts` | Class hydration, Zod fields, domains, `applySchemaDelta`. |
| Plugin | `plugins/pouchdb.ts` | The authoring pipeline: validation, triggers, relation checks, encryption, class-model propagation, on `bulkDocs`, `get` and `bulkGet`. |
| Trigger | `core/trigger/` | Function hydration and execution. |
| Job | `core/job-engine/` | `JobEngine`, `JobScheduler`, the schedule grammar. |
| Query | `core/query-engine/` | Parser, planner, executor, accumulators. |
| Crypto | `core/crypto-engine/` | The keyring: the document key, retired keys and admitted scope keys dispatched by `kid`; canaries; AES-GCM payloads with scope binding. |
| Access scopes | `core/stack.ts` (scope registry, `unlockScopes`, `buildAccessScope`), `packages/abe` | `~AccessScope` documents, attribute-key admission, and the CP-ABE primitive (rabe's AC17 compiled to WASM) with the policy normaliser and authority helpers. |
| Transaction | `core/transaction-engine/` | Stage, overlay, sweep, commit. |
| Sync | `core/sync/` | Lifecycle, filters and their identity, internal documents, the schema gate, tenant scoping. |
| Content transfer | `core/content-transfer.ts` | `exportContent` and `importContent`. |
| Data model | `core/datamodel/` | The system patches and the ids they seed. |

The rule-based policy engine that once lived in `core/policy-engine/` is deleted: the scope model is the one access-control language, `~Policy` documents are inert legacy data, and system patch 0.0.18 deactivates the seeded ones.

## Patterns

- **ES classes with explicit engines.** `ClientStack` composes `jobEngine`, `jobScheduler`, `cryptoEngine` and `transactionEngine` as members rather than hiding them, so advanced use reaches them directly.
- **Function hydration.** Triggers and jobs are strings turned into functions with `new Function`, with `document`, `classObj`, `stack` or `stack`, `params`, `job` injected as arguments. It is stated honestly everywhere: not a sandbox, but a way to store behaviour as data.
- **Pristine capture.** The plugin receives the database's original `bulkDocs`, `get` and `bulkGet` as an argument at construction, because PouchDB installs them per instance and capturing them any other way yields nothing or recurses. The sync layer's replication handle restores them for its own reads.
- **One feed per stack.** A single `changes` feed is demultiplexed to every subscriber; building a class does not subscribe it.
- **The guarded handle.** `stack.db` is a proxy that closes the three PouchDB doors that would skip the pipeline.
- **Random ids.** `Type-<24 hex>`, minted at write time; a conflict on create throws instead of silently merging.
- **Honest reporting over assumed guarantees.** Transaction commits report the adapter's atomicity; sync reports `lastConvergedAt` rather than "last activity"; the scheduler reports why a job was skipped.

Every one of these is pinned by the Playwright suite in `packages/client/src-test/`: transactions and their overlay, crypto-aware queries, subqueries, replication filters, late-joining stacks, locked sync, patch chains and patch jobs. The reasons are recorded as [decision records](../contributing/decision-records.md).
