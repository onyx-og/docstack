---
title: "Query engine"
description: "How a SQL statement becomes rows: parse, plan, execute; what the planner pushes down to the index and what it evaluates in memory; how encryption and scopes shape the result."
sidebar_position: 4
---

`stack.query()` runs SQL through three stages.

## Parse

A hand-written recursive-descent parser turns the statement into an abstract syntax tree: a `SelectAST` with `columns`, `from`, `joins`, `where`, `groupBy`, `having`, `orderBy`, `limit` and `offset`, or a `UnionAST` indexing two selects. The grammar is small on purpose and is spelled out in the [SQL dialect reference](../reference/sql-dialect.md). Positional `?` placeholders are resolved against the call's parameters before planning, so nothing downstream guesses types from strings: literals carry their runtime type on the node.

The AST is returned alongside the rows, and it is what the React bindings use to work out which classes a query reads, so that `useQuerySQL` can subscribe to exactly those.

## Plan

The planner turns the tree into an execution plan and decides what the storage layer can answer directly:

- **Filter pushdown.** Equality and range predicates on a class's own attributes become a Mango selector, so the first fetch pulls as little as possible. A predicate on an encrypted attribute cannot be pushed down, because a filter applied to ciphertext would answer the wrong question; it is evaluated in memory after decryption.
- **Sort and limit pushdown.** `ORDER BY … LIMIT` pushes into an index when the planner can prove the result is identical; `stack.ensureSortIndex(field)` builds the index ahead of time, and a keyset scan pages through it and stops early.
- **Join strategy.** Each `JOIN` becomes a hash join over the fetched sets; an `ON a._id IN m.tags` predicate joins against an array-valued attribute.
- **Subquery unnesting.** `EXISTS` and `NOT EXISTS` become semi and anti joins rather than a subquery per row; `IN (SELECT …)` and `NOT IN (SELECT …)` likewise; a scalar subquery is evaluated once.
- **Residual filtering.** Whatever cannot become a selector, `AND`-chained predicates across joined tables, comparisons against subquery results, encrypted attributes, is kept for in-memory evaluation.

## Execute

The executor fetches the base sets with the plan's selectors, joins them, applies residual filters, groups and accumulates (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, with `DISTINCT`), applies `HAVING`, projects the requested columns with their aliases, sorts, applies `DISTINCT`, and applies `LIMIT` and `OFFSET`. `UNION` runs both sides and merges, deduplicating unless `ALL`. `queryStream` yields rows as they are produced instead of materialising the result.

## Encryption and scopes come first

The engine reads through the stack's document pipeline, so access control needs no query-level special-casing: it is a property of what the session can decrypt.

- **Sealed scopes stay sealed.** A document whose scope the session has not unlocked contributes only what any locked read contributes: sealed fields are `null`, and a row with nothing visible drops out. No `WHERE` clause, join or projection can conjure plaintext the session's key cannot produce.
- **Decryption is transparent.** When the stack holds the key, encrypted attributes in the projection are decrypted before the row is returned. A locked stack returns them as `null`, and a row consisting only of `null` values is dropped rather than returned as an empty object.

## Inside a transaction

A transaction handle runs the same engine over an overlay: documents staged in the transaction are merged into the fetched sets, including across joins, so a multi-document write can check its own invariants before committing. Plain `stack.query` never sees a stage.

## Live queries

`useQuerySQL` derives the classes a statement reads from its AST with `collectQueryClasses`, exported by `@docstack/client`, subscribes to each, and re-runs the query when any of them changes, coalescing bursts. Because the walk is over the tree rather than an enumeration of syntax, a class referenced inside a subquery is watched too.

## Known limits

Conditions chain with `AND` only; there is no `OR`, `!=`, `LIKE`, `BETWEEN` or `IS NULL`; `IN` takes a subquery or an array column, not a literal list; there are no scalar functions or arithmetic. `IN (SELECT …)` inside a `HAVING` clause throws. The [Query with SQL](../guides/query-with-sql.md) guide lists the workaround for each.

The subquery paths and live views were fixed and pinned together in [ADR-0026](https://github.com/onyx-og/docstack/blob/main/specs/adr/0026-live-queries-and-subqueries.md).
