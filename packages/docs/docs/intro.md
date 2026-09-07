---
title: "Introduction"
description: "DocStack is an offline-first embedded document database for the browser, with schemas, SQL, triggers, jobs, encryption, migrations, transactions and sync to any PouchDB-compatible remote."
slug: /
sidebar_position: 1
---

DocStack gives a document store the things applications actually need: **schemas and validation, business logic, access scopes, encryption and SQL**, without giving up the offline-first, replication-friendly nature that made document stores worth using.

The database runs **inside your application**, not behind a network call. Every read, every write, every validation and every query resolves locally, so your UI never waits on a server and never breaks when the connection does. When a remote is available, the whole database replicates to it, and that remote is whatever you hand it: a CouchDB endpoint, another DocStack instance, or the user's own Google Drive folder.

The other half of the idea: **logic is data**. Schemas, triggers, background jobs and migrations are documents in the database, not code in your bundle. Change a validation rule or a business process by writing a document. There is no redeploy, and the change replicates to every device like anything else.

## What you get

- **Offline-first by default.** The database is embedded. No round trip for a read, a write, a validation or a join. Works on a plane, in a basement, on a train. See [Offline-first and the sync model](./concepts/offline-first-and-sync.md).
- **SQL in the browser.** `SELECT`, `JOIN`, `GROUP BY`, subqueries, `ORDER BY … LIMIT`, with index pushdown and streaming scans. No hand-written map/reduce. See [Query with SQL](./guides/query-with-sql.md).
- **Logic as data.** Triggers and jobs live in the database as documents. Update behaviour at runtime; it replicates with the rest. See [Triggers](./guides/triggers.md) and [Jobs](./guides/jobs.md).
- **Field-level encryption.** Mark an attribute `encrypted` and it is ciphertext on disk *and on the remote*. Your sync target holds data it cannot read. See [Encrypt fields](./guides/encrypt-fields.md).
- **Access by scope.** Content belongs to a scope sealed under an attribute formula, and a session that does not satisfy the formula cannot produce the plaintext. Denial is decryption failure, not a check. See [Access control](./concepts/access-control/index.md).
- **Bring-your-own-remote sync.** `stack.sync({ remote })` against any PouchDB-compatible database. Transport-agnostic on purpose: DocStack never learns about your provider. See [Sync to a remote](./guides/sync.md).
- **Versioned schema patches.** Migrations as declarative documents with a semver ledger, applied once, all-or-nothing, and gated across devices so a trailing client cannot corrupt a leading one. See [Schema patches](./guides/patches.md).
- **Named write transactions.** Stage a multi-document change, read your own staged state, commit as one batch through the full pipeline, or discard it. See [Write transactions](./guides/transactions.md).
- **Live React bindings.** Every hook subscribes to the local database. No refetching, no cache invalidation, no staleness story to own. See [React bindings](./guides/react.md).

## How it works

1. **Open a stack.** `ClientStack.create('my-app')` opens a local database (IndexedDB in the browser) and applies any migrations it has not seen yet.
2. **Describe your data.** A class is a schema stored as a document. Define it in code with `Class.create` and `Attribute.create`, or ship it as a patch so every device installs the same model.
3. **Write through the pipeline.** `taskClass.add({ … })` validates, applies defaults, runs the class's triggers, checks relations and encrypts flagged fields before the document lands.
4. **Read locally, sync when you can.** Query with SQL or Mango selectors against local storage. When a remote is reachable, `stack.sync({ remote })` converges the two databases; documents that arrive over sync keep the same guarantees they had when they were written.

## A 60-second taste

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

// A local database, with named transactions enabled.
const stack = await ClientStack.create('my-app', { transactions: true });

