---
title: "Validate & react with triggers"
description: "Attach small pieces of JavaScript to a class that run before or after a write, stored as data and hydrated at runtime."
sidebar_position: 2
sidebar_label: "Triggers"
---

A trigger is a function stored on a class document and run by the authoring pipeline. It is data: it replicates with the class, it can be changed at runtime, and it shows up in the workbench's trigger editor.

## Defining one

```typescript
await postClass.addTrigger('generate-slug', {
    name: 'generate-slug',
    order: 'before',
    run: `document.slug = document.title.toLowerCase().replace(/\\s+/g, '-'); return document;`,
});

const post = await postClass.add({ title: 'Hello World' });
console.log(post.slug); // 'hello-world'
```

A trigger model has four fields:

| Field | Meaning |
| :--- | :--- |
| `name` | Unique within the class. |
| `order` | `'before'` runs on the incoming document, ahead of validation and storage; `'after'` runs on the stored document, revision included. |
| `run` | The function body as a string. Receives `document`, `classObj`, `stack` and `session`; must return the document. |
| `jobId` | Instead of `run`: the id of a `~Job` to execute with `{ document }` as its parameters. |
| `handler` | Instead of either: the name of a compiled handler declared in your code. See [below](#compiled-handlers-a-trigger-with-no-body-in-the-document). |

Exactly one of `handler`, `run` or `jobId` is required. `classObj.addTrigger(name, model)` appends the trigger to the class model and writes the class document; `removeTrigger(name)` drops it from the in-memory class.

## How a trigger runs

The body is hydrated once, when the class is built, with `new Function('document', 'classObj', 'stack', 'session', …)`. It is wrapped in an async immediately-invoked function, so `await` works anywhere in the body. `execute(document, session?)` awaits the result and, if the body returned nothing, logs a warning and passes the original document through. `session` is the [session](./sessions.md) the write runs under, on a host acting for a principal, and `undefined` on a write with none; it is who is asking, not a sandbox. `executeLimited(document)` runs the body with no class and no stack, which is what the workbench uses to preview a trigger against a sample document.

Because the body can reach the stack, a trigger can read other documents, run SQL, or write. Keep `before` triggers to derivations over the document itself where you can; a write in a `before` trigger runs while the pipeline is mid-flight for the document that triggered it.

## Before: derive, validate, refuse

```typescript
await invoiceClass.addTrigger('total', {
    name: 'total',
    order: 'before',
    run: `
        document.total = (document.lines ?? []).reduce((sum, line) => sum + line.amount, 0);
        if (document.total < 0) throw new Error('An invoice cannot be negative');
        return document;
    `,
});
```

Throwing from a `before` trigger refuses the write. A `before` trigger runs on the raw document, ahead of schema validation: defaults have not been applied yet, and whatever the trigger returns is what gets validated. A trigger that derives a field can therefore satisfy a `mandatory` constraint, and a trigger that sets a bad value is caught by the validator.

## After: react

```typescript
await orderClass.addTrigger('stamp-review-due', {
    name: 'stamp-review-due',
    order: 'after',
    run: `
        if (document.deliveredAt && !document.reviewDueAt) {
            await stack.createDoc(document._id, 'Order', classObj, {
                ...document, reviewDueAt: document.deliveredAt + 7 * 86400000,
            });
        }
        return document;
    `,
});
```

An `after` trigger sees the stored document with its `_rev`. Writing the same document again from an `after` trigger mints a new revision, so guard it against re-entry, as the example does by checking the field it is about to set.

To run only when a document is created, test the revision prefix: `document._rev.startsWith('1-')` is true for the first revision. It is an idiom, not an API; a document imported with an existing revision history will not match.

## Starting a job from a trigger

Work that should not block the write, or that should be recorded as a run, belongs in a job.

```typescript
await orderClass.addTrigger('confirm', {
    name: 'confirm',
    order: 'after',
    run: `
        await stack.jobEngine.executeJob('Job-SendOrderConfirmation', { orderId: document._id }, 'event');
        return document;
    `,
});

// Or, with no body at all:
await orderClass.addTrigger('confirm', { name: 'confirm', order: 'after', jobId: 'Job-SendOrderConfirmation' });
```

The `jobId` form passes `{ document }` as the job's runtime parameters and records the run with `triggerType: 'event'`. Jobs, their document shape and the scheduler are covered in [Background jobs and scheduling](./jobs.md).

## Where triggers do not run

- **Replication.** Documents arriving over sync were validated and triggered where they were written; re-running the pipeline on them would reject documents authored by a device one patch ahead and mint revisions mid-replication. Replication writes bypass triggers by design.
- **Simple classes.** A class flagged `simple` skips the authoring path entirely.
- **Inside a transaction.** Staging a write does not run its triggers; they run at commit, when the batch goes through the pipeline. Triggers see the committed world, not the transaction's staged view.

## What a trigger is not

`new Function` is not a sandbox. A trigger body runs with the same authority as your application code, against the real stack. Class documents replicate, so a trigger written on one device runs on every device that receives the class. Treat write access to class documents as administrative access, and treat a class model arriving over sync from a peer you do not control as code you are about to run.

## Compiled handlers: a trigger with no body in the document

The section above is the reason this one exists. A `run` string is code travelling in a replicated document, and it needs an interpreter at the other end. A **compiled handler** is the same logic declared in your own source, with only its *name* stored on the class:

```typescript
import { defineClass, defineHandler, defineModel, a, type InferDoc } from '@docstack/client/model';

type PostDoc = InferDoc<typeof Post>;

export const generateSlug = defineHandler('blog.generateSlug', {
    kind: 'trigger',
    run: (doc: PostDoc, ctx) => ({
        ...doc,
        slug: doc.title.toLowerCase().replace(/\s+/g, '-'),
        slugAt: ctx.now(),
    }),
});

export const Post = defineClass('Post', {
    attributes: { title: a.string({ mandatory: true }), slug: a.string() },
    triggers: [{ name: 'generate-slug', order: 'before', handler: generateSlug }],
});

export const model = defineModel({ classes: [Post] });
```

The class document gets `{ name: 'generate-slug', order: 'before', handler: 'blog.generateSlug' }`. The function stays in your bundle, where TypeScript checks it against the document type and your build versions it.

Hand the registry over when the stack opens:

```typescript
const docstack = new DocStack({ name: 'blog', patches, handlers: model.handlers });
```

`defineModel` collects the handlers its classes' triggers reference, so a trigger handler needs no second mention. A job handler, referenced by a patch rather than a class, is listed explicitly: `defineModel({ classes, handlers: [backfillSlugs] })`.

### What you get, and what it costs

| | `run` string | `handler` name |
| :--- | :--- | :--- |
| Where the code lives | in the class document, replicated | in your application build |
| Checked by | nothing | TypeScript, against `InferDoc` |
| Needs an interpreter | yes | no |
| Changeable at runtime | yes, by anyone who can write the class | no, it ships with the app |
| End users can define it | yes | no |

Neither replaces the other. End users define triggers, and a `run` string is how they do it; a compiled handler is for logic *you* wrote and would rather have checked. Mixing the two on one class is fine - the two forms are resolved separately, per trigger.

### A reference that resolves nowhere fails at open

A handler name that this build does not register is an error **when the stack opens**, not when a write first touches the class:

```
Trigger 'generate-slug' on class 'Post' (Patch '1.1.0') names the compiled handler
'blog.generateSlug', which this build does not register. Pass it in `handlers` when the
stack opens - `defineModel({ classes, handlers })` collects them - or write the trigger's
`run` inline instead. Registered: blog.publish.
```

Failing early and loudly is deliberate: the alternative is a write that silently skipped its trigger, and then two devices deriving different data from the same input. `docstack revision --check` runs the same check against your patch chain, so CI catches a handler renamed in code without a patch to match - which the model diff cannot see, because it compares schemas and triggers are not part of one.

### Jobs too

A patch's one-shot migration takes the same form, which is what the generated stub suggests:

```typescript
export const backfillSlugs = defineHandler('blog.backfillSlugs', {
    kind: 'job',
    // No encrypted attribute is touched, so it may run on a locked stack (ADR-0044).
    requiresKey: false,
    execute: async (stack) => {
        const { rows } = await stack.query('SELECT _id, title FROM Post WHERE slug IS NULL;');
        // ...
    },
});

patch_1_1_0.postApply = { name: 'backfill', handler: 'blog.backfillSlugs' };
```

`requiresKey` belongs on the handler, where the code is, rather than on every patch that calls it. A patch stating its own value still wins.
