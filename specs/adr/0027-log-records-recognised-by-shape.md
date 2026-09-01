# ADR-0027 — Log records are recognised by shape, and `info` no longer reaches the database

Status: accepted · Date: 2026-08-26

Corrects the fix made for finding 2 of [0023-client-0.1.6.md](0023-client-0.1.6.md), which
addressed the writer and not the records.

## Decision

1. **The replication filter recognises a log record by its shape**, not only by the `~log-`
   id prefix.
2. **The default sink level is `warn`, not `info`.** A stack configured with an explicit
   `logLevel` still gets that level in its database.

## What the previous fix missed

ADR-0024 gave newly written records a `~log-` id prefix, reaching the
`INTERNAL_DOC_ID_PREFIXES` machinery. Measured against a fresh stack, log records went from
every-one-replicating to none, and that was taken as done.

It only ever covered records that build wrote. A record written before it — or by any
consumer still on an older client — looks like this:

```json
{
  "_id": "25264562-4fc4-408e-95c1-b80295132b9f",
  "log": { "level": "info", "message": "getCards - selector", "module": "class",
           "className": "Task", "selector": { "~class": { "$eq": "Task" }, "active": true } }
}
```

A bare UUID, no `~class`, no `~domain`. The id rules cannot match it and the class rules
have nothing to key on, so it replicates — and it is already on disk, so no change to the
writer will ever reach it.

Reported from a real deployment: **76 log records replicated, 54 of the 56 documents in
the root stack.** The replica was almost entirely diagnostics.

The lesson is narrower than "test harder": the fix was verified against a database created
*after* it, which is the one population it could not fail on. A fix for documents already
written has to be tested against documents already written.

## Why this is a confidentiality problem, not a quota one

A record's fields are whatever the call site passed. `getCards - selector` carries the
query selector. In the reported sample those were all class-level predicates —
`{"~class": {"$eq": "Task"}, "active": true}` — but a selector is unbounded, and a query
over user-entered text puts that text on the remote **in the clear, outside the crypto
engine**, inside a document DocStack treats as ordinary application data. Field encryption
never sees it, because as far as the stack is concerned it is not a field of any class.

Quota was the visible symptom. This is the reason it matters.

## The shape test

```
no `~class`  ∧  no `~domain`  ∧  `log` is an object with a string `level` and `message`
```

Deliberately narrow. Application documents always carry `~class` and relations carry
`~domain`, so a document that has neither is already not application data; requiring the
`log` object as well means a document that merely *has* a field called `log` — a Task
whose user typed into a field of that name — still replicates. That case is a test.

Both mechanisms are kept. The prefix is cheaper and states intent at the write site; the
shape test is what catches records the writer never touched.

## Why `info` stopped going to the database

The filter stops these reaching a remote. It does not stop this codebase writing one
document per `logger.info` into the database that replicates, and at `info` it traces
routinely enough that 54 of 56 documents were diagnostics.

`SINK_LEVEL` is now `warn`. A stack given an explicit `logLevel` still writes exactly that
level, so asking for `info` while diagnosing something works as before — the change is only
to what happens when nobody asked.

## Consequences

- **Existing log records stay on disk.** They no longer replicate, but nothing deletes
  them; a stack that accumulated thousands still holds them. A compaction helper would be a
  separate change.
- **A remote that already holds them still holds them.** The filter governs what leaves, not
  what has left. Clearing those is a deployment task.
- **Quiet runs now write no log documents at all**, which invalidated an assertion in the
  ADR-0023 tests that "there is always some logging by this point". That the assertion broke
  is the change working.

## Tests

`packages/client/src-test/log-records.test.ts` — the exact reported document is held back;
so is one carrying a user's search phrase; so is a `~log-` prefixed one; and an application
document with a field called `log` still replicates. Plus: a read at the default level adds
no documents to the database.