// A class is a schema, and a document.
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
    // Re-renders whenever a Task changes, locally or arriving over sync.
    const { docs, loading } = useClassDocs('my-app', 'Task');
    if (loading) return <p>Loading…</p>;
    return <ul>{docs.map(t => <li key={t._id}>{t.title}</li>)}</ul>;
};
```

The [Quickstart](./get-started/quickstart.md) walks through both, including how to ship the schema as a patch.

## Who it's for

- **Offline-first field and mobile apps.** Data collection, point-of-sale, inspections, note-taking. Validation and business logic run without connectivity, and reconcile later.
- **Serverless personal apps with user-owned backup.** Sync to the user's *own* Drive. Multi-device sync and real backup with no server, no storage bill, and no custody of anyone's data. "We don't hold your data" becomes a feature rather than a compromise. See [Google Drive](./guides/google-drive.md).
- **Privacy-sensitive and regulated data.** Health notes, financial records, journals. Encrypted attributes are unreadable to the storage operator and to the sync remote.
- **Multi-tenant products and internal tools.** Give each tenant a scope sealed under its tenant attribute, and one deployment serves many tenants while one tenant's devices can hold, but never read, another's data. See [Secure architectures](./concepts/access-control/architectures.md).
- **Line-of-business admin tools.** Class-based modelling maps directly onto customer records, HR data and inventory; sensitive fields are encrypted and role-gated by scope rather than special-cased in application code.
- **Content and commerce workflows.** Triggers and jobs express "when this happens, do that" declaratively: recalculate an invoice total before save, queue a confirmation after checkout, re-index a post after publish.
- **Analytics and reporting surfaces.** The SQL engine lets support staff and analysts query joined, filtered data without a bespoke reporting API.

## Packages

| Package | What it is | Status |
| :--- | :--- | :--- |
| [`@docstack/client`](https://www.npmjs.com/package/@docstack/client) | The engine: schema, SQL, triggers, jobs, encryption, patches, transactions, sync. Runs in the browser. | 0.2.0 on npm |
| [`@docstack/react`](https://www.npmjs.com/package/@docstack/react) | Provider and live hooks over the client. Every query is a subscription. | 0.1.1 on npm |
| [`@docstack/pouchdb-adapter-googledrive`](https://www.npmjs.com/package/@docstack/pouchdb-adapter-googledrive) | The user's own Google Drive folder as a PouchDB remote. Maintained in [its own repository](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive). | 0.1.9 on npm |
| [Workbench](pathname:///app/index.html) | Browse a database, edit its schema, run queries and view the entity-relation diagram, in the browser. | Hosted application |
| `@docstack/server` | The same engine deployed server-side: a sync hub, shared workspaces, server-side jobs. | Preview, not published |

`@docstack/shared` carries the types and abstract bases the packages share. It is internal; you rarely import it directly.

## Architecture at a glance

| Engine | Responsibility |
| :--- | :--- |
| **Core DB** | PouchDB storage and the CouchDB replication protocol |
| **Schema Engine** | Zod-backed validation, class hydration, schema propagation |
| **Query Engine** | SQL parser, planner and executor: joins, aggregation, pushdown, streaming |
| **Job Engine** | Background jobs and the unattended scheduler |
| **Crypto Engine** | AES-GCM field-level encryption under an application-supplied key |
| **Access control** | Scopes sealed under attribute formulas, beside the crypto engine |
| **Transaction Engine** | Staged multi-document writes, overlay reads, one-batch commit |
| **Sync Layer** | Lifecycle, replication filters, convergence state, the schema gate |

The [Concepts](./concepts/core-concepts.md) section explains each one; the decisions behind them are recorded as [architecture decision records](./contributing/decision-records.md).

## Status

Pre-1.0 and moving. `@docstack/client` and `@docstack/react` are published and in production use; the workbench is an application you visit rather than install; `@docstack/server` is a preview of the same engine deployed server-side. The [roadmap](./contributing/roadmap.md) lists what is accepted but not yet built.

## Where next

- [Installation](./get-started/installation.md), then the [Quickstart](./get-started/quickstart.md).
- The [Guides](./guides/model-your-data.md) for task-shaped answers.
- The [Concepts](./concepts/core-concepts.md) for how the engines fit together.
- The [Reference](./reference/class-and-attribute-options.md) for every option, and the generated [API reference](/docs/api/client/).
