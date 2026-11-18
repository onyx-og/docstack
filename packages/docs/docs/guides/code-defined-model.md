---
title: "Declare your model in code"
description: "Declare classes in your own source, infer their TypeScript types with no codegen step, generate the patches that install them, and read and write documents that are typed."
sidebar_position: 2
---

A class declared in code is the same class document the engine stores. One declaration gives you the TypeScript types, the stored model and the patch that installs it, so the types and the runtime cannot drift apart.

This is additive. Everything in [Model your data](./model-your-data.md) still works, and you need it for classes created at runtime.

## Declare

`npx docstack init` writes everything on this page's first half for you — a starter model, its first patch, the npm scripts, and a DocStack section in your `AGENTS.md` so an agent working on the project stays on the model-first workflow. It installs nothing and touches none of your own source; it prints the one install command and the one wiring snippet and leaves those to you.

Put the declaration in `src/model.ts`, which is where the CLI looks for it:

```typescript
import { defineClass, defineModel, a, type InferDoc, type InferInput } from '@docstack/client/model';

export const Todo = defineClass('Todo', {
    description: 'A task to be completed',
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        completed: a.boolean({ defaultValue: false }),
        priority: a.enum(['low', 'normal', 'high']),
        tags: a.string({ isArray: true }),
        dueOn: a.date(),
        owner: a.foreignKey({ targetClass: 'User' }),
    },
});

export type TodoDoc = InferDoc<typeof Todo>;
export type TodoInput = InferInput<typeof Todo>;

export const model = defineModel({ classes: [Todo] });
```

`TodoDoc` and `TodoInput` are inferred from the declaration above. There is no generated file to keep in sync and no build step between editing the model and seeing the types.

The import is `@docstack/client/model`, not `@docstack/client`. The two export the same names, but the model entry carries only the declarations and no engine, and your model file is read **outside the browser** as well: `docstack revision` loads it in Node. The main entry would drag the storage layer into that, which is a way to fail for reasons that have nothing to do with your model.

An enum narrows to its own members, so `priority` is `'low' | 'normal' | 'high'` rather than `string`. You do not need `as const`.

## What a read gives you, and what a write takes

They are not the same shape, because the engine fills some attributes and not others.

| Declared | A write must carry it | A read is guaranteed to have it |
| :--- | :--- | :--- |
| `mandatory`, no default | yes | yes |
| `mandatory` with a `defaultValue` | no, the engine fills it | yes |
| a `defaultValue`, not mandatory | no | yes |
| neither | no | no |
| `isArray` with a `defaultValue` | same as without one | no |

The last row is the one that surprises people. Modifiers apply `defaultValue` before `isArray`, so the default belongs to the array's *members*, not to the array. There is no sensible whole-array value to write, so nothing is filled.

```typescript
await todos.addCard({ title: 'Ship' });          // completed is stored as false
const todo = await todos.get(id);
todo.completed;                                   // boolean, always present
todo.priority;                                    // 'low' | 'normal' | 'high' | null | undefined
```

## Generate the patches

A class declared in code is not installed until a patch carries it. The CLI writes that patch for you by comparing your model against the patches you already have.

```bash
npm install --save-dev @docstack/cli

npx docstack revision --autogenerate -m "add the Todo class"
```

That writes `src/patches/0.1.0.ts` and regenerates `src/patches/index.ts`. Pass the chain to the stack the way you always have:

```typescript
import { patches } from './patches/index.js';

const stack = await ClientStack.create('my-app', { patches });
```

Change an attribute and run it again. The second patch carries only the delta, which is what the engine merges:

```bash
npx docstack revision --autogenerate -m "add a due date"
```

Generated patches are meant to be read and committed. Regenerate rather than hand-edit the documents in them; a data migration goes in the `preApply` or `postApply` hook, which the generated file leaves as a commented stub.

A patch you write by hand lives in the same directory and is picked up by the same index: the generator only owns the files it wrote. That is how a patch that seeds *content* works, and `--check` stays quiet about it because it carries no class documents. See `packages/examples/react-todo` for both kinds side by side.

### Keep CI honest

```bash
npx docstack revision --check
```

This exits non-zero when your model and your patch chain disagree, and names the classes. It is the guard for the failure that otherwise reaches a device: editing the model, forgetting the patch, and shipping an app whose code expects a schema the database never installed.

**If your app has more than one stack** — a root database plus one per workspace, say — it has one model and one chain per stack, and you run the command once per pair:

