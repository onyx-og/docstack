# ADR-0026 — Live SQL views, and the subquery paths that never ran

Status: accepted · Date: 2026-08-26

Answers the proposal in [0025-live-usequerysql.md](0025-live-usequerysql.md), and the
query-engine defect that writing its tests uncovered.

## Decision

1. **`useQuerySQL` is live by default.** It re-runs when a document changes in a class the
   query actually reads, derived from the `ast` the query already returns.
2. **`collectQueryClasses(ast)` is exported from `@docstack/client`**, beside the parser
   that produces the shape, returning `string[] | null`.
3. **`useFind` subscribes to the class its selector names**, and its
   `docStack.addEventListener('change', …)` is removed rather than implemented.
4. **`IN (SELECT …)`, `NOT IN (SELECT …)` and un-correlated `EXISTS` now execute**, and a
   correlated `EXISTS` returns the right rows.

## Part 1 — making the view live

The proposal's diagnosis was accurate in full: a `queryRef` latch that made the hook
permanently one-shot, no subscription at all, and — in `useFind` — a subscription to
`docStack`'s `change`, which is dispatched from the replication path and carries a
`direction`. A locally written document never produces one, so an implementation built on
it would have appeared to work while syncing and done nothing on the machine where the
user is typing.

### One part was already done

The proposal asks for `subscribeClassDocs`, `subscribeDomainDocs` and `releaseListener` to
be declared publicly, noting they exist at runtime but not in the types. That was true of
published `0.1.6`. They are now declared on `Stack` in `@docstack/shared`, and
`ClientStack extends Stack`, so they are already public — a consequence of ADR-0020 and
ADR-0021. No work was needed.

### The walk is generic, not an enumeration

`collectQueryClasses` does not enumerate the node types that can hold a nested query —
`scalar_subquery`, `exists_expr`, the right-hand side of `IN`. It walks the object graph
and harvests every `select` node it finds. A subquery form added later is covered on the
day it is added, rather than on the day someone notices a list has stopped updating.

The proposal's `[]` versus `null` contract is what makes failing open possible, and it is
pinned by tests:

| result | meaning | caller |
| :--- | :--- | :--- |
| `["Task"]` | reads these | watch them |
| `[]` | reads nothing (`SELECT 1`) | watch nothing, correctly |
| `null` | cannot account for this | watch everything |

`ClientStack.getClassNames()` was added for that last row.

### Testing without a React harness

`packages/react` has no test runner, and adding one for this would have been a larger
change than the fix. The tests instead drive the mechanism the hook is a thin wrapper over
— run, collect classes, subscribe, write, observe — which covers everything except React's
effect plumbing.

The negative test is the one that matters, and it is the reason to derive the subscription
from the AST rather than watch the whole stack: a write to a class the query does not read
produces **zero** notifications.

## Part 2 — three subquery paths that had never run

Writing those tests turned up `Unsupported expression type: subquery`. The parser has
emitted these nodes since the SQL engine landed; `evalExpression` had a case for none of
them.

| SQL | node | before |
| :--- | :--- | :--- |
| `IN (SELECT …)` | `subquery` | threw `Unsupported expression type` |
| `EXISTS (SELECT …)`, un-correlated | `exists_expr` | threw `Unsupported expression type` |
| `NOT IN (SELECT …)` | operator `NOT IN` | threw `Unsupported operator NOT IN` |

`scalar_subquery` was handled, which is why the gap was easy to miss: subqueries appeared
to work.

`subquery` now evaluates to the first column of every row the subquery returns, which is
what a single-column `SELECT` means as an `IN` operand. `NOT IN` is the complement of `IN`
rather than a mirror of its guard, so `x NOT IN <nothing>` is true rather than false.

### And a correlated `EXISTS` returned every row

A correlated `EXISTS` never reaches `evalExpression` at all: `decorrelateSubqueries`
rewrites it into a SEMI or ANTI join first. That path was broken in a way that fails
quietly.

`findCorrelation` accepts the correlation predicate written either way round — it tests
`(leftIsInner && rightIsOuter) || (leftIsOuter && rightIsInner)`. The executor's equi-join
branch assumed one of them:

```js
const rightJoinKeyExpr = join.on.right;   // assumed to be the inner column
…
const key = await evalExpression(leftRow, join.on.left, …);  // assumed to be the outer
```

For `EXISTS (SELECT a.name FROM Author AS a WHERE a.name = b.author)` the inner column is
on the **left**. So the map was keyed by evaluating `b.author` against author rows, which
have no `author` field, and probed with `a.name` against book rows, which have no `name`
field. Every key was `null`, `null` matched `null`, and the join admitted every row — a
SEMI join that filtered nothing, and an ANTI join that would have rejected everything.

Nothing threw. The query returned rows, just the wrong ones, which is the failure mode
that survives longest.

The orientation is now determined from the join alias at execution time.

## Consequences

- **`(stack, sql, ...params)` becomes `(stack, sql, params?, options?)`.** Breaking, and
  the point: the rest form is what forced the unstable dependency the latch was working
  around. `useQuerySQL('paper-stack', sql, [])` previously passed *one* parameter that was
  an empty array; it now means no parameters.
- **`{ loading, result, error }` is unchanged**; `refetch` is added.
- **`{ live: false }`** restores one-shot behaviour, at the call site where it is visible.
- **A correlated `EXISTS` changes its answers.** It was returning every row; anything built
  around that behaviour was built around a bug.
- **`IN (SELECT …)` in a `HAVING` clause still throws.** `evalHavingExpression` has its own
  switch and its own default arm; it was left alone rather than changed without a test.

## Tests

`packages/client/src-test/query-classes.test.ts` — the classes a query reads, through
joins and through three nesting shapes, plus a deliberately invented node type to show the
walk is generic; the `[]`/`null` distinction; and the live mechanism end to end, including
that an unrelated class does not notify and that releasing releases.

`packages/client/src-test/query-subqueries.test.ts` — `IN`, `NOT IN`, `EXISTS` and
`NOT EXISTS` over a subquery all execute *and* return the right rows. Asserting only that
they no longer throw would have passed against the broken SEMI join.
