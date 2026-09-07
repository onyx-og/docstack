---
title: "React bindings"
description: "Mount the provider that owns the database lifecycle and use hooks that are live by default, so components re-render when the data they read changes, locally or over sync."
sidebar_position: 10
---

`@docstack/react` is a provider that owns the database lifecycle, and hooks that are **live by default**. Every hook subscribes to the local database, so when a document changes, because the user edited it, because a background job wrote it, or because it arrived over sync, the components reading it re-render. There is no fetching layer, no cache to invalidate, and no staleness to reason about.

```bash
npm install @docstack/react @docstack/client pouchdb-browser pouchdb-find
```

React 19 is a peer dependency.

## Why hooks instead of a data layer

In a typical React app, "data" means a server, a client cache, and the machinery between them: query keys, invalidation, refetch intervals, optimistic updates and rollback. DocStack removes the server from that path. The database is in the browser, so:

- **A query is a subscription.** `useClassDocs`, `useQuerySQL`, `useFind` and the domain hooks all re-run when the data they read changes. Nothing to invalidate.
- **Writes are immediate and already true.** `classObj.add(...)` returns after the document has landed locally. There is no optimistic state to reconcile, because the write is not a request.
- **`useQuerySQL` watches the right things.** It derives which classes to subscribe to from the query's own AST, so a `JOIN` across three classes re-runs when any of the three changes, and bursts coalesce into one re-run.
- **Offline is not a state you handle.** Components render from local storage. Sync status is something you *display* (`useSyncStatus`), not something a read has to survive.

## 1. Mount the provider

`StackProvider` builds the DocStack instance, opens each configured database, and applies the schema patches it is given. It reconciles when `config` changes: a stack added to the array is opened, one removed is closed, and the rest keep running.

```tsx
import { StackProvider } from '@docstack/react';

const PATCHES = [{
    '~class': 'patch',
    _id: 'my-app-0.1.0',
    version: '0.1.0',
    target: 'my-app',
    changelog: 'Add the Todo class.',
    active: true,
    docs: [{
        '~class': 'class',
        _id: 'Todo',
        name: 'Todo',
        schema: {
            title: { name: 'title', type: 'string', config: { mandatory: true } },
            completed: { name: 'completed', type: 'boolean', config: { defaultValue: false } },
        },
    }],
}];

const App = () => (
    <StackProvider config={[{ name: 'my-app', patches: PATCHES }]}>
        <TodoList />
    </StackProvider>
);
```

| Prop | Type | Description |
| :--- | :--- | :--- |
| `config` | `StackConfig[]` | Stacks to open. A string is the database name; an object accepts every `ClientStack` option: `name`, `patches`, `documentKey`, `transactions`, `logLevel`, `plugins`, `credentials`, and PouchDB options such as `adapter`. Reconciled on change. |
| `credentials` | `ClientCredentials` or an array | One credential for every stack, or one per config entry. Merged into the configs it applies to. |
| `destroyRemovedStacks` | `boolean` | Delete the underlying database when a stack drops out of `config`. Defaults to `false`: a workspace that disappears from the configuration is closed, not erased. |

The context publishes `null` until the instance is ready. That window is startup, not a missing provider: every hook keeps `loading: true` through it, and `useDocStack()` returning `null` is the signal to render a splash rather than an error.

## 2. Read, and stay live

```tsx
import { useClassDocs } from '@docstack/react';

const TodoList = () => {
    const { docs, loading } = useClassDocs('my-app', 'Todo');
    if (loading) return <p>Loading…</p>;
    return (
        <ul>
            {docs.map(todo => <li key={todo._id}>{todo.title} {todo.completed ? '✓' : '○'}</li>)}
        </ul>
    );
};
```

Pass a Mango selector as the third argument to narrow it: `useClassDocs('my-app', 'Todo', { completed: { $eq: false } })`.

## 3. Write

```tsx
import { useState } from 'react';
import { useClass } from '@docstack/react';

const AddTodo = () => {
    const { classObj: todoClass } = useClass('my-app', 'Todo');
    const [title, setTitle] = useState('');

    const handleAdd = async () => {
        if (!todoClass || !title) return;
        await todoClass.add({ title, completed: false });
        setTitle('');   // the list above updates itself
    };

    return (
        <>
            <input value={title} onChange={e => setTitle(e.target.value)} />
            <button onClick={handleAdd}>Add</button>
        </>
    );
};
```

`useClass` hands you the `Class` instance, so `add`, `updateCard`, `deleteCard` and `addTrigger` are all one call away.

## 4. SQL, live

