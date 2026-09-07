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
| `run` | The function body as a string. Receives `document`, `classObj` and `stack`; must return the document. |
| `jobId` | Instead of `run`: the id of a `~Job` to execute with `{ document }` as its parameters. |

Exactly one of `run` or `jobId` is required. `classObj.addTrigger(name, model)` appends the trigger to the class model and writes the class document; `removeTrigger(name)` drops it from the in-memory class.

## How a trigger runs

The body is hydrated once, when the class is built, with `new Function('document', 'classObj', 'stack', …)`. It is wrapped in an async immediately-invoked function, so `await` works anywhere in the body. `execute(document)` awaits the result and, if the body returned nothing, logs a warning and passes the original document through. `executeLimited(document)` runs the body with no class and no stack, which is what the workbench uses to preview a trigger against a sample document.

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
