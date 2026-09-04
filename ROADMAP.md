# Roadmap

Standing work the ADRs have accepted or flagged but that is not yet implemented.
Each entry points at the decision record that owns the details; this file is the
index, not the design.

## Under evaluation

### Datamodel-hash gate for replication between divergent clients

**The gap.** Since ADR-0040 the sync gate compares system *and* consumer patch
versions, and a trailing device refuses in every direction - but the gate only sees
what patches declare. A consumer that changes the datamodel **by hand or at
runtime** (`Class.create`, `addAttribute`, direct class-doc writes) bumps no
version: two clients whose models have drifted that way replicate freely today,
with the usual costs of shape skew (documents one side's schema cannot describe,
`importContent` stripping, reader confusion - the propagation side is largely
defused by ADR-0038/0040).

**The idea.** A canonical hash of the datamodel, published on the sync marker
(`SYNC_META_DOC_ID`, which already lives *in* the remote - for the GDrive adapter
that means in the Drive folder itself, so the rendezvous exists) and compared at
`start()` alongside the version gate.

**The scenario that matters first** (maintainer's operational experience): the
GDrive-adapter topology, where the remote is a **passive node** - a folder that
never writes itself, only gets pushed to and pulled from - and the interest is
keeping two or more *active* clients at different datamodels from replicating
through it. Enforcement is client-side by construction (a client can already pass
`checkSchemaVersion: false`); that is the same trust model the version gate has,
and it is acceptable for a rendezvous with no server.

**Difficulties, honestly:**

1. **Hashes do not order.** Semver says who is *behind*; a hash only says
   *different*. On mismatch there is no "trailing device refuses, current device
   proceeds" - the policy is symmetric refusal or a warning. The workable rule is
   to pair the gates: **compare hashes only at equal consumer versions** (same
   declared schema but different actual shape = drift alarm, the by-hand case,
   actionable); at different versions the semver gate already answers, and a hash
   mismatch there is *expected* mid-rollout and must not double-refuse.
2. **Canonicalization.** Deterministic serialization (sorted keys) over the parts
   of a class model that are semantic - attribute names, types, configs - while
   excluding `_rev`, timestamps, and deciding about descriptions. Cosmetic drift
   causing hard refusals would be a footgun worse than the gap.
3. **Runtime-created classes are legitimate.** `Class.create` is public API; two
   clients may legitimately hold different class *sets*. Whole-model hash equality
   is therefore the wrong invariant: the comparable unit is **per-class hashes over
   the intersection of replicated classes** (which also composes with tenant/class
   scoping, ADR-0030 - a channel replicating a subset should gate on that subset),
   with a rollup for the cheap equal-case check.
4. **Marker semantics with many writers.** The version fields on the marker are
   monotonic per field; hashes have no order, so the marker would carry the hash of
   the highest-version writer (or a per-class map), last-writer-wins within a
   version. Needs care, not novelty.

**Verdict for now:** real gap, medium effort, and the design hinges on decisions
(1) and (3). Not scheduled; recorded so the flow is not lost.

## Deferred, owned by existing ADRs

- **Transaction engine v2** (ADR-0039 consequences; ADR-0042 last section): the
  transaction-scoped pipeline facade - triggers reading the tx view at commit,
  public class-model staging with propagation recomputed at commit, streaming
  (`findDocumentsIterator`) overlay, `allDocs` overlay, class-level sugar.
- **Native bridge atomic batch** (ADR-0039 adapter table): `bulkWrite` is one round
  trip but per-op optimistic; true `atomicBatch` needs a Kotlin-side contract
  change in docstack-store.
- **Operational note from 0.2.0** (CHANGELOG Security): remotes written by client
  0.1.8 should be treated as having held plaintext for encrypted attributes and be
  re-created or purged.

## Older flags, still unactioned

- Class/domain name-collision ids (ADR-0021 discussion).
- `IN (SELECT …)` inside `HAVING` throws in the query engine.
- `lastDocId` counter is vestigial cost since random ids (ADR-0023): retained only
  for uniqueness bookkeeping; candidate for retirement.
