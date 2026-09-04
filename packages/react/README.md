[![npm](https://img.shields.io/npm/v/@docstack/react)](https://www.npmjs.com/package/@docstack/react)
[![Docs](https://img.shields.io/badge/docs-onyx--og.github.io-blue)](https://onyx-og.github.io/docstack/)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](https://github.com/onyx-og/docstack/blob/main/LICENSE.md)

# @docstack/react

**React bindings for [DocStack](https://github.com/onyx-og/docstack) — an offline-first embedded database with schemas, SQL, policies and encryption.**

A provider that owns the database lifecycle, and hooks that are **live by default**. Every hook subscribes to the local database, so when a document changes — because the user edited it, because a background job wrote it, or because it arrived over sync — the components reading it re-render. There is no fetching layer, no cache to invalidate, and no staleness to reason about.

---

## 📦 Installation

```bash
npm install @docstack/react @docstack/client pouchdb-browser pouchdb-find
```

React 19 is a peer dependency. `pouchdb-browser` and `pouchdb-find` are peers of `@docstack/client`.

## 🚀 Why hooks instead of a data layer

In a typical React app, "data" means a server, a client cache, and the machinery between them — query keys, invalidation, refetch intervals, optimistic updates and rollback.

DocStack removes the server from that path. The database is in the browser, so:

* **A query is a subscription.** `useClassDocs`, `useQuerySQL`, `useFind` and the domain hooks all re-run when the data they read changes. Nothing to invalidate.
* **Writes are immediate and already true.** `classObj.add(...)` returns after the document has landed locally. There is no optimistic state to reconcile, because the write is not a request.
* **`useQuerySQL` watches the right things.** It derives which classes to subscribe to from the query's own AST, so a `JOIN` across three classes re-runs when any of the three changes — and bursts coalesce into one re-run (150 ms by default).
* **Offline is not a state you handle.** Components render from local storage. Sync status is something you *display* (`useSyncStatus`), not something a read has to survive.

## ⚡ Quick start

### 1. Mount the provider

`StackProvider` builds the DocStack instance, opens each configured database, and applies the schema patches it is given. It reconciles when `config` changes: a stack added to the array is opened, one removed is closed.

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

Each entry accepts everything `ClientStack` accepts — `patches`, `documentKey`, `transactions`, `logLevel`, `plugins`, `credentials`.

### 2. Read — and stay live

```tsx
import { useClassDocs } from '@docstack/react';

const TodoList = () => {
    const { docs, loading } = useClassDocs('my-app', 'Todo');

    if (loading) return <p>Loading…</p>;

    return (
        <ul>
            {docs.map(todo => (
                <li key={todo._id}>{todo.title} {todo.completed ? '✅' : '⭕'}</li>
            ))}
        </ul>
    );
};
```

Pass a Mango selector as the third argument to narrow it: `useClassDocs('my-app', 'Todo', { completed: { $eq: false } })`.

### 3. Write

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

### 4. SQL, live

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

    return <ul>{result.rows.map(r => <li key={r.title}>{r.title} — {r.project}</li>)}</ul>;
};
```

**Params are an array**, and the query is live. For a deliberate one-shot read, say so at the call site: `useQuerySQL(stack, sql, [today], { live: false })`.

### 5. Show sync state honestly

```tsx
import { useSyncStatus } from '@docstack/react';

const SyncBadge = ({ stack }: { stack: string }) => {
    const status = useSyncStatus(stack)[stack];

    if (!status) return <span>Not syncing</span>;
    if (status.state === 'error') return <span>Offline — retrying</span>;
    return <span>Synced {status.lastConvergedAt ? timeAgo(status.lastConvergedAt) : 'never'}</span>;
};
```

`lastConvergedAt` is the value to render as "last synced" — it marks a cycle that finished with nothing left to send. `lastActiveAt` only says documents moved, which is not the same promise.

The subscription is on the stacks rather than on the replication handles, so it survives a `handle.restart()` (a refreshed credential, say) and works whether it mounts before or after `sync()` was called.

## 📚 API reference

### `<StackProvider />`

| Prop | Type | Description |
|---|---|---|
| `config` | `StackConfig[]` | Stacks to open. A string is the database name; an object accepts every `ClientStack` option (`name`, `patches`, `documentKey`, `transactions`, `logLevel`, `plugins`, `credentials`). Reconciled on change. |
| `credentials` | `ClientCredentials \| ClientCredentials[]` | One credential for every stack, or one per config entry. Merged into the configs it applies to. |
| `destroyRemovedStacks` | `boolean` | Delete the underlying database when a stack drops out of `config`. Defaults to `false` — a workspace that disappears from the configuration is closed, not erased. |

The context publishes `null` until the instance is ready. That window is startup, not a missing provider — every hook handles it, and `useDocStack()` returning `null` is the signal to render a splash rather than an error.

### Hooks

| Hook | Signature | Returns |
|---|---|---|
| `useDocStack` | `()` | The `DocStack` instance, or `null` during startup |
| `useClassDocs` | `(stack, className, query?)` | `{ docs, loading, error }` — live documents of a class, optionally filtered by a Mango selector |
| `useClass` | `(stack, className)` | `{ classObj, loading, error }` — the `Class` instance, for `add` / `updateCard` / `addTrigger` |
| `useClassList` | `(stack, selector)` | `{ classList, loading, error }` — the classes defined in the database |
| `useClassCreate` | `(stack)` | `(className, description?) => Promise<Class>` |
| `useQuerySQL` | `(stack, sql, params?, options?)` | `{ result, loading, error, refetch }` — `result.rows` and `result.ast`. Live unless `{ live: false }`; `{ coalesceMs }` defaults to 150 |
| `useFind` | `(stack, { selector, fields? }, sort?, limit?)` | `{ docs, loading, error }` — Mango query; `limit` defaults to 50 |
| `useSyncStatus` | `(stackName?)` | `Record<string, SyncStatus>` — one stack, or every open stack |
| `useDomain` | `(stack, domainName)` | `{ domain, loading, error }` |
| `useDomainList` | `(stack, selector)` | `{ domainList, loading, error }` |
| `useDomainRelations` | `(stack, domainName, query?)` | `{ docs, loading, error }` — live relation documents |
| `useDomainCreate` | `(stack)` | `(name, cardinality, sourceClass, targetClass, description?) => Promise<Domain>` |

The package also re-exports DocStack's document-modelling types (`Patch`, `ClassModel`, `AttributeModel`, `Document`, `SyncStatus`, `StackConfig`, …) — sourced from `@docstack/client` so a consumer using both never ends up holding two structurally identical but distinct copies of `Patch`.

## 🧩 Patterns

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

Every hook takes the stack name as its first argument, so switching workspaces is a prop change — not a remount, and not a second `DocStack` instance racing the first.

**Snapshots where you mean them.** A report that should not shift under the reader wants `{ live: false }`. Say it at the call site so the next reader knows it was a decision.

**Reach for the client when hooks aren't the right shape.** `useDocStack()` gives you the full instance — `getStack(name)` for transactions, exports, job execution or `sync()`.

## 🔍 How it compares

If you have used `useLiveQuery` in [Dexie](https://dexie.org/) or the reactive queries in [RxDB](https://rxdb.info/), the reactivity model here will feel familiar: a query that re-runs when its data changes, backed by local storage.

What differs is what sits underneath the hook. A `useQuerySQL` call resolves against an engine that already applies schema validation, access policies and field-level decryption, and the SQL it runs supports joins, aggregation and subqueries rather than a selector API. And because DocStack replicates to any PouchDB-compatible remote — including a folder in the end user's own Google Drive — `useSyncStatus` can describe a sync you never had to run a server for.

## 📖 Documentation

* [Full documentation](https://onyx-og.github.io/docstack/)
* [@docstack/client](https://github.com/onyx-og/docstack/blob/main/packages/client/README.md) — the engine these hooks wrap
* [Architecture decisions](https://github.com/onyx-og/docstack/tree/main/specs/adr) — including [ADR-0025](https://github.com/onyx-og/docstack/blob/main/specs/adr/0025-live-usequerysql.md) on live `useQuerySQL` and [ADR-0035](https://github.com/onyx-og/docstack/blob/main/specs/adr/0035-react-usefind-never-applies-an-empty-result.md) on `useFind` result ordering
* [Contributing](https://github.com/onyx-og/docstack/blob/main/CONTRIBUTING.md)

## License

[CC-BY-SA-4.0](https://github.com/onyx-og/docstack/blob/main/LICENSE.md) · © Onyx AC, LLC
