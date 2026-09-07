---
title: "Query with SQL"
description: "Run SELECT statements with joins, aggregation, subqueries and positional parameters against local documents, stream large results, and know exactly what the dialect does not support."
sidebar_position: 4
---

The query engine parses SQL, plans it against the indexes it can use, and executes what it cannot push down in memory. It reads through the stack's document pipeline, so encrypted fields decrypt for a session holding the key and stay `null` for one that does not.

## The call

```typescript
const { rows, ast } = await stack.query('SELECT title, priority FROM Task WHERE isComplete = false ORDER BY title');
```

`stack.query(sql, ...params)` returns the result rows and the parsed statement (a list, because a `UNION` produces several). Table names are class names; column names are attribute names, plus the document fields every class carries (`_id`, `~class`, `~createTimestamp`, `active`). Quote names that contain characters an identifier cannot: `SELECT "~createTimestamp" FROM Task`.

## Parameters

```typescript
const { rows } = await stack.query(
    'SELECT * FROM Task WHERE assigneeId = ? AND priority = ?',
    currentUserId, 'high'
);
```

Placeholders are positional `?`. A bound value must be a string, number, boolean or `null`; anything else is refused before planning. `LIMIT` and `OFFSET` take integer literals, not placeholders.

## Joins

```typescript
const { rows } = await stack.query(`
    SELECT t.title, u.username AS assignee
    FROM Task AS t
    JOIN User AS u ON u._id = t.assigneeId
    WHERE t.priority = 'high' AND t.isComplete = false
    ORDER BY t.createdAt DESC
    LIMIT 20
`);
```

`JOIN` (inner), `LEFT JOIN` and `RIGHT JOIN` are supported, each with an `ON` predicate, and they can be chained. One `FROM` table per statement; join the others.

A join can also match a value against an array-valued attribute:

```sql
SELECT p.title, t.name AS tag
FROM Post AS p
JOIN Tag AS t ON t._id IN p.tags
```

## Aggregation and subqueries

```typescript
const { rows: busy } = await stack.query(`
    SELECT assigneeId, COUNT(*) AS open
    FROM Task
    WHERE isComplete = false AND assigneeId IN (SELECT _id FROM User WHERE active = true)
    GROUP BY assigneeId
    HAVING COUNT(*) > 5
`);
```

`COUNT`, `SUM`, `AVG`, `MIN` and `MAX` are available, with `DISTINCT` inside the call. `GROUP BY` and `HAVING` work as expected. Three subquery shapes are supported: `IN (SELECT …)` and `NOT IN (SELECT …)`, `EXISTS (SELECT …)` and `NOT EXISTS (SELECT …)` (planned as semi and anti joins), and a scalar subquery used as a value:

```sql
SELECT title FROM Task WHERE estimate > (SELECT AVG(estimate) FROM Task)
```

`DISTINCT`, `DISTINCT ON (expr, …)`, `UNION` and `UNION ALL` round out the dialect. One known gap: `IN (SELECT …)` inside a `HAVING` clause throws.

## What pushes down

`WHERE`, `ORDER BY … LIMIT` and range predicates push down into the index where the planner can prove the result is identical, and `EXISTS`/`NOT EXISTS` unnest into join strategies rather than running a subquery per row. Encryption is consulted first: a filter applied to ciphertext would answer the wrong question, so a predicate on an encrypted attribute is evaluated in memory after decryption. `stack.ensureSortIndex(field)` builds the index a sort needs ahead of time; `stack.cleanupSortIndexes()` removes ones that have not been used.

## Streaming large results

For results too large to materialise, stream them. The scan pages by keyset and stops early when a `LIMIT` is satisfied:

```typescript
for await (const row of stack.queryStream('SELECT _id, title FROM Task WHERE isComplete = false')) {
    process(row);
}

for await (const doc of stack.findDocumentsIterator({ '~class': 'Task' }, { batchSize: 200 })) {
    process(doc);
}
```

## Encrypted and sealed data

A row is what the session can read. Encrypted attributes decrypt when the stack holds the key; on a locked stack they come back as `null`, and a row that would consist only of `null` values is dropped rather than returned as an empty object. No `WHERE` clause, join or projection can produce plaintext the session's key cannot; see [Access control](../concepts/access-control/index.md).

## Inside a transaction

A transaction handle has its own `query`. It sees the documents staged in that transaction overlaid on committed state, including across joins, which is how a multi-document write can check its own invariants before committing. See [Write transactions](./transactions.md).

## From React

`useQuerySQL(stack, sql, params?, options?)` runs the same engine and re-runs when a document in any class the query reads changes. See [React bindings](./react.md).

## What is not supported

The dialect is `SELECT` only. Writes go through the class API and the document pipeline, never through SQL.

| Not supported | Use instead |
| :--- | :--- |
| `OR` | Two queries joined with `UNION`, or a Mango `$or` selector through `findDocuments`. |
| `!=`, `<>` | `NOT IN (SELECT …)`, or filter in memory. |
| `LIKE`, `BETWEEN`, `IS NULL` | Range predicates (`>=` and `<=`), or filter in memory. |
| `IN (1, 2, 3)` literal lists | `IN (SELECT …)`, or an array-valued column on the right of `IN`. The parser says so: "Value lists for IN are not supported." |
| Arithmetic and scalar functions | Compute in a trigger at write time, or in application code. |
| `INSERT`, `UPDATE`, `DELETE`, DDL | `classObj.add`, `updateCard`, `deleteCard`, patches. |
| More than one table in `FROM` | `JOIN`. |
| `LIMIT ?` | An integer literal. |

The complete grammar, with every accepted token, is in the [SQL dialect reference](../reference/sql-dialect.md).
