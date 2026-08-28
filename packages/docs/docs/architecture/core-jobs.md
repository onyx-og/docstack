# Job Engine

```typescript
// Example Job Definition: A simple counter job that increments a value
// This job can be executed manually, or on a schedule — see "Running jobs unattended".
const counterJob = {
  _id: 'Job-Counter',
  '~class': '~Job',
  name: 'Simple Counter',
  description: 'Increments a counter in the job metadata',
  type: 'user', // Can be 'system' or 'user'
  workerPlatform: 'client', // Or 'server' if applicable
  content: `
function execute(_stack, params, job) {
    const current = params?.value ?? job.metadata?.counter ?? 0;
    const next = current + 1;
    return { metadata: { counter: next } };
}
`,
  isEnabled: true,
  isSingleton: false, // Allows multiple instances to run concurrently
  defaultParams: { value: 0 },
  metadata: { counter: 0 } // Initial metadata
};

// To execute this job (assuming 'stack' is available):
// await stack.db.bulkDocs([counterJob]); // First, save the job definition
// const runResult = await stack.jobEngine.executeJob('Job-Counter', { value: 5 });
// console.log(runResult.finalMetadata.counter); // Expected output: 6
```

## Overview (For Business Analysts)

### What is the Job Engine?
The DocStack Job Engine is a powerful system designed to automate and manage background tasks within your application. Think of it as a dedicated worker that can execute predefined pieces of logic, called "Jobs," at specific times, in response to events, scheduled or on demand. Unlike immediate operations that block user interaction, Jobs run asynchronously, ensuring your application remains responsive.

### Why use the Job Engine?
The Job Engine brings significant business value by enabling automation, improving efficiency, and ensuring data integrity:

*   **Automation of Repetitive Tasks**: Automate routine operations like data cleanup, report generation, or periodic data synchronization, freeing up human resources for more critical tasks.
*   **Improved System Responsiveness**: Long-running or computationally intensive operations can be offloaded to Jobs, preventing the main application thread from freezing and providing a smoother user experience.
*   **Enhanced Data Consistency**: Implement complex business rules or data transformations that need to run reliably in the background, ensuring your data always meets required standards.
*   **Scheduled Operations**: Jobs can run on a schedule with nobody watching — see "Running jobs unattended" below for what a client can and cannot promise about *when*.
*   **Auditable Execution**: Every Job execution is recorded as a "Job Run," providing a clear audit trail of what happened, when, and with what outcome.

### Common Business Use Cases:
*   **Data Synchronization**: Periodically sync data with external systems or perform internal data migrations.
*   **Report Generation**: Generate daily, weekly, or monthly reports without impacting the performance of the live application.
*   **Notification Systems**: Send out email alerts, push notifications, or SMS messages based on specific criteria or schedules.
*   **Complex Calculations**: Perform batch calculations or data aggregations that are too heavy for real-time processing.
*   **Data Archiving/Cleanup**: Automatically move old data to archives or delete obsolete records to maintain database performance.

At its core, the Job Engine allows you to define application logic as data, making your system more flexible, configurable, and easier to evolve without constant code deployments.

## Guide: Creating and Executing a Simple Job

This guide walks you through defining, persisting, and executing a basic job that increments a counter.

### Step 1: Define Your Job
A job is defined by a `JobModel` document. The most crucial part is the `content` field, which holds the JavaScript function to be executed.

```typescript
const myFirstJob = {
  _id: 'Job-MyFirstJob',
  '~class': '~Job', // Essential for the Job Engine to recognize it
  name: 'My First Job',
  description: 'A simple job that logs a message and updates metadata.',
  type: 'user',
  workerPlatform: 'client', // Indicates where the job should run (e.g., in the browser client)
  content: `
