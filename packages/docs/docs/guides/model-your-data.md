---
title: "Model your data"
description: "Define classes and attributes, relate them with domains, write and read documents, and choose the class flags that change what a class costs."
sidebar_position: 1
---

A class is a schema stored as a document. Documents of that class are validated against it on every write, and the schema itself replicates with the data, so a second device can read what the first one wrote.

## Classes

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

const stack = await ClientStack.create('my-app');
const projectClass = await Class.create(stack, 'Project', 'class', 'A project');
const taskClass = await Class.create(stack, 'Task', 'class', 'A unit of work');
```

`Class.create(stack, name, type, description?, schema?)` writes a class document and returns the hydrated class. `type` is `'class'` for application classes. The class document's id is its name, which matters when you address it in replication filters or patches:

```json
{
  "_id": "Task",
  "~class": "class",
  "name": "Task",
  "description": "A unit of work",
  "schema": {},
  "triggers": []
}
```

Fetch an existing class with `stack.getClass('Task')`, or `stack.getClassSnapshot('Task')` when you only need its schema and do not want a live subscription behind it.

## Attributes

```typescript
await Attribute.create(taskClass, 'title', 'string', 'Title', { mandatory: true, maxLength: 200 });
await Attribute.create(taskClass, 'estimate', 'decimal', 'Hours', { min: 0, precision: 2 });
await Attribute.create(taskClass, 'priority', 'enum', 'Priority', {
    values: [{ value: 'low' }, { value: 'normal' }, { value: 'high' }],
    defaultValue: 'normal',
});
await Attribute.create(taskClass, 'projectId', 'foreign_key', 'Project', { targetClass: 'Project', mandatory: true });
await Attribute.create(taskClass, 'tags', 'string', 'Tags', { isArray: true });
await Attribute.create(taskClass, 'notes', 'string', 'Private notes', { encrypted: true });
```

`Attribute.create(classObj, name, type, description?, config?)` adds the attribute to the class document and rebuilds its validator. Nine types exist: `string`, `integer`, `decimal`, `boolean`, `date`, `enum`, `object`, `foreign_key` and `reference`.

The configuration keys every type accepts:

| Key | Effect |
| :--- | :--- |
| `mandatory` | The write is refused when the attribute is missing. |
| `defaultValue` | Stamped when the attribute is absent from a write. |
| `isArray` | The attribute holds an array of the type. |
| `primaryKey` | Part of the class's natural key; `addOrUpdateCard` and `getByPrimaryKeys` use it. |
| `encrypted` | Stored as AES-GCM ciphertext under the stack's document key. See [Encrypt fields](./encrypt-fields.md). |

Per-type keys (`maxLength`, `min`, `max`, `precision`, `values`, `targetClass`, `domain`, `format`) are listed in [Class and attribute options](../reference/class-and-attribute-options.md).

A `foreign_key` attribute is validated asynchronously: the write is refused if the referenced document does not exist in the target class. A `reference` attribute goes further and binds the attribute to a domain (below); it cannot be an array, and which class may carry it follows from the domain's cardinality.

Change or remove attributes with `taskClass.modifyAttribute(name, model)` and `taskClass.removeAttribute(name)`. Both propagate to existing documents: a removed attribute is dropped from every document of the class, and a tightened one is validated against them before the change is accepted. For an application, prefer expressing these changes as [patches](./patches.md), which version them and replay them on every device.

## Relations: domains

A domain is a named relationship between two classes with a cardinality.

```typescript
import { Domain } from '@docstack/client';

const projectTasks = await Domain.create(
    stack, null, 'ProjectTasks', 'domain', '1:N',
    projectClass, taskClass, 'A project has many tasks'
);

const project = await projectClass.add({ name: 'Docs' });
const task = await taskClass.add({ title: 'Write the guide', projectId: project._id });

