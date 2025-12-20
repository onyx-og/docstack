# @docstack/client

**The Intelligent, Offline-First Database Engine for Modern Web Apps.**

DocStack Client is a standalone, browser-based datastore built on PouchDB. It bridges the gap between simple client-side storage and full-fledged backend databases by bringing schemas, relationships, SQL-like querying, and background processing directly to the browser.

It is designed for applications that require **offline capabilities**, **strong data consistency**, and **secure local storage**, all while sharing the same powerful data model as the DocStack server.

## 🚀 Why DocStack?

### Business Advantages

- **Logic as Data**: Store business rules, validation scripts, and background jobs as documents in the database. Update your application's behavior dynamically without redeploying the entire codebase.
- **Zero-Latency UX**: By running the database locally, your UI updates instantly. Data syncs to the server in the background when a connection is available.
- **Enterprise-Grade Security**: Built-in field-level encryption ensures that sensitive user data (PII, health records) is encrypted *before* it hits the disk, protecting it even if the device is compromised.

### Technical Highlights

- **Structured NoSQL**: Enjoy the flexibility of JSON documents with the rigor of strict schemas (powered by Zod).
- **SQL in the Browser**: Stop writing complex map/reduce functions. Query your local data using standard SQL syntax, including `JOIN`s, `UNION`s, and aggregations.
- **Reactive Architecture**: Subscribe to changes on specific classes or documents to update your UI in real-time.
- **Background Jobs**: Offload heavy processing (data cleanup, report generation) to background workers that run independently of the UI thread.

## 📦 Installation

To add the client to your project, use your preferred package manager.

```bash
npm install @docstack/client
```

## ⚡ Quick Start

Initialize the stack and create your first data model.

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

// 1. Initialize the stack (creates a local PouchDB instance)
const stack = await ClientStack.create('my-app-db');

// 2. Define a 'Task' class
const taskClass = await Class.create(stack, 'Task', 'class', 'User Tasks');

// 3. Add attributes to the schema
await Attribute.create(taskClass, 'title', 'string', 'Task Title', { mandatory: true });
await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });

// 4. Create a document
const myTask = await taskClass.add({
    title: 'Install DocStack',
    isComplete: true
});

console.log('Created Task:', myTask);
```

## 📚 Core Features & Usage

### 1. Advanced Querying (SQL-like)

DocStack includes a powerful query engine that translates SQL into optimized PouchDB selectors and in-memory operations.

```typescript
// Find all high-priority tasks, join with Assignee, and sort
const { rows } = await stack.query(`
    SELECT t.title, u.username AS assignee
    FROM Task AS t
    JOIN User AS u ON u._id = t.assigneeId
    WHERE t.priority = 'high' AND t.isComplete = false
    ORDER BY t.createdAt DESC
`);
```

### 2. Relationships & Domains

In addition to foreign keys, define strict relationships between data types using Domains.

```typescript
import { Domain } from '@docstack/client';

// Define a 1:N relationship between Projects and Tasks
const domain = await Domain.create(
    stack,
    null,
    'ProjectTasks',
    'domain',
    '1:N',
    projectClass,
    taskClass
);

// Now you can traverse relationships easily or enforce referential integrity.
```

### 3. Background Jobs

Define executable logic stored in the database. Jobs run in a sandboxed environment and can be triggered manually or by system events.

```typescript
// Define a job that archives old tasks
const archiveJob = {
    _id: 'Job-ArchiveOldTasks',
    '~class': '~Job',
    name: 'Archive Tasks',
    type: 'user',
    workerPlatform: 'client',
    isEnabled: true,
    content: `
        async function execute(stack, params) {
            const { rows } = await stack.query("SELECT _id FROM Task WHERE isComplete = true");
            for (const row of rows) {
                // Custom logic to move task to archive...
                console.log('Archiving:', row._id);
            }
            return { metadata: { archivedCount: rows.length } };
        }
    `
};

// Save the job definition
await stack.db.bulkDocs([archiveJob]);

// Execute it
const run = await stack.jobEngine.executeJob('Job-ArchiveOldTasks');
console.log('Job Status:', run.status);
```

### 4. Triggers

Define custom data validations and transformations that execute automatically before or after document operations. Trigger logic is stored as data and hydrated at runtime.

```typescript
// This trigger automatically generates a URL-friendly slug from a document's title
const generateSlugTrigger = {
    name: 'generate-slug-from-title',
    order: 'before',
    run: `document.slug = document.title.toLowerCase().replace(/\\s+/g, '-'); return document;`
};

// Add the trigger to a class schema
await blogPostClass.addTrigger(generateSlugTrigger);

// Now when you save a BlogPost, the slug is generated automatically
const post = await blogPostClass.add({ title: 'Hello World' });
console.log(post.slug); // 'hello-world'
```

### 5. Access Policies

Control who can read or write data with granular, rule-based policies. Great for implementing role-based access control (RBAC) and multi-tenant applications.

```typescript
// Policy: Only users in the 'editors' group can write to Article documents
const editorsOnlyWritePolicy = {
    _id: 'Policy-Article-EditorsWrite',
    '~class': '~Policy',
    targetClass: ['Class-Article'],
    groupId: 'Group-Editors',
    rule: `
        // 'session' and 'document' are injected at runtime
        return session && session.sessionStatus === 'active';
    `
};

// Policy: Published articles are readable by anyone
const publicReadPolicy = {
    _id: 'Policy-Article-PublicRead',
    '~class': '~Policy',
    targetClass: ['Class-Article'],
    rule: `
        if (document.status === 'published') {
            return true;
        }
    `
};

// Save policies to activate them
await stack.db.bulkDocs([editorsOnlyWritePolicy, publicReadPolicy]);
```

### 6. Security & Encryption

Protect sensitive data transparently.

```typescript
// Define a class with an encrypted field
await Attribute.create(userClass, 'socialSecurityNumber', 'string', 'SSN', {
    encrypted: true
});

// When you save a document, 'socialSecurityNumber' is encrypted using a document secure key.
// It is stored as ciphertext in PouchDB and only decrypted when accessed via the API.
```

## 🧩 Architecture

DocStack Client is composed of several modular engines:

| Engine | Description |
|--------|-------------|
| **Core DB** | PouchDB for storage and sync |
| **Schema Engine** | Zod-based validation and schema hydration |
| **Query Engine** | SQL parser and planner for complex data retrieval |
| **Job Engine** | Manages asynchronous tasks and background workers |
| **Crypto Engine** | Handles key derivation (PBKDF2) and AES-GCM encryption |
| **Policy Engine** | Enforces granular read/write access rules per class or user-targeted, based on user sessions and document's content |

---

Built with ❤️ for the modern web.