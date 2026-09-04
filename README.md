<div align="center">

# DocStack

**One does not simply stack documents.**

A document data layer for storing, managing and consuming application data — offline-friendly by construction, sync-friendly by design.

[![npm client](https://img.shields.io/npm/v/@docstack/client?label=%40docstack%2Fclient)](https://www.npmjs.com/package/@docstack/client)
[![npm react](https://img.shields.io/npm/v/@docstack/react?label=%40docstack%2Freact)](https://www.npmjs.com/package/@docstack/react)
[![Docs](https://img.shields.io/badge/docs-onyx--og.github.io-blue)](https://onyx-og.github.io/docstack/)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](LICENSE.md)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=4QSQ8L9AK2C74)

[Documentation](https://onyx-og.github.io/docstack/) · [Live workbench](https://onyx-og.github.io/docstack/app/index.html) · [Client](packages/client/README.md) · [React](packages/react/README.md)

</div>

---

## What is DocStack?

DocStack gives a document store the things applications actually need — **schemas and validation, business logic, access control, encryption and SQL** — without giving up the offline-first, replication-friendly nature that made document stores worth using.

The database runs **inside your application**, not behind a network call. Every read, every write, every validation and every query resolves locally, so your UI never waits on a server and never breaks when the connection does. When a remote is available, the whole database replicates to it — and that remote is *whatever you hand it*: a CouchDB endpoint, another DocStack node, or the user's own Google Drive folder.

The other half of the idea: **logic is data**. Schemas, triggers, background jobs and access policies are documents in the database, not code in your bundle. Change a validation rule or a business process by writing a document — no redeploy, and the change replicates to every device like anything else.

## Why DocStack

* **⚡ Offline-first by default** — the database is embedded. No round trip for a read, a write, a validation or a join. Works on a plane, in a basement, on a train.
* **🔍 SQL in the browser** — `SELECT`, `JOIN`, `GROUP BY`, subqueries, `ORDER BY … LIMIT`, with index pushdown and streaming scans. No hand-written map/reduce.
* **🧠 Logic as data** — triggers, jobs and policies live in the database as documents. Update behaviour at runtime; it replicates with the rest.
* **🔐 Field-level encryption** — mark an attribute `encrypted` and it is ciphertext on disk *and on the remote*. Your sync target holds data it cannot read.
* **🔄 Bring-your-own-remote sync** — `stack.sync({ remote })` against any PouchDB-compatible database. Transport-agnostic on purpose: DocStack never learns about your provider.
* **📦 Versioned schema patches** — migrations as declarative documents with a semver ledger, applied once, all-or-nothing, gated across devices so a trailing client can't corrupt a leading one.
* **🧾 Named write transactions** — stage a multi-document change, read your own staged state, commit as one batch through the full pipeline, or discard it.
* **⚛️ Live React bindings** — every hook subscribes to the local database. No refetching, no cache invalidation, no staleness story to own.

## A 60-second taste

Define a model and query it — all locally, no server:

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

// A local database, with named transactions enabled.
const stack = await ClientStack.create('my-app', { transactions: true });

// A class is a schema — and a document.
const taskClass = await Class.create(stack, 'Task', 'class', 'User tasks');
await Attribute.create(taskClass, 'title', 'string', 'Title', { mandatory: true });
await Attribute.create(taskClass, 'priority', 'string', 'Priority');
await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });

await taskClass.add({ title: 'Install DocStack', priority: 'high' });

// SQL, against the browser's own storage.
const { rows } = await stack.query(
    `SELECT title FROM Task WHERE priority = ? AND isComplete = false ORDER BY title`,
    'high'
);
```

Wire it into React, and the list stays live:

```tsx
import { StackProvider, useClassDocs } from '@docstack/react';

const App = () => (
    <StackProvider config={[{ name: 'my-app', patches: SCHEMA }]}>
        <TaskList />
    </StackProvider>
);

const TaskList = () => {
    // Re-renders whenever a Task changes — locally or arriving over sync.
    const { docs, loading } = useClassDocs('my-app', 'Task');
    if (loading) return <p>Loading…</p>;
    return <ul>{docs.map(t => <li key={t._id}>{t.title}</li>)}</ul>;
};
```

## Who it's for

* **Offline-first field and mobile apps** — data collection, point-of-sale, inspections, note-taking. Validation and business logic run without connectivity, and reconcile later.
* **Serverless personal apps with user-owned backup** — sync to the user's *own* Drive. Multi-device sync and real backup with no server, no storage bill, and no custody of anyone's data. "We don't hold your data" becomes a feature rather than a compromise.
* **Privacy-sensitive and regulated data** — health notes, financial records, journals. Encrypted attributes are unreadable to the storage operator and to the sync remote.
* **Multi-tenant SaaS and internal tools** — policies are documents scoped by group and user, so one deployment serves many tenants without per-tenant application code.
* **Analytics and reporting surfaces** — the SQL engine lets support staff and analysts query joined, filtered data without a bespoke reporting API.

## Packages

| Package | What it is | Status |
|---|---|---|
| **[@docstack/client](packages/client/README.md)** | The engine: schema, SQL, triggers, jobs, policies, encryption, patches, transactions, sync. Runs in the browser. | [![npm](https://img.shields.io/npm/v/@docstack/client)](https://www.npmjs.com/package/@docstack/client) |
| **[@docstack/react](packages/react/README.md)** | Provider and live hooks over the client. Every query is a subscription. | [![npm](https://img.shields.io/npm/v/@docstack/react)](https://www.npmjs.com/package/@docstack/react) |
| **[@docstack/ui](packages/ui/README.md)** | The workbench: browse a database, edit schema, run queries, view the ER diagram. | [Live app](https://onyx-og.github.io/docstack/app/index.html) |
| **[@docstack/server](packages/server/README.md)** | The same engine deployed server-side — sync hub, shared workspaces, server-side jobs. | Preview |

### Companion packages

**[@docstack/pouchdb-adapter-googledrive](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive)** — [![npm](https://img.shields.io/npm/v/@docstack/pouchdb-adapter-googledrive)](https://www.npmjs.com/package/@docstack/pouchdb-adapter-googledrive) · turns a user's Google Drive folder into a PouchDB remote, which is what makes the serverless pitch real. Append-only log for fast, conflict-free writes; lazy loading (only the index is held in memory, bodies are fetched on demand); multi-writer safe; auto-compaction; and no `googleapis` dependency, so it runs in browsers, Node 18+ and edge runtimes alike.

`@docstack/shared` — types and abstract bases shared across the packages. Internal; you rarely import it directly.

## Architecture at a glance

| Engine | Responsibility |
|---|---|
| **Core DB** | PouchDB storage and replication protocol |
| **Schema Engine** | Zod-backed validation, class hydration, schema propagation |
| **Query Engine** | SQL parser, planner and executor — joins, aggregation, pushdown, streaming |
| **Job Engine** | Background jobs and the unattended scheduler |
| **Crypto Engine** | Key derivation (PBKDF2) and AES-GCM field-level encryption |
| **Policy Engine** | Rule-based read/write access, per class and per session |
| **Transaction Engine** | Staged multi-document writes, overlay reads, one-batch commit |
| **Sync Layer** | Lifecycle, replication filters, convergence state, the schema gate |

Full architecture notes live in the [documentation](https://onyx-og.github.io/docstack/docs/architecture/core-concepts); the decisions behind them are recorded as ADRs in [`specs/adr/`](specs/adr/).

## Status

Pre-1.0 and moving. `@docstack/client` and `@docstack/react` are published and in production use; `@docstack/ui` is an application you run or visit rather than install; `@docstack/server` is a preview of the same engine deployed server-side.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to run each package's suite and what a reviewable PR looks like.

## License

[CC-BY-SA-4.0](LICENSE.md) · © Onyx AC, LLC
