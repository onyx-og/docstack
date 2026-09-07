---
title: "Scheduler options"
description: "Every option of JobScheduler.start with its default, the schedule grammar, the skip reasons a tick reports, and the shape of the per-device schedule state."
sidebar_position: 3
---

`stack.jobScheduler` is created with the stack and started by the application. See [Background jobs and scheduling](../guides/jobs.md) for the reasoning; this page is the surface.

## `start(options)`

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `jobs` | required | Job ids allowed to run unattended. There is deliberately no "all". |
| `pinnedHashes` | `{}` | Expected `hash` per job. A mismatch skips the job with `hash-mismatch`. |
| `intervalMs` | `60000` | Floor between automatic ticks. Values below `5000` are raised to it. |
| `staleRunMs` | `900000` (15 minutes) | A `~JobRun` left `RUNNING` longer than this is swept to `CANCELED`. At most 50 per tick. |
| `backoffBaseMs` | `300000` (5 minutes) | First retry delay after a failure; doubles per consecutive failure. |
| `maxBackoffMs` | `21600000` (6 hours) | Ceiling for that doubling. |
| `now` | `Date.now` | Injectable clock, for tests. |
| `onRun` | none | Called with each completed `~JobRun`, successful or not. |

`start` evaluates once immediately, then on every interval.

## Methods

| Method | Returns | Notes |
| :--- | :--- | :--- |
| `start(options)` | void | Begin scheduling. |
| `tick()` | `Promise<TickReport>` | Evaluate now. Idempotent: concurrent calls share one evaluation. Call it from wake signals such as `visibilitychange`. |
| `stop()` | void | Stop scheduling. Jobs already dispatched keep running; a hydrated function has no cancel. |
| `drain()` | `Promise<void>` | Resolves when every job this scheduler started has finished. |
| `status()` | `{ running, inFlight, jobs }` | What the scheduler believes, without a database round-trip. `jobs` maps job id to its `JobScheduleState`. |
| `isRunning` | boolean | Getter. |

## Schedule grammar

Set on the job document's `schedule` field.

| Form | Meaning |
| :--- | :--- |
| `@every <n><unit>` | A fixed interval since the last run. Units `s`, `m`, `h`, `d`, `w`. Not shorter than 30 seconds. |
| `@hourly` | The top of each local hour. |
| `@daily` | Local midnight. |
| `@daily@HH:MM` | A local wall-clock time, 24-hour. |
| `@weekly` | Monday, local midnight. |
| `@weekly@HH:MM` | Monday at a local wall-clock time. |

Anchored forms are computed in local time, so they follow the device across daylight-saving changes. Cron expressions are not accepted: `parseSchedule` returns `null` and the job is skipped with `unparseable-schedule`. Missed occurrences collapse into one run.

`parseSchedule(text)` and `nextOccurrence(schedule, from)` are exported by `@docstack/client` for applications that want to show "next run" in a UI.

## `TickReport`

| Field | Meaning |
| :--- | :--- |
| `at` | The instant the tick was evaluated at. |
| `dispatched` | Job ids dispatched by this tick. They may still be running when the report returns. |
| `skipped` | `{ jobId, reason }` per job not dispatched. |
| `sweptRuns` | Abandoned `RUNNING` runs moved to `CANCELED`. |

Skip reasons: `missing` (no such job document), `disabled`, `no-schedule`, `unparseable-schedule`, `hash-mismatch`, `in-flight`, `not-due`.

## Schedule state

Kept in the `_local/docstack-job-schedule` document (`JOB_SCHEDULE_DOC_ID`), which never replicates. Per job:

| Field | Meaning |
| :--- | :--- |
| `nextRunAt` | When this job next comes due on this device. |
| `lastRunAt` | When this device last dispatched it. |
| `lastStatus` | The outcome of that dispatch. |
| `consecutiveFailures` | Drives the backoff. Reset by any success. |
| `schedule` | The schedule string the state was computed from; a change resets the state. |
