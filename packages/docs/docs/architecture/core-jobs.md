# Job Engine

```typescript
// Example Job Definition: A simple counter job that increments a value
// This job can be executed manually or on a schedule (not covered here).
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
*   **Scheduled Operations**: Although not directly covered in this document, the Job Engine forms the foundation for scheduling tasks, allowing you to define when and how often certain business processes should run.
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
