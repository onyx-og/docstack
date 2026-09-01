# Proposal: make `useQuerySQL` live

For `onyx-og/docstack`, `packages/react`. Addresses finding #3 in
[docstack-react-0.0.9.md](../findings/docstack-react-0.0.9.md).

Written from `paper`, 2026-08-26, against `@docstack/react@0.0.9` and
`@docstack/client@0.1.6`.

## Summary

`useQuerySQL` runs its query once and never again. Make it re-run when a document changes
in a class the query actually reads — derived from the `ast` the query already returns, not
from parsing SQL in the hook, and not from `docStack`'s `change` event, which is a
replication event that a local write never reaches.

Two small pieces of client API have to become public first.

## What is wrong today

Three separate defects, which is why it looks like one intractable one.

**The latch.** The query is guarded by a ref that is set on the first run and never
cleared:

```js
const queryRef = useRef(false);   // [TODO] Solve bounce of component because of StrictMode
…
if (!queryRef.current) { queryRef.current = true; runQuery(); }
else { console.log("Already performing query"); }
```

The latch exists for a real reason. The effect's dependency array is
`[docStack, stack, params]`, and `params` comes from a rest parameter — a fresh array on
every render — so the effect re-runs on every render, and the latch is the only thing
stopping a query storm. It solves that by making the hook permanently one-shot, including
when `sql` genuinely changes. Note that `sql` is not in the dependency array at all.

**No subscription.** The cleanup is `return () => { /* */ }`, because there is nothing to
release. Nothing is watching.

**The wrong event, in the neighbouring hook.** `useFind` does subscribe, to a handler that
does nothing:

```js
const changeListener = (change) => {
    // A simple way is to re-run the query.
    // runQuery();
};
// [TODO] Implement events
docStack.addEventListener('change', changeListener);
```

Uncommenting that line would not fix it. `DocStack` dispatches `change` as
`{ detail: { direction, change } }` — it is emitted from the replication path, and
`direction` is what gives it away. A document written locally never produces one. An
implementation built on this event would appear to work while replicating and silently do
nothing on the machine where the user is typing, which is the worst of the available
failure modes.

`git log -S"runQuery();"` dates that comment-out to `905847e` (2025-11-09), the commit that
introduced the SQL engine. Neither hook has ever been live.

## What makes this urgent rather than cosmetic

`useClassDocs` sits in the same import and *is* live. A view that mixes them — the Desk in
`paper` did — renders one list that refreshes beside one that does not, with nothing at
either call site to distinguish them. The name says "query", the behaviour is "snapshot",
and the gap is invisible until someone notices their data is old.

## Alternatives considered

**Patch the result set incrementally, the way `useClassDocs` patches its array.** Wrong for
SQL, and attractively wrong. `useClassDocs` can splice a changed document into its list
because its result *is* the class's documents. A SQL result is not: `ORDER BY` means one
changed row can move anywhere, `LIMIT` means it can push a row out of the set or pull one
in, `GROUP BY` and aggregates mean a write changes a row that has no single document behind
it, and a `JOIN` means a change to a table that does not appear in the output can change the
output. Re-running the query is the only correct answer. Everything below assumes it.

