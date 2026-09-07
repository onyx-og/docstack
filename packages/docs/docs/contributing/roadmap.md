---
title: "Roadmap"
description: "Work the decision records have accepted or flagged but that is not yet built, in order, with what was deliberately dropped and what is only under evaluation."
sidebar_position: 5
---

Standing work the ADRs have accepted or flagged but that is not yet implemented. Each entry points at the record that owns the details; this page is the index, not the design. It mirrors the repository's [`ROADMAP.md`](https://github.com/onyx-og/docstack/blob/main/ROADMAP.md).

## Cryptographic access

The integration landed on 2026-09-06 ([ADR-0045](https://github.com/onyx-og/docstack/blob/main/specs/adr/0045-access-control-is-cryptographic-cp-abe-scopes-beside-the-engine.md), [`specs/02-crypto-access.md`](https://github.com/onyx-og/docstack/blob/main/specs/02-crypto-access.md)): `@docstack/abe` with rabe's AC17 compiled to WASM and the policy normaliser, the crypto-engine keyring with per-scope canary admission and label binding, `~AccessScope` documents and system patch 0.0.18, the `accessKeys` contract with `unlockScopes`, per-scope partial locks and patch deferral, the mismatch guard, and the removal of the rule-based policy engine. The TypeScript implementation from the spike stays under `spikes/abe` as the behavioural cross-check. See [Scope your data](../guides/access-scopes.md).

Still open on the track:

1. **Authority tooling as its own package.** `@docstack/abe` carries the authority helpers (`setup`, `keygen`, `wrapCek`) today; splitting the authority-only surface into a package the consumer's controlled environment runs, later the server package, keeps master-key code out of every client dependency graph.
2. **Deferred within the track:** per-document policy strings; attribute-level revocation (attribute versioning, the scheme's known weak point); scope-aware channel grants; writer authentication through revision signatures (label tampering is contained, never disclosed, but not prevented without them); and a **security audit before any production claim**. The WASM backend, rabe on BN254 at roughly a 100-bit modern margin, is unaudited by construction, and the audit reopens the curve-margin question the gate deferred.

## Dropped: client-side rule enforcement

A client-side enforcement design for the former rule engine (an opt-in flag, a rule-aware handle, an admin bucket, an `operations` field) was written and then dropped, not parked: a client-side gate cannot bind the device owner, and DocStack keeps one access language. The analysis stays in ADR-0045 as documentation of the engine that was removed. Three findings from it remain live concerns on their own: the React changes-feed splice bypassing the read path's filtering, `~Job` content executing against the real stack, and `setAuthSession` being public.

## Under evaluation

**A data-model hash gate for replication between divergent clients.** The sync gate compares system and consumer patch versions, but it only sees what patches declare. A model changed by hand or at runtime (`Class.create`, `addAttribute`, a direct class-document write) bumps no version, so two clients that drifted that way replicate freely. The idea is a canonical hash of the model, published on the sync marker and compared at start. The difficulties are recorded honestly: hashes do not order, so they can only be compared at equal versions; canonicalisation must ignore cosmetic drift; runtime-created classes are legitimate, so the comparable unit is per-class hashes over the intersection of replicated classes; and the marker's semantics with many writers need care. Verdict: a real gap, medium effort, not scheduled.

## Deferred, owned by existing ADRs

- **Transaction engine v2** ([ADR-0039](https://github.com/onyx-og/docstack/blob/main/specs/adr/0039-transactions-stage-above-the-plugin-and-commit-through-it.md), [ADR-0042](https://github.com/onyx-og/docstack/blob/main/specs/adr/0042-a-patch-chain-applies-through-one-internal-transaction.md)): a transaction-scoped pipeline facade so triggers read the transaction's view at commit; public class-model staging with propagation recomputed at commit; overlay support for `findDocumentsIterator` and `allDocs`; class-level sugar.
- **Operational note from 0.2.0.** Remotes written by `@docstack/client` 0.1.8 should be treated as having held plaintext for encrypted attributes and be re-created or purged.

## Older flags, still unactioned

- Class and domain name-collision ids ([ADR-0021](https://github.com/onyx-og/docstack/blob/main/specs/adr/0021-one-changes-feed-per-stack.md)).
- `IN (SELECT …)` inside `HAVING` throws in the query engine.
- The `lastDocId` counter is vestigial since ids became random ([ADR-0024](https://github.com/onyx-og/docstack/blob/main/specs/adr/0024-identifiers-and-what-replicates.md)); a candidate for retirement.