function execute(stack, params, job) {
    console.log('Hello from My First Job!', params);
    const currentCount = job.metadata?.count ?? 0;
    const newCount = currentCount + 1;
    return { metadata: { count: newCount, lastRun: new Date().toISOString() } };
}
`,
  isEnabled: true, // Set to false to prevent execution
  isSingleton: false, // If true, only one instance of this job can run at a time
  defaultParams: { initialMessage: 'Starting job...' },
  metadata: { count: 0 } // Initial metadata for the job
};
```

The `execute` function within the `content` string is the heart of your job. It receives three arguments:
*   `stack`: The `ClientStack` instance, providing access to the database (`stack.db`) and other core functionalities.
*   `params`: An object containing parameters passed to the job. This merges `defaultParams` from the `JobModel` with any `runtimeArgs` provided during execution.
*   `job`: The `JobModel` itself, allowing the job to access its own definition and current `metadata`.

The `execute` function should return an object. If this object contains a `metadata` property, the job's `metadata` in the `JobModel` will be updated, and this `metadata` will also be stored in the `JobRunModel` as `finalMetadata`.

### Step 2: Persist the Job Definition
Before a job can be executed, its `JobModel` must be saved to the DocStack database.

```typescript
// Assuming 'stack' is your ClientStack instance
await stack.db.bulkDocs([myFirstJob]);
console.log('Job definition saved!');
```

### Step 3: Execute the Job
Once saved, you can execute the job using the `jobEngine` service available on your `stack` instance.

```typescript
// Execute the job by its _id
const jobRunResult = await stack.jobEngine.executeJob('Job-MyFirstJob', { customParam: 'value' });

console.log('Job execution complete!');
console.log('Run Status:', jobRunResult.status); // e.g., 'SUCCESS', 'FAILURE', 'SKIPPED'
console.log('Final Job Metadata:', jobRunResult.finalMetadata);

// You can also fetch the updated JobModel to see its new metadata
const updatedJob = await stack.db.get('Job-MyFirstJob');
console.log('Updated Job Model Metadata:', updatedJob.metadata);
```

The `executeJob` method returns a `JobRunModel` document, which provides details about the specific execution, including its status, duration, and any error messages.

## Running jobs unattended

`JobEngine` executes a job when something asks it to. `JobScheduler` — `stack.jobScheduler`
— decides *when* to ask. It is created with the stack and **deliberately not started by
it**: which jobs may run with nobody watching is the application's decision, not the
library's.

```typescript
stack.jobScheduler.start({
    jobs: ['Job-review-campaign', 'Job-cross-sell'],   // nothing else runs unattended
    pinnedHashes: { 'Job-review-campaign': '9f2c…' },  // optional; see "Why an allow-list"
});

// `core/` imports no DOM, so wake signals are yours. `tick()` is idempotent.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void stack.jobScheduler.tick();
});
```

Put the schedule on the job document, in `schedule`:

| Form | Meaning |
| :--- | :--- |
| `@every 30m`, `@every 6h`, `@every 7d` | Interval since the last run |
| `@hourly`, `@daily`, `@weekly` | The local hour, midnight, or Monday |
| `@daily@09:00`, `@weekly@18:30` | A local wall-clock time |

### Cron is not accepted, on purpose

`parseSchedule` returns `null` for `0 9 * * *`, and the scheduler skips the job and reports
`unparseable-schedule`. Cron's vocabulary names *occurrences* — "02:15 on the 3rd" — and a
client cannot promise to be running at one: it is a closed tab, a suspended app, a sleeping
laptop. Accepting the syntax would promise a precision the runtime cannot keep, and the
failure would be silent. The forms above say what a client can honour: **not more often
than this.**

For the same reason, **missed occurrences collapse into a single run.** A device closed for
a fortnight does not come back to fourteen catch-up runs of a daily job.

### What a scheduled job must do

Two devices will both reach the same due moment, and there is no lock — leader election
needs a consensus point that two offline replicas do not have. So the guarantee has to live
in the job:

> **Write documents whose `_id` is derived from what they are about.**
> `ReviewRequest-<orderId>`, never a fresh UUID.

A second device's sweep then collides into one document instead of sending a second email.
Two devices that were offline together produce one document with a conflict — still one
review request.