```tsx
import { useQuerySQL } from '@docstack/react';

const Overdue = ({ today }: { today: string }) => {
    const { result, loading, error } = useQuerySQL(
        'my-app',
        `SELECT t.title, p.name AS project
         FROM Todo AS t
         JOIN Project AS p ON p._id = t.projectId
         WHERE t.completed = false AND t.dueDate < ?
         ORDER BY t.dueDate`,
        [today],
    );

    if (loading) return <p>Loading…</p>;
    if (error) return <p>Query failed</p>;
    return <ul>{result.rows.map(r => <li key={r.title}>{r.title}: {r.project}</li>)}</ul>;
};
```

**Params are an array**, and the query is live: the hook subscribes to every class the statement reads and coalesces a burst of changes into one re-run (150 ms by default, `coalesceMs`). For a deliberate one-shot read, say so at the call site: `useQuerySQL(stack, sql, [today], { live: false })`. The hook also returns `refetch`.

## 5. Show sync state honestly

```tsx
import { useSyncStatus } from '@docstack/react';

const SyncBadge = ({ stack }: { stack: string }) => {
    const status = useSyncStatus(stack)[stack];
    if (!status) return <span>Not syncing</span>;
    if (status.state === 'error') return <span>Offline, retrying</span>;
    return <span>Synced {status.lastConvergedAt ? timeAgo(status.lastConvergedAt) : 'never'}</span>;
};
```

`lastConvergedAt` is the value to render as "last synced": it marks a cycle that finished with nothing left to send. `lastActiveAt` only says documents moved, which is not the same promise. The subscription is on the stacks rather than on the replication handles, so it survives a `handle.restart()` and works whether it mounts before or after `sync()` was called. Call `useSyncStatus()` with no argument for every open stack.

## The hooks

| Hook | Signature | Returns |
| :--- | :--- | :--- |
| `useDocStack` | `()` | The `DocStack` instance, or `null` during startup |
| `useClassDocs` | `(stack, className, query?)` | `{ docs, loading, error }`: live documents of a class, optionally filtered by a Mango selector |
| `useClass` | `(stack, className)` | `{ classObj, loading, error }`: the `Class` instance |
| `useClassList` | `(stack, selector)` | `{ classList, loading, error }`: the classes defined in the database |
| `useClassCreate` | `(stack)` | `(className, description?) => Promise<Class>` |
| `useQuerySQL` | `(stack, sql, params?, options?)` | `{ result, loading, error, refetch }` with `result.rows` and `result.ast`. Live unless `{ live: false }`; `coalesceMs` defaults to 150 |
| `useFind` | `(stack, { selector, fields? })` | `{ docs, loading, error }`: a Mango query, re-run when its class changes. An empty result is applied like any other. |
| `useSyncStatus` | `(stackName?)` | `Record<string, SyncStatus>`: one stack, or every open stack |
| `useDomain` | `(stack, domainName)` | `{ domain, loading, error }` |
| `useDomainList` | `(stack, selector)` | `{ domainList, loading, error }` |
| `useDomainRelations` | `(stack, domainName, query?)` | `{ docs, loading, error }`: live relation documents |
| `useDomainCreate` | `(stack)` | `(name, cardinality, sourceClass, targetClass, description?) => Promise<Domain>` |

`useFind` also accepts `sort` and `limit` arguments; in 0.1.1 they are accepted but not applied to the query. Sort and slice the returned `docs`, or use `useQuerySQL` with `ORDER BY` and `LIMIT`.

The package re-exports DocStack's document-modelling types (`Patch`, `ClassModel`, `AttributeModel`, `Document`, `SyncStatus`, `StackConfig` and the rest), sourced from `@docstack/client` so a consumer using both never holds two structurally identical but distinct copies of a type.

## Patterns

**Gate on readiness, not on loading.** `useDocStack()` is `null` until the provider finishes opening its databases:

```tsx
const Root = () => {
    const docstack = useDocStack();
    if (!docstack) return <Splash />;
    return <App />;
};
```

**A database per workspace.** `config` is an array, so multiple databases are the normal case, not a workaround. Give each workspace its own stack and pass the active one's name down:

```tsx
<StackProvider config={workspaces.map(w => ({ name: w.stackName, patches: WORKSPACE_PATCHES }))}>
    <Workspace stackName={active.stackName} />
</StackProvider>
```

Every hook takes the stack name as its first argument, so switching workspaces is a prop change, not a remount and not a second `DocStack` instance racing the first. A workspace added to `config` at runtime is opened, joins a running `docstack.sync()`, and is closed when it leaves.

**Snapshots where you mean them.** A report that should not shift under the reader wants `{ live: false }`. Say it at the call site so the next reader knows it was a decision.

**Reach for the client when hooks aren't the right shape.** `useDocStack()` gives you the full instance: `getStack(name)` for transactions, exports, job execution or `sync()`.

The generated [API reference](/docs/api/react/) lists every export with its signature.
