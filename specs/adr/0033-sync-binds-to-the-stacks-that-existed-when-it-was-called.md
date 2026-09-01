# Finding — `DocStack.sync()` binds to the stacks that existed when it was called

**Status: fixed - see [ADR-0034](0034-late-stacks-join-a-running-sync.md).**

**For dispatch to the DocStack repository.** Found in a consumer against
`@docstack/client` while investigating a workspace database that had replicated nothing
for two days while the root database replicated normally, over the same connection, with
the same credentials, reporting "connected" throughout.

**A stack added after `sync()` is never replicated, and nothing says so.** No error, no
event, no state. The consumer's status surfaces all report the handle, and the handle is
healthy — it simply has no entry for that stack.

---

## Cause

`core/index.ts`:

```ts
public sync = async (options: DocStackSyncOptions): Promise<DocStackSyncHandle> => {
    const { stacks: names, tenants, ...stackOptions } = options;
    let targets = names ? names.map(…) : this.stacks;      // ← read once
    …
    const handle = new DocStackSyncHandle();
    for (const stack of targets) {
        handle.add(stack.name, await stack.sync(…));
    }
    this.syncHandle = handle;
    return handle;
}
```

`this.stacks` is read once. The handle is built from that snapshot and then fixed: nothing
watches for a stack being added, and `syncHandle` is not consulted when one is. A database
mounted a second later is outside replication for the lifetime of that handle.

## Why it is invisible

Every signal a consumer has says the connection is fine, and each is telling the truth
about the wrong thing:

| Signal | What it reports |
| --- | --- |
| `sync()` resolves | The stacks it *did* bind started |
| `getStatus()` | `Record<string, SyncStatus>` — the missing stack has no key, which reads as "nothing to say" rather than "not covered" |
| `getLastConvergedAt()` | The oldest convergence **among bound stacks**; an unbound one cannot hold it back |

So the failure presents as data that quietly does not travel. In our case: the root
database wrote to Drive on the same minute the workspace's sync metadata was last touched,
while the workspace had pushed nothing for two days.

## Why a consumer hits this normally, not exceptionally

The shape that triggers it is not exotic — it is the one the library's own design
encourages. **A workspace registry lives in one database and names the others.** So:

1. The root stack mounts, because it is known from configuration.
2. The provider becomes ready and the application starts replication.
3. The registry is read; the workspace stacks it names are added.
4. Steps 2 and 3 are ordered by whichever finishes first.

Anything that delays step 2 relative to step 3 hides the bug; anything that delays 3 —
a slower disk, a colder cache, a network round trip in the connect path (ours awaits a key
grant from an escrow service) — exposes it. That is a boot-order coin toss deciding whether
a person's work replicates, which is why it looks intermittent and why a reload "fixes" it.

## Suggested fix

The handle is already the right shape: `DocStackSyncHandle.add(name, handle)` is public and
keyed by name, and `getStatus()` merges per stack. What is missing is the subscription.

```ts
// Keep what sync() was asked for, and apply it to stacks that arrive later.
private syncOptions: DocStackSyncOptions | null = null;

public sync = async (options) => {
    this.syncOptions = options;
    …
};

// Wherever a stack is added:
if (this.syncHandle && this.syncOptions && !this.syncOptions.stacks) {
    this.syncHandle.add(stack.name, await stack.sync(stackOptionsFor(stack)));
}
```

An explicit `stacks: [...]` list should keep the current semantics — a caller who named
three databases asked for three — which is also the distinction that makes the default path
worth changing: **`sync()` with an explicit list throws for a name it cannot find, and the
default path silently covers whatever happened to exist.** The two paths disagree about how
much they care, and the stricter one is the one nobody uses.

Two smaller things worth having either way:

1. **`getStatus()` should be able to say "not covered".** A consumer cannot currently tell
   an idle stack from an unbound one, and those are opposite problems.
2. **`sync()` could return the names it bound**, so a consumer can compare that against the
   stacks it expects and report a gap rather than discovering it in a Drive folder.

## What the consumer did meanwhile

Confirmed with the dev-only handle the app already exposes:

```js
Object.keys(__driveSync.getStatus())
// ["tokido"]                          ← the workspace never bound
// ["tokido", "tokido-ws-personal"]    ← healthy
```

The app-side remedy is to re-establish replication when the set of open stacks changes,
rather than only when the connection does.