The pattern that follows is *poll a bounded window, filter against current state, write
deterministic ids*:

```javascript
async function execute(stack, params) {
    const now = Date.now();
    // Bounded: a first sync carrying two years of orders must not ask for two years of
    // reviews.
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

Note what the job does *not* do: it writes an intent document rather than sending anything.
Delivery is a separate consumer, which keeps channel credentials off the client and makes
the campaign testable without contacting anyone.

A `Trigger` pairs well with this. Stamping `reviewDueAt = deliveredAt + 7d` on the write
that sets `deliveredAt` does the per-entity date arithmetic once, where the information is,
and leaves the sweep a single indexable range query.

### Why an allow-list

`start()` requires `jobs`, and there is no "all".

`~Job.content` is JavaScript; an application's job documents replicate (the class is in
`DATA_MODEL_CLASSES`, which an `include` filter keeps regardless); and `Job` hydrates the
content with `new Function`, which runs with full ambient authority. Until unattended
execution existed, a human was always behind a run. The allow-list keeps that true: a job
document arriving over sync cannot become code that runs itself.

`pinnedHashes` goes further for jobs whose code must not change under the application. The
`hash` stored on the document cannot do this alone — it sits beside the content it
certifies, so whoever writes one writes the other. It detects corruption, not authorship.
Pinning the expected value in application code is what gives it meaning.

### Runs that never came back

Every tick first moves `~JobRun` documents left `RUNNING` past a ceiling (15 minutes by
default) to `CANCELED`. A run's status only changes inside `execute`'s `try`/`catch`, so a
tab closed mid-run leaves one `RUNNING` for ever — and the singleton check would then skip
that job on that device permanently.

Failures back off exponentially (5 minutes, doubling, capped at 6 hours), so a job that
throws on a malformed document does not become a `~JobRun` written every minute.

### `JobScheduler` API

```typescript
class JobScheduler {
    /** Begin scheduling, and evaluate once immediately. */
    start(options: SchedulerOptions): void;
    /** Evaluate now. Idempotent; concurrent calls share one evaluation. */
    tick(): Promise<TickReport>;
    /** Stop. Jobs already dispatched keep running — a hydrated function has no cancel. */
    stop(): void;
    /** Resolves when every job this scheduler started has finished. */
    drain(): Promise<void>;
    /** What it believes, without a database round-trip. */
    status(): { running: boolean; inFlight: string[]; jobs: Record<string, JobScheduleState> };
}
```

| Option | Default | |
| :--- | :--- | :--- |
| `jobs` | — | **Required.** Job ids allowed to run unattended. |
| `pinnedHashes` | `{}` | Expected `hash` per job. A mismatch fails closed. |
| `intervalMs` | `60_000` | Floor between automatic ticks (minimum 5s). |
| `staleRunMs` | `900_000` | A `RUNNING` run older than this is swept. |
| `backoffBaseMs` / `maxBackoffMs` | `300_000` / `6h` | Retry delay after a failure. |
| `now` | `Date.now` | Injectable clock. |
| `onRun` | — | Called with each completed run. |

Schedule state is kept in `_local/docstack-job-schedule`, which never replicates — it is
per-device state, and `JobModel.nextRunTimestamp` is *not* where it goes: every device
would write that field on every run and conflict on a document whose `content` is
executable code.

## API Reference (For Developers)

The Job Engine revolves around two primary data models: `~Job` (the job definition) and `~JobRun` (a record of a job's execution).

### `JobModel` (`~Job` Class)
Represents the definition of a background task.

| Field | Type | Description |
| :---- | :--- | :---------- |
| `_id` | `string` | Unique identifier for the job (e.g., `Job-MyJobName`). |
| `~class` | `string` | Always `~Job`. |
| `name` | `string` | A human-readable name for the job. |
| `description` | `string` | A brief explanation of what the job does. |
| `type` | `'system' | 'user'` | Categorizes the job (e.g., system-level tasks vs. user-defined tasks). |
| `workerPlatform` | `'client' | 'server'` | Specifies where the job's `content` should be executed. |
| `content` | `string` | The JavaScript code string containing the `execute` function. |
| `hash` | `string` | SHA-256 hash of the `content` string, used for integrity verification. |
| `isEnabled` | `boolean` | If `false`, the job will be skipped and a `SKIPPED` run recorded. |
| `isSingleton` | `boolean` | If `true`, only one instance of this job can run at a time. Subsequent executions while one is running will be `SKIPPED`. |
| `defaultParams` | `Record<string, any>` | Default parameters passed to the `execute` function. Merged with `runtimeArgs`. |
| `metadata` | `Record<string, any>` | Arbitrary data associated with the job, persistent across runs. Can be updated by the `execute` function. |

### `JobRunModel` (`~JobRun` Class)
Records the details of a single execution of a `JobModel`.

| Field | Type | Description |
| :---- | :--- | :---------- |
| `_id` | `string` | Unique identifier for the job run (e.g., `JobRun-UUID`). |
| `~class` | `string` | Always `~JobRun`. |
| `jobId` | `string` | The `_id` of the `JobModel` that was executed. |
| `status` | `'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'SKIPPED'` | The current status of the job run. |
| `triggerType` | `'manual' | 'scheduled' | 'event'` | How the job was initiated. |
| `startTime` | `number` | Timestamp (milliseconds) when the job run started. |
| `endTime` | `number` | Timestamp (milliseconds) when the job run finished. |
| `durationMs` | `number` | Duration of the job run in milliseconds. |
| `runtimeArgs` | `Record<string, any>` | Parameters specifically passed for this execution. |
| `initialMetadata` | `Record<string, any>` | A snapshot of the `JobModel.metadata` at the start of the run. |
| `finalMetadata` | `Record<string, any>` | The `metadata` returned by the `execute` function, or the `initialMetadata` if none returned. |
| `errorMessage` | `string` | If `status` is `FAILURE` or `SKIPPED`, contains a descriptive error message. |
| `errorStack` | `string` | If `status` is `FAILURE`, contains the stack trace of the error. |

