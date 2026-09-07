---
title: "Evolve the schema with patches"
description: "Ship your data model as versioned patch documents that apply once per device, merge into existing classes, carry seed data and one-shot migration jobs, and gate replication between devices on different versions."
sidebar_position: 7
sidebar_label: "Schema patches"
---

A patch is a document describing a versioned change. Hand the chain to the stack at open time and it applies whatever this device has not seen yet, in order, exactly once, recorded in a ledger.

## The document

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

| Field | Meaning |
| :--- | :--- |
| `version` | Semver. Patches with the same `target` apply in version order. |
| `target` | Which application or module the patch belongs to. `system` is reserved for DocStack's own patches. |
| `changelog` | For humans. |
| `docs` | The documents to write: class models, domains, seed data, massages of existing documents. |
| `preApply`, `postApply` | Optional one-shot jobs (below). |

From React, pass the same array in the provider's `config`: `<StackProvider config={[{ name: 'my-app', patches: PATCHES }]}>`.

## What a patch can carry

- **Class models** (`'~class': 'class'`) and domains. The second patch above **merges** into `Task` rather than replacing it: a patch states only the attributes it changes, an absent attribute stays as stored, and an explicit `null` drops one from the model and, by propagation, from every document of the class.
- **Seed documents**, including the first documents of a class the same patch introduces. Class resolution checks the batch being written before the database, so a model riding the batch is the newest statement of the schema.
- **Massages of existing documents**, marked `_rev: "auto"`: the stored document is fetched and the patch's fields merged over it.
- **One-shot jobs**, `preApply` and `postApply`, for changes documents cannot satisfy on their own.

A patch cannot carry `_local/` documents, `_design/` documents or nested patch documents; the transaction sweep refuses them loudly.

## How a chain applies

The pending chain applies through **one internal transaction**. Patch N+1 hydrates against the classes patch N staged, so the merge composes in memory; propagation onto existing documents is validated dry, with nothing kept; then one commit lands every document as a single batch through the unchanged pipeline. The ledger arms only after.

Consequences:

- A chain is **all-or-nothing**. If patch N+1 is invalid, nothing from the chain persists, not even earlier valid patches, and the error names the patch, class and attribute at fault: `Patch '0.2.0' cannot apply to class 'Task': …`.
- A class-model change that existing documents cannot satisfy refuses the patch rather than corrupting the documents.
- A historical patch that dropped an attribute by omission no longer drops it on a fresh replay. Restate a deliberate drop as `null`.

## The ledger

Each applied patch is recorded as a `patch` document in the stack, with `active: true` written only at the moment of successful application. On open, patches whose `version` and `target` already have an active ledger entry are skipped. The ledger is device-local and does not replicate; patches ship with your code, and every device applies them for itself.

A patch that would write or re-encrypt encrypted data while the stack is **locked** is deferred: it is recorded with `active: false`, it does not count toward the device's schema version, and the unlock replays it in place. See [Encrypt fields](./encrypt-fields.md#what-a-locked-stack-does). A failed application records nothing, so it retries on the next open.

`stack.getConsumerSchemaVersion()` returns the highest applied non-system version, which is what the sync gate compares.

## One-shot migration jobs

Some changes need data to move before the model can validate: tightening a type, converting a value, renaming an attribute honestly, backfilling a foreign key. A patch can carry the code to do it.

```typescript
{
    '~class': 'patch',
    _id: 'my-app-0.3.0',
    version: '0.3.0',
    target: 'my-app',
    changelog: 'Estimates become numbers.',
    active: true,
    preApply: {
        name: 'estimates-to-numbers',
        content: `
            async function execute(stack, params, job) {
                const { docs } = await stack.db.find({ selector: { '~class': 'Task' } });
                for (const doc of docs) {
                    if (typeof doc.estimate === 'string') {
                        await stack.db.put({ ...doc, estimate: Number(doc.estimate) });
                    }
                }
            }
        `,
    },
    docs: [{
        '~class': 'class', _id: 'Task', name: 'Task',
        schema: { estimate: { name: 'estimate', type: 'decimal', config: { min: 0 } } },
    }],
}
```

`preApply` runs before the patch's documents stage, and its writes are staged into the chain transaction, so the massage and the model land in one commit or not at all. `postApply` runs after the chain commit, in a second staged transaction, for backfills that need the model landed. Both follow the `~Job` convention (`execute(stack, params, job)`), take `params`, are never persisted as `~Job` documents, and leave a `~JobRun` receipt without a `jobId` whether they succeed or fail, so a failed migration's trail survives the discard.

A job is assumed to need the document key and defers while the stack is locked. `requiresKey: false` is the author's explicit claim that the job touches no encrypted data; a locked read of an encrypting class through the job's stack still throws, and that refusal converts the patch to a deferral rather than failing the open.

## A single patch at runtime

`await stack.applyPatch(patch)` applies one patch outside the open-time chain and returns its version. It uses the same merge rules, but it has no chain transaction, so it refuses a patch that carries `preApply` or `postApply`.

## Versions and sync

A remote records the highest system and consumer patch versions that wrote it. When a device starts syncing, the gate compares both sides: a device whose application patches trail the remote refuses with `SyncSchemaMismatchError` (`scope: 'consumer'`) rather than pulling documents its schema cannot describe, and passes once its patches catch up, or once an unlock replays a deferral. See [Sync to a remote](./sync.md#the-schema-gate).

## Re-applying during development

The ledger decides what is pending. To replay a patch you have edited, delete its ledger entry and reopen the stack:

```typescript
const { docs } = await stack.db.find({ selector: { '~class': 'patch', target: 'my-app', version: '0.2.0' } });
for (const entry of docs) await stack.db.remove(entry);
```

Because a chain merges, a replayed class patch re-applies over the current class. For a clean slate, `ClientStack.clear('my-app')` destroys the database.

The full document format, including the ledger entry, is in [Patch document format](../reference/patch-format.md); the reasoning behind transactional chains, deferral and the gate is in [Patches and migrations](../concepts/patches.md).
