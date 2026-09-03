# Finding — `useFind` never applies an empty result, so a list cannot become empty

Status: fixed in `@docstack/react` 0.1.1 · Date: 2026-09-01

**For dispatch to the DocStack repository** (`packages/react`). Found in a consumer where
deleting the last task shown in a day left it on screen, clickable but pointing at nothing,
until the view was navigated away from and back.

**A `useFind` list can gain and change rows but can never lose its last one.** The stale
rows are not decoration: they resolve to documents that no longer exist, so acting on one
opens a panel for a task that is gone.

---

## Cause

`packages/react/src/hooks/index.ts`:

```ts
const runQuery = async () => {
    try {
        const stackInstance = docStack.getStack(stack);
        if (stackInstance) {
            const initialDocs = await stackInstance.findDocuments(query.selector, query.fields);
            if (initialDocs.docs.length) {          // ← here
                let docs = initialDocs.docs as Document[];
                setDocs(docs);
            }
        }
    } catch (err: any) {
        setError(err);
    } finally {
        setLoading(false);
    }
};
```

`runQuery` is both the initial read and the re-run debounced behind the class subscription,
so the guard applies to every update. A query whose result becomes empty leaves the last
non-empty result in state, permanently — there is no later event that can clear it, because
the only thing that would is another empty result.

It is the same mistake ADR-0022 records two lines above it, in the other direction. That
note explains why `setLoading(false)` on a missing provider was wrong: it reported *loaded,
and empty* when the truth was *not read yet*. This is the mirror image — reporting the last
non-empty answer when the truth is *read, and empty* — and the comment sits directly above
the line that makes it.

## Why it is hard to attribute

The consumer's symptom was a deleted task that stayed in a list and vanished on the next
navigation. Everything about that points at a missing refresh:

- The delete had written, and replicated: the other device lost the task immediately.
- Re-entering the view fixed it — because a remount starts `docs` at `[]`, the query
  returns `[]`, `setDocs` is skipped, and the already-empty state happens to be correct.
- It was intermittent by view: deleting one row of several works, because that result is
  not empty. **Only the last row of a window is affected**, which is a day in our case and
  therefore common.

We spent time on replication before looking here, because "the write landed and the list
did not update" is a sync-shaped sentence.

## Suggested fix

Apply the result:

```ts
setDocs(initialDocs.docs as Document[]);
```

An empty result is a result. If the guard exists to avoid clearing a populated list while a
query is in flight, the fix for that is to ignore *stale* responses rather than *empty*
ones — keep a request counter and apply only the newest:

```ts
const seq = ++latest.current;
const found = await stackInstance.findDocuments(query.selector, query.fields);
if (seq === latest.current) setDocs(found.docs as Document[]);
```

That covers the real hazard (two runs landing out of order under the 150 ms debounce) and
leaves emptiness meaning what it says.

## Scope

`useFind` is the only hook with this shape — `useClassDocs` and `useDomainRelations` patch
by `_id` from a ref and drop inactive documents correctly, and no other call site guards a
setter on `.docs.length`. So the fix is one line, plus the counter if the staleness case is
worth closing at the same time.

## What the consumer did meanwhile

Intersected the windowed result with the workspace-wide list from `useClassDocs`, which
does drop a document when it goes inactive:

```ts
const live = useMemo(() => new Set(tasks.map(task => task.id)), [tasks]);
… windowDocs.filter(doc => … && live.has(doc._id))
```

It costs a `Set` and no extra read, and it goes when the guard does.

## Resolution (upstream)

Fixed as suggested, counter included: the `.docs.length` guard is gone and every fresh
result applies, empty or not. Staleness is handled by a `runId` ref — the same pattern
`useQuerySQL` in the same file already used, so the two hooks now share one discipline:
a response only lands if no newer run has started, and emptiness means empty. `useFind`'s
error and loading setters sit behind the same counter, closing the matching gap where a
slow failing run could overwrite a fast successful one.

Scope claim verified before fixing: `useClassDocs` and `useDomainRelations` patch by
`_id` from a ref and drop inactive documents, and no other call site guards a setter on
`.docs.length`. The consumer's `Set`-intersection workaround can be removed on upgrade.

Shipped in `@docstack/react` 0.1.1 (with `@docstack/client` 0.1.8).
