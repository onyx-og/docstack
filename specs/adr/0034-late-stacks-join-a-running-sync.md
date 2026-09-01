# ADR-0034 — Late stacks join a running sync

Status: accepted · Date: 2026-09-01

Answers [0033-sync-binds-to-the-stacks-that-existed-when-it-was-called.md](0033-sync-binds-to-the-stacks-that-existed-when-it-was-called.md).

## Decision

1. **An un-scoped `sync()` is a standing instruction, not a snapshot.** `DocStack`
   keeps the options of the last `sync()` called without an explicit `stacks` list,
   and `addStack` binds every new stack to the live handle **before** resolving or
   dispatching `stack-added` — so by the time anything learns the stack exists, it is
   already replicating. Tenants get the same treatment they got at `sync()` time: the
   entitlement is derived for the new stack alone, and a stack outside the scope is
   structurally withheld, exactly as it would have been.

2. **An explicit `stacks: [...]` list keeps its meaning.** A caller who named three
   databases asked for three. Nothing is auto-bound, and the gap is visible instead
   of silent (below).

3. **`cancelSync()` also clears the standing instruction.** A stack added after it
   must not start replicating into a handle whose other members were just stopped.

4. **`removeStack` drops the stack from the handle** — cancelled and deleted — so
   `getStatus()` stops reporting a database the instance no longer holds.

5. **The gap became sayable.** `DocStackSyncHandle.names` lists what a sync covers;
   `DocStack.getSyncCoverage()` returns `{ bound, unbound }` against the open stacks.
   An idle stack and an unbound one are opposite problems, and `getStatus()` could
   not tell them apart — the unbound one simply had no key, which reads as "nothing
   to say".

6. **A bind failure is loud but not fatal.** A stack that opens fine but cannot join
   replication would recreate the silent gap if the error were swallowed, and would
   punish a healthy database if it failed `addStack`. It does neither: the failure is
   logged and dispatched as an `error` event on the sync handle.

## The finding, in one line

`sync()` read `this.stacks` once; a stack added afterwards was outside replication
for the lifetime of the handle, every status surface reported healthy, and a
consumer found it as a workspace database that had replicated nothing for two days.
The triggering shape is the one the library's own design encourages — a workspace
registry lives in one database and names the others, so mount-versus-sync ordering
is a boot-time coin toss.

## Details worth keeping

- The handle is registered, and the options with it, **before** `sync()`'s own
  binding loop runs. A stack added while that loop awaits is bound by `addStack`;
  `has()` guards on both paths keep the two from double-binding. `ClientStack.sync`
  cancels its previous handle, so even a consumer still calling `stack.sync()`
  manually after `addStack` (the old advice) replaces rather than duplicates.

- Binding happens before `stack-added` is dispatched, so event listeners see a
  covered stack — the alternative order reopens a smaller version of the same
  window.

## Verification

`packages/client/src-test/late-stack-sync.test.ts`, four cases: the finding's boot
sequence (sync first, workspace stack second, a document written to the late stack
reaches the late stack's own remote); the explicit-list semantics with the gap now
visible in `getSyncCoverage().unbound`; `cancelSync` keeping newcomers out; and
`removeStack` dropping the handle entry. All four fail against the pre-change build;
the neighbouring sync/addStack suites (16 tests) pass unchanged.

One environment note: on this machine the suite needs `--workers=1` — with
`fullyParallel` and unbounded workers, four cold Chromium starts each seeding a user
blow the fixture's 10-second init timeout. That is contention, not the change; a
single worker is how the failures were separated from the real one.
