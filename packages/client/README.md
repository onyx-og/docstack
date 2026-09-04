[![npm](https://img.shields.io/npm/v/@docstack/client)](https://www.npmjs.com/package/@docstack/client)
[![Docs](https://img.shields.io/badge/docs-onyx--og.github.io-blue)](https://onyx-og.github.io/docstack/)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](https://github.com/onyx-og/docstack/blob/main/LICENSE.md)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=4QSQ8L9AK2C74)

# @docstack/client

**One does not simply stack documents.**

An **offline-first embedded database for the browser**, built on PouchDB and IndexedDB. It brings the things you would otherwise build yourself — **schema validation, a SQL query engine, triggers, background jobs, role-based access policies, field-level encryption, versioned migrations and named write transactions** — into the client, where your application actually runs. When a connection exists, everything replicates to any PouchDB- or CouchDB-compatible remote, including the user's own Google Drive.

No server required. No network round trip on the read path. TypeScript throughout.

---

## 🚀 Why DocStack

### What it means for the people using your app

* **It works with no connection.** Not "degrades gracefully" — works. Reads, writes, validation, joins and business rules all resolve against local storage, so there is no spinner waiting on a server and no failure mode when the train enters a tunnel.
* **It is instant.** The database is in the same process as the UI. Writes land in single-digit milliseconds, so optimistic-update machinery becomes unnecessary: the update *is* the write.
* **Their data can stay theirs.** Sync to the user's own Google Drive folder and the application never holds their records at all — while encrypted attributes stay unreadable even to the storage provider.

### What it means for you building it

* **Skip the backend for a whole class of app.** Validation, access control, migrations and background work usually justify a server. Here they are engine features, so a genuinely useful application can ship with no backend to run, secure, scale or pay for.
* **Logic as data.** Triggers, jobs and policies are documents. Change a validation rule or a business process by writing a document — no redeploy, and the change replicates to every device like any other data.
* **Migrations you can trust.** Schema changes are declarative patch documents with a semver ledger: applied exactly once, all-or-nothing, and gated at sync so a device with an older model cannot pull documents its schema can't describe.
* **Encryption you don't have to hand-roll.** Mark an attribute `encrypted` and it is ciphertext on disk and on the remote, transparently decrypted on read for the session that holds the key.
* **SQL instead of map/reduce.** Joins, aggregation, subqueries and pagination against local documents, with index pushdown where the planner can prove it is safe.

## 📦 Installation

```bash
npm install @docstack/client pouchdb-browser pouchdb-find
```

`pouchdb-browser` and `pouchdb-find` are **peer dependencies** — DocStack does not bundle the storage layer, so you control its version.

## ⚡ Quick start

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

// 1. Open a local database. It is created on first use.
const stack = await ClientStack.create('my-app');

// 2. Define a class — a schema, stored as a document.
const taskClass = await Class.create(stack, 'Task', 'class', 'User tasks');

// 3. Give it attributes.
await Attribute.create(taskClass, 'title', 'string', 'Task title', { mandatory: true });
await Attribute.create(taskClass, 'priority', 'string', 'Priority');
await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });

// 4. Write. Validation, defaults and triggers all run here.
const task = await taskClass.add({ title: 'Install DocStack', priority: 'high' });

// 5. Read it back with SQL.
const { rows } = await stack.query('SELECT title FROM Task WHERE isComplete = false');
```

Building a React app? [`@docstack/react`](https://github.com/onyx-og/docstack/blob/main/packages/react/README.md) wraps all of this in a provider and live hooks.

## 📚 Features

### 1. SQL against local documents

The query engine parses SQL, plans it against the available indexes, and executes what it cannot push down in memory.

```typescript
// Joins, filtering and ordering
const { rows } = await stack.query(`
    SELECT t.title, u.username AS assignee
    FROM Task AS t
    JOIN User AS u ON u._id = t.assigneeId
    WHERE t.priority = 'high' AND t.isComplete = false
    ORDER BY t.createdAt DESC
    LIMIT 20
`);

// Placeholders are positional
const { rows: mine } = await stack.query(
    'SELECT * FROM Task WHERE assigneeId = ? AND priority = ?',
    currentUserId, 'high'
);

// Aggregation and subqueries
const { rows: busy } = await stack.query(`
    SELECT assigneeId, COUNT(*) AS open
    FROM Task
    WHERE isComplete = false AND assigneeId IN (SELECT _id FROM User WHERE active = true)
    GROUP BY assigneeId
    HAVING COUNT(*) > 5
`);
```

`WHERE`, `ORDER BY … LIMIT` and range predicates push down into the index where the planner can prove the result is identical; encryption and policies are consulted first, because a filter applied to ciphertext would answer the wrong question.

For results too large to materialise, stream them — the scan pages by keyset and stops early when a `LIMIT` is satisfied:

```typescript
for await (const doc of stack.findDocumentsIterator({ '~class': 'Task' })) {
    process(doc);
}
```

### 2. Schema migrations as patches

A patch is a document describing a versioned change. Hand the chain to the stack at open time and it applies whatever this device has not seen yet — in order, exactly once, recorded in a ledger.

```typescript
const PATCHES = [
    {
        '~class': 'patch',
        _id: 'my-app-0.1.0',
        version: '0.1.0',
        target: 'my-app',
        changelog: 'Add the Task class.',
        active: true,
        docs: [{
            '~class': 'class',
            _id: 'Task',
            name: 'Task',
            description: 'A user task',
            schema: {
                title: { name: 'title', type: 'string', config: { mandatory: true } },
                isComplete: { name: 'isComplete', type: 'boolean', config: { defaultValue: false } },
            },
        }],
    },
    {
        '~class': 'patch',
        _id: 'my-app-0.2.0',
        version: '0.2.0',
        target: 'my-app',
        changelog: 'Tasks carry a priority.',
        active: true,
        docs: [{
            '~class': 'class',
            _id: 'Task',
            name: 'Task',
            schema: {
                priority: { name: 'priority', type: 'enum', config: { values: [{ value: 'low' }, { value: 'high' }] } },
            },
        }],
    },
];

const stack = await ClientStack.create('my-app', { patches: PATCHES });
```

The second patch **merges** into the class rather than replacing it, so a chain composes into one schema. The whole pending chain applies through a single internal transaction: if patch N+1 is invalid, nothing from the chain persists and the error names the patch, class and attribute at fault. A patch can also carry one-shot migration jobs that massage data in the same commit as the model change.

### 3. Sync to anything

Replication is transport-agnostic on purpose: `remote` is whatever PouchDB database you hand over, so DocStack never learns about your provider and you never pay for a transport you don't use.

```typescript
const handle = await stack.sync({
    remote: 'https://example.com/my-app',   // a URL, a PouchDB instance, or a resolver function
    direction: 'both',                       // default
    live: true,                              // default: keep following changes
    classes: { exclude: ['Draft'] },         // what travels
});

handle.addEventListener('sync-status', () => {
    const status = stack.getSyncStatus();
    // `lastConvergedAt` is the honest "last synced": a cycle finished with nothing
    // left to send. `lastActiveAt` only says documents moved.
    render(status.state, status.lastConvergedAt);
});
```

DocStack's own internal documents stay on the device by default, and a **schema gate** compares the system and consumer patch versions on both sides before anything replicates — a device whose model is behind refuses with `SyncSchemaMismatchError` rather than pulling documents it cannot describe.

Classes can opt out of replication entirely by being declared `ephemeral` (documents describe *this run of this client*, and are emptied when the stack next opens — logs, caches, drafts).

Running many databases? `DocStack.sync()` binds them all through one handle, resolving a remote per stack:

```typescript
await docstack.sync({
    remote: (stack) => new PouchDB(`https://example.com/${stack.name}`),
});
```

### 4. Named write transactions

Opt in per stack. A handle stages validated writes in memory; reads through the handle see the staged state overlaid on committed state; commit flushes the journal as **one batch** through the full authoring pipeline.

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

A write that fails validation, policy or the locked-stack check stages nothing, and a batch with one bad document unwinds entirely. Commit re-runs that sweep against the current world and refuses with `TransactionConflictError` if a document changed underneath — persisting nothing and leaving the transaction open to retry.

**Atomicity is reported, not assumed.** Every commit report carries the storage adapter's honest answer in `adapter.atomicBatch`: adapters that commit a batch as one storage transaction report `true`; on IndexedDB, results are per-document, and a revision pre-flight shrinks — but does not eliminate — the window. A partial commit leaves `status: "partial"` with only the failed entries retained, so a raced document conflicts on retry instead of being silently overwritten.

Uncommitted stages are memory-only: `close()`, `reset()` and a page reload discard them. Uncommitted means not real.

### 5. Triggers

Small pieces of JavaScript attached to a class, stored as data and hydrated at runtime. They run before or after a document operation.

```typescript
await blogPostClass.addTrigger('generate-slug', {
    name: 'generate-slug',
    order: 'before',
    run: `document.slug = document.title.toLowerCase().replace(/\\s+/g, '-'); return document;`,
});

const post = await blogPostClass.add({ title: 'Hello World' });
console.log(post.slug); // 'hello-world'
```

### 6. Background jobs and the scheduler

`JobEngine` executes a job when asked. `JobScheduler` decides when to ask, under the constraints a client actually imposes — an app that is closed most of the time, timers that freeze, and several devices holding replicas of the same job.

```typescript
await stack.db.bulkDocs([{
    _id: 'Job-ArchiveOldTasks',
    '~class': '~Job',
    name: 'Archive tasks',
    type: 'user',
    workerPlatform: 'client',
    isEnabled: true,
    content: `
        async function execute(stack, params) {
            const { rows } = await stack.query("SELECT _id FROM Task WHERE isComplete = true");
            return { metadata: { archivedCount: rows.length } };
        }
    `,
}]);

// Run it now
const run = await stack.jobEngine.executeJob('Job-ArchiveOldTasks');

// Or let it run unattended — the application names the jobs allowed to do so.
stack.jobScheduler.start({
    jobs: ['Job-ArchiveOldTasks'],
    intervalMs: 60_000,
    onRun: (run) => console.log(run.status),
});
```

There is deliberately no "run everything": job content replicates and is executable, so unattended execution is an allow-list. `pinnedHashes` lets the application pin the code it expects a job to have.

### 7. Access policies

Rule-based read and write control, evaluated per session against the document in question.

```typescript
await stack.db.bulkDocs([
    {
        _id: 'Policy-Article-EditorsWrite',
        '~class': '~Policy',
        targetClass: ['Class-Article'],
        groupId: 'Group-Editors',
        rule: `return session && session.sessionStatus === 'active';`,
    },
    {
        _id: 'Policy-Article-PublicRead',
        '~class': '~Policy',
        targetClass: ['Class-Article'],
        rule: `if (document.status === 'published') return true;`,
    },
]);
```

Because policies are documents scoped by group and user, one database can serve multiple tenants without per-tenant application code — and the query engine consults them before deciding whether a filter can be pushed down.

### 8. Field-level encryption

```typescript
await Attribute.create(userClass, 'socialSecurityNumber', 'string', 'SSN', { encrypted: true });
```

The value is encrypted with a document key (PBKDF2-derived, AES-GCM) before it reaches storage. It is ciphertext on disk **and on every remote it replicates to** — decrypted only on the way out, for a session holding the key.

DocStack never invents that key: one generated per session could not outlive it, and a second device would generate a different one. Supply it at open time, or open **locked** and unlock later:

```typescript
const stack = await ClientStack.create('my-app', { documentKey: hexKey });

// or
if (stack.isLocked()) await stack.unlock(hexKey);
```

A locked stack is readable but refuses writes to any class carrying encrypted attributes — and patches that would need to re-encrypt data defer until unlock rather than failing the open.

### 9. Domains — relationships with integrity

```typescript
import { Domain } from '@docstack/client';

const domain = await Domain.create(
    stack, null, 'ProjectTasks', 'domain', '1:N',
    projectClass, taskClass, 'A project has many tasks'
);
```

Relations are documents too, judged by their endpoints at write time — and during replication, so a relation never travels to a device that lacks the things it relates.

### 10. Moving content between stacks

Export application content without the datamodel that describes it, and import it into a stack that already has the schema:

```typescript
const payload = await stack.exportContent({ classes: ['Task', 'Project'] });
const report = await target.importContent(payload, { overwrite: false });
```

### 11. Classes that aren't worth a schema

Two flags change what a class costs:

* **`simple`** — documents are stored as given: no schema, no validation, no triggers, no relation checks. A bag of documents, for caches and logs.
* **`ephemeral`** — documents describe this run of this client: emptied when the stack next opens, and never replicated.

## 📊 Performance

Measured in a real browser against IndexedDB. Both tables are reproducible with `BENCH=1 npx playwright test zz-bench` from this package.

**Transactions** — 100 documents ([ADR-0039](https://github.com/onyx-og/docstack/blob/main/specs/adr/0039-transactions-stage-above-the-plugin-and-commit-through-it.md)):

| Path | Cost |
|---|---|
| Stage 100 documents | 43.1 ms total · 0.43 ms/doc · **0 backend queries** |
| Commit 100 | 43.1 ms — **parity** with the non-transactional batch write (46.3 ms) |
| Overlay read, empty stage | 19.2 ms vs 17.2 ms plain — same query count (fast-path parity) |
| Overlay read, 100 staged over 100 committed | 66.2 ms (unwindowed query + in-memory union) |
| Refused commit (conflict pre-flight) | 1.3 ms, zero writes |
| Discard 100 | 0.1 ms |

Staging costs nothing at the storage layer, and committing costs what the same write would have cost anyway — so a transaction is not a tax you pay for safety.

**What the authoring pipeline costs** — 150 writes ([ADR-0028](https://github.com/onyx-og/docstack/blob/main/specs/adr/0028-ephemeral-and-simple-classes.md)):

| Path | Cost |
|---|---|
| Bare documents, no class | 860 ms |
| Through the full authoring path | 1549 ms |

**1.8×** for validation, defaults, triggers, relation checks and encryption — and the dominant cost in both rows is the IndexedDB write itself, not DocStack. Where that 1.8× still matters, `simple` classes take the fast path by design.

## 🔍 How it compares

Against raw PouchDB — the honest baseline, since DocStack is built on it:

| | PouchDB / IndexedDB | @docstack/client |
|---|---|---|
| Local storage & replication | ✅ | ✅ (same protocol) |
| Schema & validation | write it yourself | ✅ Zod-backed, stored as documents |
| Querying | Mango selectors, hand-written map/reduce | ✅ SQL — joins, aggregation, subqueries, pushdown |
| Business logic on write | application code | ✅ triggers, stored as data |
| Background work | application code | ✅ job engine + unattended scheduler |
| Access control | none | ✅ policy engine, per class and session |
| Field-level encryption | build it | ✅ transparent, opaque to the remote |
| Schema migrations | build it | ✅ versioned patches with a ledger and a sync gate |
| Multi-document atomicity | none | ✅ staged transactions, with reported guarantees |

**Where DocStack sits in the offline-first field.** If you want a fast reactive local store and will own the rest yourself, [Dexie](https://dexie.org/) is a lighter and excellent choice. [RxDB](https://rxdb.info/) covers similar ground — schemas, reactivity, pluggable replication — and is the closest neighbour; [WatermelonDB](https://watermelondb.dev/) targets large React Native datasets on SQLite; [Firestore](https://firebase.google.com/docs/firestore) gives you a managed backend with offline caching, at the cost of running on someone else's infrastructure and terms.

What distinguishes DocStack is a narrower bet than "a better local database":

* **Logic as data.** Triggers, jobs and policies are documents that replicate and can change at runtime, rather than code compiled into a release. Behaviour ships like data.
* **Encryption the remote cannot read.** Field-level encryption is applied before storage and before replication, so the sync target is a place to keep bytes, not a party you trust.
* **Bring your own remote.** Replication targets any PouchDB-compatible database — including a folder in the end user's own Drive, which makes "we don't hold your data" an architecture rather than a promise.

Pick accordingly: these are different bets, not rankings.

## 🧩 Architecture

| Engine | Description |
|---|---|
| **Core DB** | PouchDB for storage and replication |
| **Schema Engine** | Zod-backed validation, class hydration, schema propagation |
| **Query Engine** | SQL parser, planner and executor |
| **Job Engine** | Background jobs, runs, and the unattended scheduler |
| **Crypto Engine** | PBKDF2 key derivation and AES-GCM field encryption |
| **Policy Engine** | Read/write rules per class, group and session |
| **Transaction Engine** | Staged writes, overlay reads, one-batch commit |
| **Sync Layer** | Lifecycle, replication filters, convergence state, schema gate |

Every one of these is pinned by the Playwright suite in [`src-test/`](https://github.com/onyx-og/docstack/tree/main/packages/client/src-test) — transactions and their overlay, crypto-aware queries, policy enforcement, subqueries, replication filters, late-joining stacks, patch chains.

## 💾 Storage and sync transports

Storage is IndexedDB via `pouchdb-browser` by default. For replication, `remote` accepts any PouchDB-compatible database:

* **Any CouchDB-compatible endpoint** — pass the URL.
* **[@docstack/pouchdb-adapter-googledrive](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive)** — the user's own Drive folder as a remote: append-only log, lazy loading, multi-writer safe, auto-compaction, no `googleapis` dependency.

```typescript
import PouchDB from 'pouchdb-browser';
import GoogleDriveAdapter from '@docstack/pouchdb-adapter-googledrive';

PouchDB.plugin(GoogleDriveAdapter({ accessToken, pollingIntervalMs: 5000 }));

// One folder per database — pass `folderName` per remote, not in the plugin config,
// or every stack interleaves its change log with the others'.
await docstack.sync({
    remote: (stack) => new PouchDB(stack.name, {
        adapter: 'googledrive',
        folderName: `my-app/${stack.name}`,
    }),
});
```

## 📖 Documentation

* [Full documentation](https://onyx-og.github.io/docstack/) — architecture, guides, API reference
* [Architecture decisions](https://github.com/onyx-og/docstack/tree/main/specs/adr) — why the engine is shaped this way
* [Changelog](https://github.com/onyx-og/docstack/blob/main/packages/client/CHANGELOG.md)
* [Contributing](https://github.com/onyx-og/docstack/blob/main/CONTRIBUTING.md)

## License

[CC-BY-SA-4.0](https://github.com/onyx-og/docstack/blob/main/LICENSE.md) · © Onyx AC, LLC

---

Built with ❤️ for the modern web.
