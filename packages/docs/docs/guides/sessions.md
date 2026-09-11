---
title: "Act as a session"
description: "Open a stack as one principal sees it: a session view narrows reads to the scopes a session may open, refuses writes into any other, attributes every write, and reaches triggers and jobs. For hosts that hold keys on behalf of many people."
sidebar_position: 7
sidebar_label: "Sessions"
---

A stack is one user's database: one keyring, one login, one class cache. On a device that is the right shape, because the device *is* the principal. A host is different. A server, a hub, any process that holds keys on behalf of several people and answers their requests from one stack, needs to say "this read is Alice's, this write is Bob's" and have the engine act on it. That is a **session**.

`stack.forSession(session)` returns a view of the stack as that session sees it. Reads through the view open only the access scopes the session is entitled to and read `null` for the rest, whatever keys the stack itself holds. Writes into any other scope refuse. Every write is attributed to the session's principal, and triggers and jobs receive the session as their fourth argument. The view has the stack's own shape, so a `Class` built from it, the query engine and the React hooks work unchanged.

:::info Version
Engine sessions ship in the next `@docstack/client` release ([ADR-0046](https://github.com/onyx-og/docstack/blob/main/specs/adr/0046-engine-sessions.md)). A stack used without a session behaves exactly as before.
:::

## 1. Decide what the session may open

A `StackSession` is a claim you construct. The engine does not authenticate it; it enforces it against the keys it actually holds, so a session can never open more than the stack's keyring can. Entitlement is the ceiling you set, the keys are the ceiling the mathematics sets.

```typescript
import type { StackSession } from '@docstack/client';

const session: StackSession = {
    id: requestId,                                   // opaque: a request id, a JWT jti, a socket id
    principal: { sub: 'alice', attributes: ['role:hr', 'dept:people'] },
    scopes: ['hr'],                                  // access scopes this session may open
    documentKey: true,                               // whether unlabelled encrypted content is open to it
};
```

| Field | Meaning |
| :--- | :--- |
| `id` | Recorded, never interpreted. Use whatever names the request on your side. |
| `principal.sub` | The subject writes are attributed to (`~createdBy`, `~updatedBy`). |
| `principal.attributes` | Informational, for triggers and jobs. The engine does not evaluate policies from it. |
| `scopes` | Scope ids the session may open. Content sealed under any other scope reads `null` and refuses writes. |
| `documentKey` | Whether content sealed under the stack's document key, unlabelled encrypted attributes, is open to this session. |

How a host decides `scopes` is its business, and there is one honest way to do it: the same way a device would. Mint the principal's attribute key from your identity model and attempt each scope with it. `decryptCek` from `@docstack/abe` returns `null` when the policy is not satisfied, and it costs about 24 ms per scope, so compute the set once per session and cache it keyed on the principal's attribute set. Recompute when a scope is rotated or the principal's attributes change.

```typescript
import { keygen, decryptCek } from '@docstack/abe';

const attributeKey = await keygen(msk, principal.attributes);
const scopes = [];
for (const scope of await stack.findDocuments({ '~class': '~AccessScope', active: true })) {
    if (await decryptCek(attributeKey, scope.abeWrappedCek)) scopes.push(scope.scopeId);
}
```

## 2. Open a view

```typescript
const view = stack.forSession(session);

view.session.scopes;          // ['hr'], frozen: a view cannot widen itself
view instanceof ClientStack;  // true
```

A view is cheap and holds no state of its own beyond the session and the classes it builds. One per request is the intended granularity.

## 3. What reads return

A row is what the session can read. A sealed field reads `null`; a document with nothing readable drops out; everything unencrypted reads as written, exactly as on a device whose key does not satisfy a scope.

```typescript
const { docs } = await view.findDocuments({ '~class': 'Salary' });
// { who: 'alice', amount: '100000', '~scope': 'hr' }   opened
// { who: 'bob',   amount: null,     '~scope': 'fin' }  sealed to this session

const { rows } = await view.query('SELECT who, amount FROM Salary');
await view.query('SELECT who FROM Salary WHERE amount = ?', '200000');   // no rows: the predicate sees null
for await (const row of view.queryStream('SELECT who FROM Salary')) { … }
await view.getDocument(bobId);                                            // amount: null
await view.db.get(bobId);                                                 // the same, through the handle
```

A predicate on an encrypted attribute is evaluated in memory after decryption, never in the index, so no `WHERE`, join or projection can match plaintext the session may not see. The live subscription is narrowed the same way: `view.subscribeClassDocs('Salary', target)` delivers change events with sealed fields as `null`.

## 4. What writes do

```typescript
await view.createDoc(null, 'Salary', salaryClass, { who: 'erin', amount: '2', '~scope': 'hr' });   // lands
await view.createDoc(null, 'Salary', salaryClass, { who: 'dave', amount: '1', '~scope': 'fin' });  // StackLockedError, scopeId: 'fin'
await view.deleteDocument(bobId);                                                                 // StackLockedError: bob is fin
```

- **Refusal.** A write labelled with a scope outside the session's entitlement, or unlabelled encrypted content when `documentKey` is `false`, throws `StackLockedError`, the same error a sealed scope raises on a device, because to the writer it is one. `deleteDocument` throws it too rather than answering `false`.
- **Attribution.** Every write through a view stamps `~updatedBy` with `principal.sub`, and a document's first write stamps `~createdBy`. Both are reserved fields, like `~scope`: a value the caller supplies is overwritten. A write with no session stamps nothing.
- **The pipeline is unchanged.** Validation, defaults, relation checks, encryption and triggers run exactly as for a direct write. The session only adds who is asking.

A `Class` built from the view routes through it:

```typescript
const salary = await view.getClass('Salary');
await salary.addCard({ who: 'frank', amount: '3', '~scope': 'fin' });   // StackLockedError
const cards = await salary.getCards();                                  // fin amounts read null
```

Classes built from a view never subscribe to their documents; a view is per request, and a live handle per request is a leak. `useClass`, `useClassDocs` and `useQuerySQL` against a view behave as they do against a stack.

## 5. Triggers and jobs see the session

A trigger body receives the session as its fourth argument; `undefined` on a write with no session. That is where "stamp the author" and "refuse unless a manager" live.

```typescript
await salaryClass.addTrigger('only-managers-raise', {
    name: 'only-managers-raise',
    order: 'before',
    run: `
        if (session && !session.principal.attributes.includes('role:manager') && document.amount !== undefined) {
            throw new Error('Only a manager may set an amount');
        }
        return document;
    `,
});
```

The same argument reaches a job's `execute(stack, params, job, session)`: from a trigger's `jobId` path automatically, and from `stack.jobEngine.executeJob(jobId, params, 'manual', view.session)` when you start one on a session's behalf. A scheduled run has no session.

Note what the argument is not: a sandbox. A trigger still receives the whole stack as its third argument and runs with the application's authority, as [Triggers](./triggers.md) states. The session tells trusted code who is asking; it does not constrain the code.

## 6. What a view will not do

Anything that belongs to the whole stack throws `StackSessionError`, naming the member: `authenticate`, `setAuthSession`, `clearAuthSession`, `unlock`, `unlockScopes`, `close`, `reset`, `sync`, `cancelSync`, `applyPatch`, `exportContent`, `importContent`, `beginTransaction`, `commit`, `discardTransaction`, `forSession`, and `db.destroy`, `db.close`, `db.compact`, `db.viewCleanup`. A view is one principal's window; letting it turn a key or close the database would change what every other session sees.

Transactions and content export under a session are closed rather than narrowed for now; both are recorded on the [roadmap](../contributing/roadmap.md).

## 7. What this does not do

- **It does not authenticate.** Who the principal is, and which scopes they satisfy, is decided before `forSession` is called, by your identity model and the authority that holds the master key. A session is the engine's honest execution of that decision.
- **It does not replace scopes.** On a device, denial is decryption failure and needs no session. Sessions exist for the host that holds keys for many people; the two agree on what each principal sees because the host decides entitlement with the same mathematics.
- **It does not hide shape.** Ids, classes, labels, counts and timestamps are visible to every session, as they are to every replica.
- **It does not narrow `stack.db`.** Only the view's handle is narrowed. Host code that reaches the stack directly reads with the whole keyring, which is what a host is for; keep request handling on the view.

## API summary

| Where | Member | Purpose |
| :--- | :--- | :--- |
| `@docstack/client` (type) | `StackSession` | `{ id, principal: { sub, attributes? }, scopes, documentKey }`. |
| `stack` | `forSession(session)` | The view. Returns `SessionView`, a `ClientStack` with a frozen `session`. |
| `view` | `findDocuments`, `findDocumentsIterator`, `getDocument`, `query`, `queryStream`, `subscribeClassDocs`, `subscribeDomainDocs`, `db.get` | Reads, narrowed to the session. |
| `view` | `createDoc`, `createDocs`, `deleteDocument`, `db.put`, `db.post`, `db.bulkDocs`, `db.remove` | Writes, attributed to the session and refused outside its scopes. |
| `view` | `getClass`, `getClassSnapshot` | Classes bound to the view, never subscribed. |
| Trigger body | fourth argument `session` | The session of the write, or `undefined`. |
| `execute(stack, params, job, session)` | fourth argument | The session the run was started under, or `undefined`. |
| `JobEngine` | `executeJob(id, params, triggerType, session?)` | Start a job on a session's behalf. |
| Fields | `~createdBy`, `~updatedBy` | Reserved; stamped on writes through a view. |
| Errors | `StackLockedError.scopeId`, `StackSessionError.member` | A refused write; a whole-stack member reached through a view. |
