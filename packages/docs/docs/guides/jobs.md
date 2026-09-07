---
title: "Background jobs & scheduling"
description: "Define jobs as documents, run them on demand or from a trigger, and let the scheduler run an allow-listed set unattended under the constraints a client actually imposes."
sidebar_position: 3
sidebar_label: "Jobs & scheduling"
---

A job is a `~Job` document whose `content` defines an `execute` function. The job engine runs it when asked and records every run as a `~JobRun` document. The scheduler decides when to ask.

## Define a job

```typescript
const content = `
    async function execute(stack, params, job) {
        const cutoff = Date.now() - params.olderThanDays * 86400000;
        const { rows } = await stack.query(
            'SELECT _id FROM Task WHERE isComplete = true AND "~updateTimestamp" < ?', cutoff
        );
        for (const row of rows) await stack.deleteDocument(row._id);
        return { metadata: { archived: (job.metadata?.archived ?? 0) + rows.length } };
    }
`;

// SHA-256 of the content, hex. The engine verifies it before every run.
const sha256 = async (text: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

await stack.db.bulkDocs([{
    _id: 'Job-ArchiveOldTasks',
    '~class': '~Job',
    name: 'Archive completed tasks',
    description: 'Moves completed tasks older than 30 days into the archive.',
    type: 'user',
    workerPlatform: 'client',
    isEnabled: true,
    isSingleton: true,
    defaultParams: { olderThanDays: 30 },
    metadata: { archived: 0 },
    content,
    hash: await sha256(content),
}]);
```

`content` must define `execute(stack, params, job)`:

- `stack` is the `ClientStack` the job runs on.
- `params` is `defaultParams` merged with whatever the caller passed at run time.
- `job` is the job document itself, including its current `metadata`.

Return `{ metadata }` to persist state across runs; it is written back to the job document and recorded on the run as `finalMetadata`. The full document shape is in [Trigger and job document models](../reference/trigger-and-job-models.md).

`hash` is the SHA-256 hex digest of `content`, and it is mandatory. The engine does not compute it for you: compute it when you write the job, and again whenever you change `content`. Before every run the engine recomputes the digest and refuses a job whose stored hash does not match with `Job content hash mismatch`. The hash detects corruption, not authorship; see "Why an allow-list" below for what makes it mean something.

## Run it

```typescript
const run = await stack.jobEngine.executeJob('Job-ArchiveOldTasks', { olderThanDays: 60 });
console.log(run.status, run.durationMs, run.finalMetadata);
```

`executeJob(jobId, runtimeArgs?, triggerType?)` returns the completed `~JobRun`. A run moves through `PENDING`, `RUNNING` and then `SUCCESS` or `FAILURE`; a failure keeps `errorMessage` and `errorStack` on the run rather than throwing. Two conditions are recorded as `SKIPPED` and thrown: the job is disabled (`isEnabled: false`), or it is a singleton with a run already `RUNNING`.

Triggers start jobs with `triggerType: 'event'`; see [Triggers](./triggers.md). The scheduler starts them with `'scheduled'`.

## Running jobs unattended

`JobEngine` executes a job when something asks it to. `JobScheduler`, at `stack.jobScheduler`, decides *when* to ask. It is created with the stack and **deliberately not started by it**: which jobs may run with nobody watching is the application's decision, not the library's.

```typescript
stack.jobScheduler.start({
    jobs: ['Job-ArchiveOldTasks', 'Job-ReviewRequests'],   // nothing else runs unattended
    pinnedHashes: { 'Job-ReviewRequests': '9f2c…' },       // optional; see "Why an allow-list"
    intervalMs: 60_000,
    onRun: (run) => console.log(run.jobId, run.status),
});

// The engine imports no DOM, so wake signals are yours. tick() is idempotent.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void stack.jobScheduler.tick();
});
```

Put the schedule on the job document, in `schedule`:

| Form | Meaning |
| :--- | :--- |
| `@every 30m`, `@every 6h`, `@every 7d` | Interval since the last run. Units `s`, `m`, `h`, `d`, `w`; not shorter than 30 seconds. |
| `@hourly`, `@daily`, `@weekly` | The top of the local hour, local midnight, or Monday at local midnight. |
| `@daily@09:00`, `@weekly@18:30` | A local wall-clock time. |

Anchored forms follow the device's local time across daylight-saving changes: `@daily@09:00` stays nine o'clock to the person reading the screen.