### `JobEngine` Class
The primary interface for interacting with the Job Engine.

```typescript
class JobEngine {
  constructor(stack: ClientStack);

  /**
   * Executes a job by its ID.
   *
   * @param jobId The _id of the JobModel to execute.
   * @param runtimeArgs Optional parameters to pass to the job's execute function.
   * @param triggerType The type of trigger for this execution (defaults to 'manual').
   * @returns A Promise that resolves to the JobRunModel representing this execution.
   * @throws An Error if the job is disabled or a singleton job is already running.
   */
  public async executeJob(
    jobId: string,
    runtimeArgs?: Record<string, any>,
    triggerType: JobTriggerType = "manual"
  ): Promise<JobRunModel>;
}
```

### Job `content` Function Signature
The JavaScript string provided in `JobModel.content` must define an `async` function named `execute` with the following signature:

```typescript
async function execute(stack: ClientStack, params: Record<string, any>, job: JobModel): Promise<{ metadata?: Record<string, any> } | void> {
  // Your job logic here
  // Access database via stack.db
  // Use params for input
  // Access job definition via job

  // Optionally return an object with a 'metadata' property to update the job's persistent metadata
  return { metadata: { /* new metadata */ } };
}
```

### Security and Reliability

Similar to Triggers, the Job Engine executes dynamic code using `new Function()`. This approach provides a **sandboxed environment**, isolating the job's execution from the main application scope and mitigating security risks associated with `eval()`.

Each job definition includes a `hash` of its `content`. This hash is verified before execution to ensure the job's code has not been tampered with since its last save, adding a layer of integrity checking.

Robust error handling ensures that failures within a job's `execute` function are caught, recorded in the `JobRunModel` (including `errorMessage` and `errorStack`), and do not crash the main application. Singleton jobs prevent concurrent execution, avoiding potential race conditions for tasks that must run exclusively.