await projectTasks.addRelation(project, task._id);
const relations = await projectTasks.getRelations({ sourceId: project._id });
```

`Domain.create(stack, id, name, type, relation, sourceClass, targetClass, description?)` accepts `'1:1'`, `'1:N'`, `'N:1'` or `'N:N'`. A relation is a document too: it carries `~domain` instead of `~class`, plus `sourceClass`, `targetClass`, `sourceId` and `targetId`, and it is judged by its endpoints at write time. `addRelation` refuses a relation that would break the cardinality, and refuses to relate a document that is not of the declared class. During replication a relation travels only when both of its endpoints do, so a peer never receives a dangling reference.

## Writing

```typescript
const task = await taskClass.add({ title: 'Ship it', projectId: project._id });
const [a, b] = await taskClass.add({ title: 'A', projectId: project._id }, { title: 'B', projectId: project._id });

await taskClass.updateCard(task._id, { ...task, title: 'Ship it today' });
await taskClass.addOrUpdateCard({ title: 'Ship it today' });   // by primary key when the class has one
await taskClass.deleteCard(task._id);                            // soft delete: active becomes false
```

Every write runs the authoring pipeline: `before` triggers, validation (which applies defaults and checks foreign keys and relations), encryption, the write, then `after` triggers. `deleteCard` is a soft delete. It sets `active: false`, which is the document-wide visibility flag that reads honour by default; the document stays in the database and replicates like any other update.

Documents carry `~class`, `~createTimestamp`, `~updateTimestamp` and `active` alongside your attributes. Ids are random with a class prefix (`Task-x7f3k2m9q1w4`); pass your own to `stack.createDoc(id, 'Task', taskClass, params)` when the id should mean something, which is what scheduled jobs do to stay idempotent.

## Reading

```typescript
const one = await taskClass.get(task._id);
const many = await taskClass.get(idA, idB);
const open = await taskClass.getCards({ isComplete: { $eq: false } }, ['title'], 0, 20, [{ title: 'asc' }]);

const found = await stack.findDocuments({ '~class': 'Task', priority: 'high' });
for await (const doc of stack.findDocumentsIterator({ '~class': 'Task' }, { batchSize: 200 })) {
    process(doc);
}
```

`getCards(selector?, fields?, skip?, limit?, sort?)` and `findDocuments` take Mango selectors. `findDocumentsIterator` pages by keyset and stops early, for scans too large to hold in memory. For anything with a join or an aggregate, use SQL: see [Query with SQL](./query-with-sql.md).

## Classes that are not worth a schema

Two flags on the class document change what a class costs. Set them in the class model, typically through a patch.

- **`simple: true`.** Documents are stored as given: no schema, no validation, no triggers, no relation checks and no field encryption. The authoring path is skipped entirely, so a write costs what a plain PouchDB write costs. Reads are unaffected because the query engine keys on `~class`, never on attributes. A simple class cannot encrypt a field.
- **`ephemeral: true`.** Documents describe *this run of this client*: they are emptied when the stack next opens, and they never replicate. Logs, caches, drafts. DocStack's own `~Log` class is both simple and ephemeral.

Measured against IndexedDB, 150 writes cost 860 ms as bare documents and 1549 ms through the full authoring path. The 1.8× buys validation, defaults, triggers, relation checks and encryption, and the dominant cost in both rows is the IndexedDB write itself. Where the difference matters, a simple class takes the fast path by design.

A third flag, `tenants: string[]`, declares which tenant spaces a class belongs to. A tenant is a stack (its own database), so the flag is a static declaration that lets replication scoping be derived before any data exists. Single-tenant applications leave it unset.

## Moving content between stacks

```typescript
const payload = await stack.exportContent({ classes: ['Task', 'Project'] });
const report = await target.importContent(payload, { overwrite: false });
console.log(report.documents.written, report.issues);
```

An export carries application content without the data model that describes it; the target stack must already have the classes, typically by applying the same patches. Encrypted attributes are decrypted on the way out, so the file is as sensitive as the data in it. A locked stack refuses to export unless `allowLossyWhenLocked: true`. Import options decide what happens to a document whose class is missing (`onMissingClass: 'skip' | 'fail'`), an attribute the class does not define (`onUnknownAttribute: 'strip' | 'fail' | 'keep'`), and an id that already exists (`overwrite`). Import is not a transaction; use one if you need the all-or-nothing property. See [Write transactions](./transactions.md).
