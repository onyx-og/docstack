---
title: "Trigger & job document models"
description: "The exact shape of trigger models on a class, ~Job and ~JobRun documents, the execute contract, and the one-shot job a patch may carry."
sidebar_position: 2
sidebar_label: "Trigger & job models"
---

## `TriggerModel`

Stored in a class document's `triggers` array.

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `name` | string | Unique within the class. |
| `order` | `"before"` or `"after"` | Before the document is stored (on the validated document), or after (on the stored document with its `_rev`). |
| `run` | string, optional | The function body. Hydrated with `new Function('document', 'classObj', 'stack', …)` inside an async IIFE; must return the document. |
| `jobId` | string, optional | Instead of `run`: the `~Job` to execute with `{ document }` as runtime parameters and `triggerType: "event"`. |

Exactly one of `run` and `jobId` must be present; the class refuses to build a trigger with neither.

## `JobModel` (`~Job`)

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `_id` | string | By convention `Job-<name>`. |
| `~class` | `"~Job"` | |
| `name` | string | Human-readable. |
| `description` | string, optional | |
| `type` | `"system"` or `"user"` | DocStack's own jobs versus the application's. |
| `workerPlatform` | `"client"`, `"server"` or `"hybrid"` | Where the job is meant to run. |
| `content` | string | JavaScript defining `execute(stack, params, job)`. |
| `hash` | string | SHA-256 hex digest of `content`, computed by the author when the job is written. Mandatory. Verified before every run; a mismatch refuses with `Job content hash mismatch`. |
| `schedule` | string or `null`, optional | A schedule string for the scheduler; see [Scheduler options](./scheduler-options.md). |
| `isSingleton` | boolean, optional | When `true`, a run is `SKIPPED` while another run of this job is `RUNNING`. |
| `isEnabled` | boolean | When `false`, every run is `SKIPPED`. |
| `nextRunTimestamp` | number or `null`, optional | Reserved for a server-side worker. The client scheduler keeps its state in `_local/docstack-job-schedule`, not here. |
| `defaultParams` | object, optional | Merged under the runtime arguments of every run. |
| `metadata` | object, optional | State the job keeps across runs. Replaced by the `metadata` a run returns. |

### The `execute` contract

```typescript
async function execute(stack: ClientStack, params: Record<string, any>, job: JobModel):
    Promise<{ metadata?: Record<string, any> } | void>
```

`params` is `defaultParams` merged with the run's arguments. Returning `{ metadata }` writes it back to the job document and records it on the run as `finalMetadata`; returning nothing keeps the existing metadata. Throwing records a `FAILURE` run with `errorMessage` and `errorStack`.

## `JobRunModel` (`~JobRun`)

One document per execution. Device-local: run records never replicate.

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `_id` | string | `JobRun-<uuid>`. |
| `~class` | `"~JobRun"` | |
| `jobId` | string | The job's `_id`. Absent on receipts left by a patch's one-shot jobs. |
| `status` | `"PENDING"`, `"RUNNING"`, `"SUCCESS"`, `"FAILURE"`, `"CANCELED"` or `"SKIPPED"` | `CANCELED` is set by the scheduler's stale-run sweep. |
| `triggerType` | `"manual"`, `"scheduled"` or `"event"` | `executeJob`'s default, the scheduler, or a trigger. |
| `startTime`, `endTime` | number | Milliseconds since the epoch. |
| `durationMs` | number | |
| `runtimeArgs` | object, optional | The arguments this run received. A patch job records `patchVersion`, `patchTarget`, `phase` and `jobName` here. |
| `initialMetadata`, `finalMetadata` | object, optional | The job's metadata before and after the run. |
| `errorMessage`, `errorStack` | string, optional | On `FAILURE`, and on `SKIPPED` for the message. |
| `logs`, `workerId` | optional | Reserved. |

## `PatchJob`

A one-shot job carried by a patch as `preApply` or `postApply`. Never persisted as a `~Job`.

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `name` | string | Recorded on the receipt. |
| `content` | string | JavaScript defining `execute(stack, params, job)`, the `~Job` convention. `job` carries `{ name, phase, version }`. |
| `params` | object, optional | Passed as `params`. |
| `requiresKey` | boolean, optional | Defaults to `true`: the job defers while the stack is locked. `false` opts into locked execution; a locked read of an encrypting class through the job's stack still throws, and that refusal converts the patch to a deferral. |

See [Schema patches](../guides/patches.md) for when each phase runs and what it can see.
