# ADR-0041 — The patch ledger arms on `active`

Status: accepted · Date: 2026-09-03

Follows the ledger-dedupe finding in ADR-0040's resolution. The first fix read the
flagless ledger raw; this ADR replaces "flagless" with a contract, decided by the
maintainer: the `active` flag on a ledger entry carries the ledger's own meaning.

## Decision

A patch's ledger document is the record of its relationship to this device:

- **`active: true` — applied.** Written at the moment of *successful* application:
  `applyPatch` records the entry only after the document batch has landed. A failing
  batch throws with no ledger write, so the next open retries the patch (idempotent
  under ADR-0038's merge semantics).
- **`active: false` — deferred.** A patch held back behind the document key
  (ADR-0040 junction 3) is persisted as a dormant entry when the deferral happens.
  The successful replay at unlock **arms the same entry in place** - no duplicate
  record. A dormant entry does not satisfy the open-time dedupe (the patch is
  re-attempted, and re-defers without duplicating while still locked), and
  `getConsumerSchemaVersion` does not count it - a deferred device is *behind* at
  the sync gate, which is junction 1 working as intended.
- **absent — legacy applied.** Entries written before the flag (including the
  duplicates the broken dedupe accumulated) are treated as applied, which preserves
  their meaning at the time they were written.

The ledger is still read raw (`db.find`, not `findDocuments`): `active` here is not
the document-visibility convention but the ledger's own state machine, and the
visibility filter would hide exactly the legacy entries the contract grandfathers.

## What this fixed beyond the flag

The old `applyPatch` had a `.catch` that called `reject` and then **kept executing**:
the ledger entry was posted and the promise resolved even when the batch had failed.
A patch refused by validation - say ADR-0038's mandatory-tightening refusal - was
recorded as applied and never retried; the device's schema trailed permanently while
everything reported success. Recording only on success closes that.

**Ordering under failure** (raised while deciding this): a patch that depends on a
failed predecessor can never run against its absence. The application loop has no
per-patch catch, so the first failure aborts the run - dependents are not attempted -
and on the next open the dedupe retries the failed patch *first*, in configured
order. The old flow inverted this into the worst case: the failed patch was recorded
as applied, so the next open skipped it and ran its dependents against the schema it
never installed. And because per-document failures arrive in bulkDocs' *resolved*
array, `applyPatch` now checks them too (the ADR-0038 discipline): a half-landed
batch throws and records nothing, rather than arming a patch it never finished.

## Deliberately not done (yet): patches through the transaction engine

> Superseded by ADR-0042, which records the accepted protocol: the framing below
> treats atomic propagation as the requirement, and it is not - the transaction's
> job in patch application is chain-coherent staging and error attribution, with
> propagation left in the commit's normal flow. Kept as written for the history.

Full atomicity for a patch application - all documents land or none, including
propagation's rewrites - is what the transaction engine (ADR-0039) provides, and an
internal, config-independent transaction for `applyPatch` is easy to mint. It is
blocked on one thing: v1 transactions refuse class-model documents, precisely
because schema propagation runs mid-pipeline and cannot be staged or rolled back -
and class models are what patches mostly carry. Routing `applyPatch` through a
forced-enabled internal transaction is recorded as the intended v2 step, gated on
the transaction-scoped pipeline facade sketched in ADR-0039's consequences. Until
then the atomicity story for patches is ADR-0038's: the validation sweep precedes
the single batch write, and the ledger no longer lies about failure.

Pinned by `stack-patches.test.ts` (armed on application; failed application records
nothing and the corrected patch retries; reopen applies nothing twice) and
`locked-sync.test.ts` (dormant entry at deferral, armed in place after the unlock
replay; the sync gate refuses a device whose only record of a version is dormant).
