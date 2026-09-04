# ADR-0042 — A patch chain applies through one internal transaction

Status: accepted, implemented · Date: 2026-09-03 (implemented 2026-09-04)

Pinned by `src-test/patch-chain.test.ts`: a two-patch chain composes through the
overlay and lands as ONE class-doc write (first stored revision carries the full
chain, both ledger entries armed together), and a dry-run refusal names the patch
and the class, persists nothing, and records nothing. The mixed extension (§below)
adds two: a later patch's invalid seed refuses the whole chain, the earlier
patch's class and data included; and one patch carrying a tighten, the
`_rev: "auto"` data update that satisfies it, and a fresh seed lands in one commit
with the committed document written exactly once. The deferral-in-chain and
armed-in-place behaviors ride the existing `locked-sync.test.ts` pins. One
implementation note beyond the protocol: the dry-run reads documents raw (with an
explicit decrypt when a key is present) rather than through the policy-checked read
path - patches apply during `create()`, before any session exists.

Supersedes the "deliberately not done (yet)" section of ADR-0041, whose framing was
wrong in a way worth recording: it treated *atomic propagation* as the requirement
and concluded the transaction engine could not carry patches until a v2 pipeline
facade existed. The maintainer's protocol drops that requirement. The transaction's
job in patch application is **chain-coherent staging and error attribution**;
propagation deliberately stays in the normal flow, inside the commit's own pipeline
call. With that scope, nothing blocks it today.

## The protocol

Scope: every consumer patch. The protocol was first shipped for class-model-only
chains with a sequential fallback for the rest; the mixed extension (2026-09-04,
§Recorded extensions) removed the fork, so class models, data documents, and any
mix of them stage through the same one transaction.

1. **Open one internal transaction for the pending chain.**
   `TransactionEngine.beginInternal()`: bypasses the `transactions: true` config
   gate (patch application is DocStack's own machinery, not a consumer feature) and
   lifts the class-model refusal **for internal handles only** - the public refusal
   (ADR-0039 §6) stands, because a public transaction promises zero side effects
   beyond its batch and a class commit's propagation is exactly such a side effect.
   The internal transaction never claims propagation atomicity; it claims staged
   validation and a single class-write batch.

2. **Stage the chain, hydrating through the overlay.** For each pending patch, in
   configured order: the ADR-0040 deferral barrier runs first, unchanged (a locked
   stack defers from the first key-needing patch, dormant ledger entries and all);
   then the patch's class docs hydrate reading through `t.db` - so **patch N+1 sees
   the class as patch N staged it**, and the ADR-0038 merge (attribute-wise, `null`
   drops) composes across the whole chain in memory before anything is real.

3. **Validate propagation, keep nothing.** For each staged class: diff the staged
   model against its *committed* predecessor, run `applySchemaDelta` over the
   committed documents of the class, and discard the results - the point is the
   refusal, not the rewrite. (The protocol as first sketched staged these rewrites
   into a second transaction and discarded it at commit; never creating it is the
   linear form of the same decision. The computed set can ride the error report for
   diagnostics.) A document that cannot satisfy the new model fails HERE, before
   the first write, naming the patch version, document and attribute.

4. **One commit at the end of the chain** (the maintainer's 6a/6b loop): all class
   docs land as one batch through the **unchanged pipeline** - the plugin's class
   branch runs real propagation per class doc, exactly as a direct write would, and
   a propagation failure fails the commit. No suppression flag, no second door.
   Only after the commit resolves are the chain's ledger entries armed
   (ADR-0041), all of them; a failed commit records nothing and the whole chain
   retries next open, in order.

## Fault taxonomy (the troubleshooting UX this buys)

- **Failure while staging or in the dry-run** → patch fault or database-init-state
  fault. Zero persisted, error names patch/document/attribute. This is where
  everything knowable in advance is caught - the sweep-is-the-atomicity-boundary
  discipline of ADR-0038, applied to the whole chain at once.
- **Failure at commit** → environment fault: a concurrent write between dry-run and
  commit, a per-document conflict. Nothing recorded (ADR-0041), retry converges.
- **Residue**: a commit failing *between* two class docs' pipeline processing
  leaves the first class's propagation rewrites standing - fail-forward, identical
  to today's baseline and idempotent on retry (ADR-0038). The protocol does not
  make this worse; it makes it rare, by refusing everything refusable beforehand.

## Recorded extensions

- **Mixed patches** (class + data docs): **landed 2026-09-04, by deletion.** This
  section originally recorded two requirements; building ADR-0043 and ADR-0044
  satisfied both as side effects, and the extension reduced to removing the
  dispatcher's class-only fork and retiring the sequential path entirely.
  - *"The sweep resolves class snapshots through the overlay"* - `classFromStage`
    landed with ADR-0044 (a job creates docs of a class an earlier patch staged);
    the sweep already judged every data doc stage-first.
  - *"Class-before-data ordering in the commit batch"* - obsoleted by ADR-0043:
    the pipeline's batch-mate class resolution and propagation's superseded-set
    both scan the whole batch, so ordering within it is immaterial.
  - `stagePatch` never filtered doc kinds - it stages the whole `docs` array with
    `_rev: "auto"` hydration through the overlay, matching `applyPatch` semantics.

  What routing everything through the chain *changes*, deliberately:
  - **Data-only chains gain all-or-nothing.** The sequential path committed and
    armed per patch, so a chain could half-apply - patch 1 armed, patch 2 failed.
    Now nothing lands and nothing arms unless the whole chain does, which is the
    fault taxonomy above applied uniformly (and the honest answer to "what if a
    patch requires things applied by a prior patch that failed?").
  - **The sweep's refusals now apply to consumer data docs**: `_local/` and
    `_design/` ids and nested `~class: "patch"` documents refuse loudly where the
    sequential path stored them silently. Patches were never a sanctioned door
    for device state, index machinery, or hand-seeded ledger entries.
  - The ADR-0044 job scope guard ("job-carrying patches must be class-model-only")
    is gone - a patch can carry its model, its seeds, and its jobs at once. A
    pre-apply job still cannot touch the class its own patch introduces (it runs
    before that patch stages, by definition of *pre*); seeds and post-apply jobs
    can.
  - `applyPatch` (public, direct) and the `~sys` path are untouched - one patch,
    one batch, the bootstrap `isPatch` locked-write exemption intact. The chain
    never passes `isPatch: true`: the deferral barrier is its stronger answer to
    the same locked-encryption question.
- **Data-only patches**: carried by the chain like everything else (see above;
  originally "nothing to do - v1 transactions carry them as-is").

## What replaces ADR-0041's deferral

ADR-0041 gated this on "the transaction-scoped pipeline facade sketched in
ADR-0039" - which is still the path to *public* class-model transactions and full
propagation atomicity, and remains future work. Patch application needs neither.
