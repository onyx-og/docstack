---
title: "Quickstart"
description: "Open a local database, define a class, write a document and query it with SQL; then do the same from React and ship the schema as a patch."
sidebar_position: 2
---

Ten minutes, no server. Everything below runs against the browser's own storage.

## 1. Open a stack

```typescript
import { ClientStack, Class, Attribute } from '@docstack/client';

// A local database. It is created on first use.
const stack = await ClientStack.create('my-app');
```

A **stack** is one database plus the engines that sit on it. Opening it applies DocStack's own system patches and any application patches you hand in (step 5).

## 2. Define a class

A class is a schema. It is also a document, stored in the same database as the data it describes.

```typescript
const taskClass = await Class.create(stack, 'Task', 'class', 'User tasks');

await Attribute.create(taskClass, 'title', 'string', 'Task title', { mandatory: true });
await Attribute.create(taskClass, 'priority', 'string', 'Priority');
await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });
```

The third argument of `Class.create` is the document type (`'class'`); the fourth is a description. `Attribute.create` takes the class, the attribute name, its type, a description and a configuration object. The nine attribute types and every configuration key are listed in [Class and attribute options](../reference/class-and-attribute-options.md).

## 3. Write

```typescript
const task = await taskClass.add({ title: 'Install DocStack', priority: 'high' });

console.log(task._id);        // 'Task-x7f3k2m9q1w4', random, replication-safe
console.log(task.isComplete); // false, from the default
```

`add` runs the authoring pipeline: the class's `before` triggers, validation against the hydrated schema (which applies defaults and checks foreign keys), encryption of flagged fields, the write, and then the `after` triggers. Ids are random with a class prefix, so two devices writing offline never mint the same one.

Update and delete through the same class:

```typescript
await taskClass.updateCard(task._id, { ...task, isComplete: true });
await taskClass.deleteCard(task._id);   // soft delete: sets active: false
```

## 4. Query

```typescript
const { rows } = await stack.query(
    'SELECT title FROM Task WHERE priority = ? AND isComplete = false ORDER BY title',
    'high'
);
```

Parameters are positional `?` placeholders. Joins, aggregation, subqueries and `UNION` are all available; see [Query with SQL](../guides/query-with-sql.md). Mango selectors work too, through `stack.findDocuments(selector)` or `taskClass.getCards(selector)`.

## 5. Ship the schema as a patch

Defining classes in code is fine for a script. An application wants every device to install the same model, versioned. That is what patches are for: a patch is a document describing a versioned change, and the stack applies whatever this device has not seen yet, in order, exactly once.

```typescript
const PATCHES = [
    {
        '~class': 'patch',
        _id: 'my-app-1.0.0',
        version: '1.0.0',
        target: 'my-app',
        changelog: 'Add the Task class.',
        active: true,
        docs: [{
            _id: 'Task',
            '~class': 'class',
            name: 'Task',
            description: 'A user task',
            schema: {
                title: { name: 'title', type: 'string', config: { mandatory: true } },
                priority: { name: 'priority', type: 'string', config: {} },
                isComplete: { name: 'isComplete', type: 'boolean', config: { defaultValue: false } },
            },
        }],
    },
    {
        '~class': 'patch',
        _id: 'my-app-1.0.1',
        version: '1.0.1',
        target: 'my-app',
        changelog: 'Seed a first task.',
        active: true,
        docs: [
            { _id: 'task-welcome', '~class': 'Task', active: true, title: 'Read the quickstart', isComplete: false },
        ],
    },
];

const stack = await ClientStack.create('my-app', { patches: PATCHES });
```

The second patch seeds data; a patch can carry class models and documents in the same batch. A later patch that changes the `Task` class merges into it attribute by attribute, so a chain composes into one schema. The whole pending chain applies through a single internal transaction: if a later patch is invalid, nothing from the chain persists and the error names the patch, class and attribute at fault. [Schema patches](../guides/patches.md) covers merge rules, deferral and migration jobs.

## 6. The same thing from React

The provider owns the database lifecycle; the hooks are live.

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { StackProvider, useClass, useClassDocs } from '@docstack/react';

const DB_NAME = 'my-app';

function TaskList() {
    const { classObj: taskClass } = useClass(DB_NAME, 'Task');
    const { docs: tasks, loading } = useClassDocs(DB_NAME, 'Task');
    const [title, setTitle] = useState('');

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !taskClass) return;
        await taskClass.add({ title, isComplete: false });
        setTitle('');   // the list below updates itself
    };

    const handleToggle = async (task: any) => {
        if (!taskClass) return;
        await taskClass.updateCard(task._id, { ...task, isComplete: !task.isComplete });
    };

    if (loading) return <p>Loading…</p>;

    return (
        <>
            <ul>
                {tasks.map(task => (
                    <li key={task._id}>
                        <input type="checkbox" checked={task.isComplete} onChange={() => handleToggle(task)} />
                        {task.title}
                    </li>
                ))}
            </ul>
            <form onSubmit={handleAdd}>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task" />
                <button type="submit">Add</button>
            </form>
        </>
    );
}

export default function App() {
    return (
        <StackProvider config={[{ name: DB_NAME, patches: PATCHES }]}>
            <TaskList />
        </StackProvider>
    );
}
```

`useClassDocs` re-renders when a `Task` changes, whether the user edited it, a job wrote it, or it arrived over sync. There is no fetching layer and nothing to invalidate. This is the whole of the `react-todo` example in the repository; [Examples and workbench](./examples.md) shows how to run it.

## What just happened

- Two writes went through validation, defaults and triggers without a server in the path.
- Ids were minted randomly with a class prefix (`Task-…`), which is what makes two offline devices safe to merge later.
- Every document carries `~class`, `~createTimestamp` and `active`; queries and hooks read `active: true` documents unless told otherwise.
- The schema is in the database. Open the [workbench](pathname:///app/index.html) against the same database name and you will see the class, its attributes and the documents.

## Next

- [Model your data](../guides/model-your-data.md) for attribute types, relations and the class flags.
- [Sync to a remote](../guides/sync.md) to make the same data appear on a second device.
- [Encrypt fields](../guides/encrypt-fields.md) before you store anything sensitive.