```bash
npx docstack revision --check --model src/model.root.ts      --patches src/patches/root
npx docstack revision --check --model src/model.workspace.ts --patches src/patches/workspace
```

Without those flags the command refuses rather than picking one, because a run that silently covered only the first would pass while the second had drifted.

### Check the whole setup

```bash
npx docstack doctor
```

`revision --check` answers one question: do the model and the chain agree? `doctor` answers the rest, and exits non-zero only on an error.

- **The chain.** A class restated without `_rev: "auto"` — which replaces the stored class instead of merging, losing every attribute an earlier patch added. A patch whose file name and declared version disagree, so the generator and the engine order it differently. A chain that changes `target` mid-way, which the sync gate reads as two chains.
- **The model.** Shapes that are legal to write down and do not mean what they read like: an array with a `defaultValue` (it fills nothing — see the table above), an `integer` whose default is not one, a `foreign_key` pointing at a class you never declared.
- **The project.** Zod resolvable and on 4.x, and a `tsconfig` that sets `compilerOptions.types` without `"pouchdb"` — which makes DocStack's engine-facing types resolve to `any` without telling you, because `skipLibCheck` hides the cause. If you started from a Vite template, you have this.
- **Your stored data, by naming what it cannot reach.** The 2.0 attribute fixes are stricter than what older documents were written under, so `doctor` lists every `integer`, `enum` and `date` attribute at risk and tells you to check them where your data actually lives. It cannot open your users' IndexedDB from a terminal, and does not pretend to. A document that fails is still readable; it is the next *write* that is refused.

## Typed reads and writes

```typescript
import { typed } from '@docstack/client';

const db = typed(stack, model);

const created = await db.Todo.addCard({ title: 'Ship', priority: 'high' });
const open = await db.Todo.getCards({ completed: { $eq: false } });
await db.Todo.updateCard(created._id, { completed: true });
```

`db.Todo` is typed by the declaration: on a write, an undeclared attribute, a value outside an enum or a missing mandatory attribute is a compile error. Selectors are unchanged, so everything in [Filtering](./filtering.md) and [Query with SQL](./query-with-sql.md) still applies.

A projected read returns partial documents, because that is what it is:

```typescript
const titles = await db.Todo.getCards(undefined, ['title']);
titles[0].title;        // string | undefined
```

Reads are typed by what the engine stores, and a document also carries fields no class declares - `~createTimestamp`, `~createdBy` and whatever a trigger wrote - so reading an *undeclared* name gives you `any` rather than an error. Writes are exact in both directions.

The untyped class is always one call away, for anything the wrapper does not cover:

```typescript
const classObj = await db.Todo.untyped();
```

### A whole app

`packages/examples/react-todo` is this guide, built: a declared model, a generated schema patch, a hand-written data patch, typed reads through the hook and typed writes through the wrapper, and no `any` anywhere in its source.

### In React

```tsx
import { typedClass } from '@docstack/client';
import { useClassDocs, useDocStack } from '@docstack/react';
import { Todo } from './model.js';

const TodoList = () => {
    const { docs, loading } = useClassDocs('my-app', Todo);
    if (loading) return <p>Loading…</p>;
    return <ul>{docs.map(doc => <li key={doc._id}>{doc.title}</li>)}</ul>;
};
```

Passing the declared class types `docs`. Passing a name still works and still returns `Document[]`, which is what a runtime-created class needs.

There is no typed write *hook*; build the wrapper from the stack instead, which is cheap and needs no `await`:

```tsx
const docStack = useDocStack();
const todos = useMemo(() => {
    const stack = docStack?.getStack('my-app');
    return stack ? typedClass(stack, Todo) : null;
}, [docStack]);

await todos?.addCard({ title: 'Ship' });
```

## What stays untyped, deliberately

- Classes created at runtime with `Class.create`, `addAttribute`, `modifyAttribute` or `removeAttribute`.
- `simple` classes, which have no schema by definition.
- Any class your model does not declare.

A typed wrapper describes the class *as declared*. If a runtime edit has changed the stored class since, the types describe something the database no longer holds. That is the trade for an escape hatch, and it is why runtime edits and declared models are better not mixed on the same class.

## The model hash

```typescript
await model.hash();         // one digest for the whole model
await model.classHashes();  // one per class
```

Both are SHA-256 over the semantic parts of the declaration, with keys sorted and descriptions excluded, so renaming a comment never looks like a schema change. They are exposed for comparing two builds; nothing in the engine gates on them yet.
