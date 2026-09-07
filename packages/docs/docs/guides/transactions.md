---
title: "Write transactions"
description: "Stage a multi-document change in memory, read your own staged state, and commit it as one batch through the full authoring pipeline, with the storage adapter's real atomicity reported on every commit."
sidebar_position: 6
---

Opt in per stack. A handle stages validated writes in memory; reads through the handle see the staged state overlaid on committed state; commit flushes the journal as **one batch** through the full authoring pipeline.

## Opt in and use

```typescript
const stack = await ClientStack.create('my-app', { transactions: true });

const t = stack.beginTransaction();
try {
    const order = await t.createDoc(null, 'Order', { customerId, total: 0 });
    for (const line of lines) {
        await t.createDoc(null, 'OrderLine', { orderId: order._id, ...line });
    }

    // Reads through the handle see what you staged; nothing else does.
    const { rows } = await t.query('SELECT SUM(amount) AS total FROM OrderLine WHERE orderId = ?', order._id);

    const report = await stack.commit(t);
    console.log(report.written.length, 'documents landed');
    console.log('atomic:', report.adapter.atomicBatch);
} catch (error) {
    stack.discardTransaction(t);
    throw error;
}
```

`transactions: true` only unlocks the capability. Direct writes stay immediate next to open transactions, and DocStack's own writers (the scheduler, jobs, sync) always write directly. `beginTransaction()` on a stack opened without the flag throws `TransactionsDisabledError`.

## The handle

| Member | What it does |
| :--- | :--- |
| `t.createDoc(docId, type, params)` | Stages a validated document. `docId` may be `null` for a minted id. |
| `t.createDocs(docs, type)` | Stages several. |
| `t.deleteDocument(docId)` | Stages a soft delete (`active: false`). |
| `t.findDocuments(selector, fields?, skip?, limit?, sort?)` | Mango read over the overlay. |
| `t.query(sql, ...params)` | SQL over the overlay, joins included. |
| `t.db.get`, `t.db.bulkGet`, `t.db.find` | PouchDB-shaped reads over the overlay. |
| `t.db.put`, `t.db.post`, `t.db.remove`, `t.db.bulkDocs` | PouchDB-shaped staged writes; each returns `{ ok: true, id, staged: true }`. |
| `t.status` | `'open'`, `'committed'`, `'discarded'` or `'partial'`. |
| `t.stagedCount()` | How many documents the journal holds. |
| `t.commit()`, `t.discard()` | The same as `stack.commit(t)` and `stack.discardTransaction(t)`. |

Staging validates. A write that fails schema validation, a relation check or the locked-stack check stages nothing and throws `TransactionValidationError`; a batch with one bad document unwinds entirely. Reads through the handle see the stage overlaid on committed state. Plain reads, other handles, live subscriptions and replication see committed state only.

## Commit

`stack.commit(t)` sends the journal as one `bulkDocs` through the unchanged pipeline, so triggers, relation checks and encryption run exactly as they would for a direct write. Before writing, it re-checks every staged document's base revision against the stored winner. If a document changed underneath, whether by a direct write, another transaction's commit or replication, the commit refuses with `TransactionConflictError`, persists nothing, and leaves the transaction open to re-stage or discard. The error's `conflicts` array names each document with its base and current revision.

The report says what happened and on what guarantee:

```typescript
type TransactionCommitReport = {
    transactionId: string;
    written: { id: string; rev: string }[];
    failed: { id: string; error: string; name?: string }[];
    stagedCount: number;
    durationMs: number;
    adapter: { name: string; atomicBatch: boolean };
};
```

**Atomicity is reported, not assumed.** `adapter.atomicBatch: true` means the batch landed, or failed, as one storage transaction. `false` means per-document results: the revision pre-flight shrinks the window but does not eliminate it. IndexedDB, the default browser storage, reports `false`. A partial commit leaves the handle in `status: 'partial'` with only the failed entries retained, so a raced document conflicts on retry instead of being silently overwritten.

Commits on one stack are serialized, so one commit's pre-flight cannot be invalidated by another's write.

## What cannot be staged

Class models, patches, `_design/` documents and `_local/` documents are refused at stage time with `TransactionUnsupportedDocError`. A class model's write propagates to other documents mid-pipeline and cannot be staged or rolled back; patches have their own transactional path. `new_edits: false` and `force` are refused on the handle's PouchDB-shaped methods, as they are on `stack.db`.

## Uncommitted means not real

Stages are memory-only. `stack.discardTransaction(t)`, `close()`, `reset()` and a page reload all drop them. `TransactionStateError` is thrown when a handle is used after commit or discard.

## Cost

Measured in a real browser against IndexedDB, 100 documents:

| Path | Cost |
| :--- | :--- |
| Stage 100 documents | 43.1 ms total, 0.43 ms per document, 0 backend queries |
| Commit 100 | 43.1 ms, at parity with the non-transactional batch write (46.3 ms) |
| Overlay read, empty stage | 19.2 ms against 17.2 ms plain, same query count |
| Overlay read, 100 staged over 100 committed | 66.2 ms (unwindowed query plus in-memory union) |
| Refused commit (conflict pre-flight) | 1.3 ms, zero writes |
| Discard 100 | 0.1 ms |

Staging costs nothing at the storage layer, and committing costs what the same write would have cost anyway. Reproduce with `BENCH=1 npx playwright test zz-bench` in `packages/client`.

## Errors at a glance

| Error | When | What to do |
| :--- | :--- | :--- |
| `TransactionsDisabledError` | `beginTransaction()` without `transactions: true`. | Open the stack with the flag. |
| `TransactionValidationError` | A staged or committed document fails the sweep. `docId` names it. | Fix the document; nothing was written. |
| `TransactionConflictError` | A staged document's base revision moved. | Re-read, re-stage, commit again, or discard. |
| `TransactionUnsupportedDocError` | A class model, patch, `_design/` or `_local/` document was staged. | Write it directly, or through a patch. |
| `TransactionStateError` | The handle is not `open` or `partial`. | Begin a new transaction. |

Why the stage sits above the plugin and commits through it, and what the next version adds, is in [Transactions](../concepts/transactions.md).