### Cron is not accepted, on purpose

`parseSchedule` returns `null` for `0 9 * * *`, and the scheduler skips the job and reports `unparseable-schedule`. Cron's vocabulary names *occurrences* ("02:15 on the 3rd"), and a client cannot promise to be running at one: it is a closed tab, a suspended app, a sleeping laptop. Accepting the syntax would promise a precision the runtime cannot keep, and the failure would be silent. The forms above say what a client can honour: **not more often than this.**

For the same reason, **missed occurrences collapse into a single run.** A device closed for a fortnight does not come back to fourteen catch-up runs of a daily job.

### What a scheduled job must do

Two devices will both reach the same due moment, and there is no lock: leader election needs a consensus point that two offline replicas do not have. So the guarantee has to live in the job:

> **Write documents whose `_id` is derived from what they are about.** `ReviewRequest-<orderId>`, never a fresh UUID.

A second device's sweep then collides into one document instead of sending a second email. Two devices that were offline together produce one document with a conflict, which is still one review request.

The pattern that follows is *poll a bounded window, filter against current state, write deterministic ids*:

```javascript
async function execute(stack, params) {
    const now = Date.now();
    // Bounded: a first sync carrying two years of orders must not ask for two years of reviews.
    const horizon = now - (params.horizonDays ?? 30) * 86400000;

    const due = await stack.db.find({
        selector: { '~class': 'Order', reviewDueAt: { $gte: horizon, $lte: now } },
        limit: params.batch ?? 100,
    });

    const docs = [];
    for (const order of due.docs) {
        const id = `ReviewRequest-${order._id}`;              // the dedupe key
        if (await stack.db.get(id).catch(() => null)) continue;
        if (order.reviewedAt || order.customerOptedOut) continue;
        docs.push({ _id: id, '~class': 'ReviewRequest', order: order._id, status: 'due' });
    }
    if (docs.length) await stack.db.bulkDocs(docs);
    return { metadata: { lastSweepAt: now, created: docs.length } };
}
```

Note what the job does *not* do: it writes an intent document rather than sending anything. Delivery is a separate consumer, which keeps channel credentials off the client and makes the campaign testable without contacting anyone.

A trigger pairs well with this. Stamping `reviewDueAt = deliveredAt + 7d` on the write that sets `deliveredAt` does the per-entity date arithmetic once, where the information is, and leaves the sweep a single indexable range query.

### Why an allow-list

`start()` requires `jobs`, and there is no "all".

`~Job.content` is JavaScript; an application's job documents replicate (the class is part of the data model, which an `include` filter keeps regardless); and the engine hydrates the content with `new Function`, which runs with full ambient authority. Until unattended execution existed, a human was always behind a run. The allow-list keeps that true: a job document arriving over sync cannot become code that runs itself.

`pinnedHashes` goes further for jobs whose code must not change under the application. The `hash` stored on the document cannot do this alone: it sits beside the content it certifies, so whoever writes one writes the other. It detects corruption, not authorship. Pinning the expected value in application code is what gives it meaning; a mismatch is reported as `hash-mismatch` and the job does not run.

### Runs that never came back

Every tick first moves `~JobRun` documents left `RUNNING` past a ceiling (15 minutes by default) to `CANCELED`. A run's status only changes inside `execute`'s `try`/`catch`, so a tab closed mid-run would leave one `RUNNING` for ever, and the singleton check would then skip that job on that device permanently.

Failures back off exponentially (5 minutes, doubling, capped at 6 hours), so a job that throws on a malformed document does not become a `~JobRun` written every minute.

### Where the state lives

Schedule state is kept in `_local/docstack-job-schedule`, which never replicates. It is per-device state: every device would otherwise write `nextRunTimestamp` on every run and conflict on a document whose `content` is executable code. `status()` returns what the scheduler believes without a database round-trip; `drain()` resolves when every job it started has finished; `stop()` stops scheduling but does not cancel a hydrated function that is already running.

Every option and its default is in [Scheduler options](../reference/scheduler-options.md).

## Jobs inside migrations

A patch can carry `preApply` and `postApply` one-shot jobs that follow the same `execute(stack, params, job)` convention but are never persisted as `~Job` documents. They run inside the patch chain's transaction, so a data massage and the model change it enables land in one commit or not at all. See [Schema patches](./patches.md).
