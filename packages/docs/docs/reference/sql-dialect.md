---
title: "SQL dialect"
description: "The exact grammar the query engine accepts, token by token, and the constructs it refuses with the error you will see."
sidebar_position: 7
---

The engine accepts `SELECT` statements, optionally combined with `UNION`. Nothing else. Keywords are case-insensitive; identifiers are case-sensitive and match class and attribute names.

## Statement

```
statement   := select ( UNION [ALL] select )*
select      := SELECT [DISTINCT [ON ( expr , … )]] item ( , item )*
               FROM table [[AS] alias]
               ( join )*
               [WHERE predicate]
               [GROUP BY expr ( , expr )*]
               [HAVING predicate]
               [ORDER BY expr [ASC|DESC] ( , expr [ASC|DESC] )*]
               [LIMIT integer]
               [OFFSET integer]
item        := * | expr [[AS] alias]
join        := [INNER | LEFT | RIGHT] JOIN table [[AS] alias] ON predicate
```

- One table in `FROM`. Further tables come in through `JOIN`.
- `table` is a class name; `alias` is an identifier or a `"quoted"` identifier.
- `LIMIT` and `OFFSET` take integer literals only; a placeholder is not accepted there.
- A statement may end with `;`.

## Expressions

```
expr        := ( SELECT … )                       -- scalar subquery, one value
             | function ( [DISTINCT] column )     -- COUNT, SUM, AVG, MIN, MAX
             | alias . column
             | column
             | *
             | 1                                  -- literal 1 only, for SELECT 1 in EXISTS
```

Functions take exactly one column argument (or `*`). Only the five aggregates are implemented. There are no scalar functions and no arithmetic operators.

## Predicates

```
predicate   := condition ( AND condition )*
condition   := expr op value
             | expr IN ( SELECT … )
             | expr NOT IN ( SELECT … )
             | expr IN column                     -- column holds an array
             | [NOT] EXISTS ( SELECT … )
op          := = | > | < | >= | <=
value       := number | 'string' | TRUE | FALSE | NULL | ? | expr
```

Conditions chain with `AND` only, right-recursively, without parenthesised grouping. `OR` is not accepted. Strings use single quotes with `''` as the escape. Numbers may be negative and decimal. `?` is a positional placeholder bound from the arguments of `stack.query(sql, ...params)`; a bound value must be a string, number, boolean or `null`.

## Identifiers and comments

- Bare identifiers match `[A-Za-z_][A-Za-z0-9_]*`.
- Quoted identifiers are double-quoted, with `""` as the escape: `SELECT "~createTimestamp" FROM Task`. This is how document fields that start with `~` or `_` are addressed.
- `--` starts a line comment.

## Subqueries

| Shape | Planned as |
| :--- | :--- |
| `WHERE a IN (SELECT b FROM …)` | A semi join on the subquery's single column. |
| `WHERE a NOT IN (SELECT b FROM …)` | An anti join. |
| `WHERE EXISTS (SELECT 1 FROM … WHERE …)` | A semi join; correlated references to the outer alias are allowed. |
| `WHERE NOT EXISTS (…)` | An anti join. |
| `WHERE a > (SELECT AVG(x) FROM …)` | The scalar subquery is evaluated once. |

A subquery must have a `FROM` clause. `IN (SELECT …)` inside a `HAVING` clause is a known gap: it throws.

## Refused, and how

| Input | Error |
| :--- | :--- |
| `WHERE a = 1 OR b = 2` | `Unexpected token near: "OR b = 2"` |
| `WHERE a != 1`, `WHERE a <> 1` | `Expected binary operator at position …` |
| `WHERE a LIKE 'x%'`, `BETWEEN`, `IS NULL` | `Expected binary operator at position …` |
| `WHERE a IN (1, 2, 3)` | `Value lists for IN are not supported. Use subquery or array column ref.` |
| `FROM A, B` | `Unexpected token near: ", B"` |
| `SELECT a + b FROM T` | `Unexpected token near: "+ b FROM T"` |
| `INSERT`, `UPDATE`, `DELETE`, `CREATE` | `Unexpected token near: "INSERT …"` (only `SELECT` can start a statement) |
| `LIMIT ?`, `OFFSET ?` | `Expected integer after LIMIT at position …` |
| `SELECT a FROM` | `Invalid SQL: Missing FROM clause.` |
| An unterminated `'string` or `"identifier` | `Unterminated string literal` / `Unterminated quoted identifier` |

## The result

`stack.query` resolves to `{ rows, ast }`. `rows` is an array of plain objects keyed by output column (alias when given, otherwise the column name). `ast` is an array of parsed statements: one `SelectAST` for a plain query, and for a `UNION` the two selects plus a `UnionAST` that indexes them. The types are exported by `@docstack/client`.