**Re-run on every change in the stack.** Correct and simple: one feed, re-run on anything.
Rejected as the default because a replication pull of a few hundred documents re-runs every
mounted query a few hundred times, and the aggregate cost lands on exactly the machine that
is already busy. Kept as the *fallback* — see [Fail open](#fail-open).

**Re-run on a timer.** Rejected; picks between stale data and wasted queries with no way to
be right.

## Proposed design

The query already tells the hook what it reads. `stack.query()` returns `{ rows, ast }`
with `ast: (SelectAST | UnionAST)[]`, and `SelectAST` carries `from` and `joins`. So:

1. Run the query.
2. Collect the class names the returned AST reads.
3. Subscribe to those classes' document feeds.
4. On a change, coalesce and re-run.

Subscribing after the first result rather than before is not a compromise — it is the only
point at which the set of classes is known, and it costs one query's latency before the
view is live, which is the same instant the view first has anything to show.

### Collecting the classes belongs in the client, not the hook

`SelectAST.from` and `.joins` are typed `any[]`. A walk over them written in
`@docstack/react` is a walk over a structure owned by the client's SQL engine, and it will
under-subscribe the first time that engine grows a node shape the walk does not recognise —
a CTE, a lateral join, a new subquery form. Under-subscribing is silent: the list simply
stops updating, which is exactly the bug being fixed.

So the client should export the walk, next to the parser that produces the shape:

```ts
// @docstack/client
export const collectQueryClasses = (ast: (SelectAST | UnionAST)[]): string[] | null;
```

Returning `null` — rather than `[]` — for an AST it cannot fully account for is the
important part of the contract. `[]` means "this query reads nothing"; `null` means "I do
not know", and the caller can then fail open.

### Making the subscription public

The hook needs to watch a class without building a `Class`. The client already has exactly
this, and it is already the recommended path — `onClassDoc`'s own documentation says
"Prefer `subscribeClassDocs` / `subscribeDomainDocs`, which route changes through the
decrypting preparation step (ADR-0020)".

They exist at runtime. They are not in `stack.d.ts`; only that `@link` mentions them. The
public alternative, `onClassDoc`, is the one the documentation warns against, because it
delivers documents as stored — which for an encrypted stack means ciphertext.

```ts
// ClientStack, to be declared
subscribeClassDocs: (className: string, target: EventTarget) => ChangesSubscription;
subscribeDomainDocs: (domainName: string, target: EventTarget) => ChangesSubscription;
releaseListener: (subscription: ChangesSubscription | undefined) => void;
```

No behaviour change — this declares what is already shipping. Worth doing on its own merit:
any consumer wanting a live view of something other than one class currently has to choose
between an untyped call and a documented footgun.

`onClassDoc` returns a handle onto a shared `classDocFeed`, so subscribing to eight classes
costs eight subscribers on one database listener, not eight feeds. The per-class approach is
cheap.

### The hook

```tsx
export type QuerySQLOptions = {
    /** Re-run when a document changes in a class this query reads. Defaults to `true`. */
    live?: boolean;
    /** Coalesce a burst of changes into one re-run, in ms. Defaults to 150. */
    coalesceMs?: number;
};

export const useQuerySQL = (
    stack: string,
    sql: string,
    params: any[] = [],
    options: QuerySQLOptions = {},
) => {
    const { live = true, coalesceMs = 150 } = options;
    const docStack = useContext(DocStackContext);
    const [result, setResult] = useState<QueryResult>({ rows: [], ast: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Which classes to watch. Held in state because it comes out of the first result and
    // drives the subscription effect below.
    const [watched, setWatched] = useState<string[] | null>(null);

    // Stable identities, so the effects key on the query rather than on render count.
    // This is what the `queryRef` latch was standing in for.
    const paramsKey = JSON.stringify(params);
    const paramsRef = useRef(params);
    paramsRef.current = params;

    const runId = useRef(0);

    const runQuery = useCallback(async () => {
        const stackInstance = docStack?.getStack(stack);
        if (!stackInstance) return;

        const id = ++runId.current;
        try {
            const queryResult = await stackInstance.query(sql, ...paramsRef.current);
            // A slow earlier run must not overwrite a fast later one.
            if (id !== runId.current) return;
            setResult(queryResult);
            setWatched(collectQueryClasses(queryResult.ast));
            setError(null);
        } catch (err) {
            if (id === runId.current) setError(err as Error);
        } finally {
            if (id === runId.current) setLoading(false);
        }
    }, [docStack, stack, sql, paramsKey]);

    useEffect(() => {
        if (!docStack) {
            // The provider publishes null until `ready`; startup, not a missing provider.
            setLoading(true);
            return;
        }
        setLoading(true);
        runQuery();
    }, [docStack, runQuery]);

    useEffect(() => {
        const stackInstance = docStack?.getStack(stack);
        if (!live || !stackInstance || watched === null) return;

        // `watched === null` means the AST could not be accounted for. Watching every
        // class is wasteful; watching none is silently wrong. See "Fail open".
        const classes = watched.length ? watched : stackInstance.getClassNames();

        const target = new EventTarget();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onDoc = () => {
            clearTimeout(timer);
            timer = setTimeout(runQuery, coalesceMs);
        };
        target.addEventListener('doc', onDoc);

        const subscriptions = classes.map(name => stackInstance.subscribeClassDocs(name, target));

        return () => {
            clearTimeout(timer);
            target.removeEventListener('doc', onDoc);
            for (const subscription of subscriptions) stackInstance.releaseListener(subscription);
        };
    }, [docStack, stack, live, coalesceMs, JSON.stringify(watched), runQuery]);

    return { loading, result, error, refetch: runQuery };
};
```

The `watched === null` branch above needs `stackInstance.getClassNames()`, or any existing
equivalent — `getClassModels()` would do. If neither is convenient to expose, the fallback
can subscribe to the raw stack feed instead; what matters is that it subscribes to
*something*.

`useFind` takes the same treatment, minus the AST step: its selector names its class
directly, so it can subscribe immediately and does not need `collectQueryClasses`. Its
`docStack.addEventListener('change', …)` should be removed rather than implemented.

### Fail open

Every uncertainty here resolves toward re-running too often rather than too rarely.

- An AST the client cannot fully account for (`null`) subscribes to every class.
- A query with no `FROM` (`SELECT 1`) yields `[]` and subscribes to nothing, correctly —
  the distinction between `[]` and `null` is what makes that safe.
- A class named in the AST that does not exist subscribes to a feed that never fires, which
  costs nothing.

The asymmetry is deliberate: an extra re-query is a measurable cost, and a missed one is a
user looking at data they believe is current. This proposal is the product of the second
kind of failure, which took a DOM-level test to notice at all.

## Compatibility

`(stack, sql, ...params)` becomes `(stack, sql, params?, options?)`. Breaking, and worth it:
the rest form is what forces the unstable dependency the latch was working around, and it is
easy to misuse — `paper` called it as `useQuerySQL('paper-stack', sql, [])`, which under the
rest signature passes a single parameter that is an empty array, not zero parameters. Nobody
noticed, because that query has no placeholders.

`{ loading, result, error }` is unchanged; `refetch` is added.

Consumers relying on one-shot behaviour should be assumed not to exist — the current
behaviour is "silently stale", which is not something to depend on deliberately. Anyone who
does want it passes `{ live: false }`, and now says so at the call site.

## Testing

The behaviour is only observable over time, so a test asserting the first result proves
nothing — this bug survived because every test that existed passed. Two tests, both of which
fail against today's implementation:

1. Mount, write a document the query matches, assert the result grows without a remount.
2. Mount a query over class A, write to unrelated class B, assert the query does **not**
   re-run — the point of AST-derived subscription over a whole-stack feed.

`paper` has the DOM-level version of (1) in
[`live-updates.spec.ts`](../../packages/web/tests/live-updates.spec.ts), driving the
rendered list rather than the hook, and will switch it back to `useQuerySQL` once this
lands.

## What paper does meanwhile

The Desk's "Recent" list was moved off `useQuerySQL` onto `useClassDocs`, sorting by
`~updateTimestamp` in the component. That works and is live, but it loads every Paper to
show ten of them — `ORDER BY … LIMIT` in the database is the right shape, and the reason to
want this hook back.
