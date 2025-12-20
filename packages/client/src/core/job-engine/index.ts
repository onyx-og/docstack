import type ClientStack from "../stack.js";
import type { JobModel, JobRunModel, JobStatus, JobTriggerType } from "@docstack/shared";

/**
 * Calculates a SHA-256 hash of the given content.
 * Used to verify job content integrity.
 * @param content - The string content to hash
 * @returns The hex-encoded hash string
 */
const calculateHash = async (content: string): Promise<string> => {
    const getCrypto = () => globalThis.crypto;
    const crypto = getCrypto();
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const now = () => Date.now();

/**
 * Represents an executable job that can perform background tasks.
 * 
 * Jobs are stored as documents with executable content that is verified
 * via hash before execution. They support singleton mode (only one instance
 * can run at a time), metadata persistence, and run history tracking.
 * 
 * @example
 * ```typescript
 * // Jobs are typically executed via JobEngine
 * const run = await stack.jobEngine.executeJob('Job-auth', {
 *     password: 'user-password',
 *     salt: 'user-salt'
 * });
 * console.log('Job result:', run.finalMetadata);
 * ```
 */
export class Job {
    /** The JobModel document containing job configuration and content. */
    public readonly model: JobModel;
    /** Reference to the parent stack for database operations. */
    private readonly stack: ClientStack;

    private constructor(model: JobModel, stack: ClientStack) {
        this.model = model;
        this.stack = stack;
    }

    /**
     * Creates a validated Job instance from a JobModel document.
     * Verifies the content hash to ensure integrity.
     * 
     * @param model - The JobModel document from the database
     * @param stack - The parent ClientStack instance
     * @returns A validated Job instance
     * @throws Error if the content hash doesn't match
     */
    public static async create(model: JobModel, stack: ClientStack): Promise<Job> {
        const computed = await calculateHash(model.content);
        if (computed !== model.hash) {
            throw new Error(`Job content hash mismatch for ${model._id}`);
        }
        return new Job(model, stack);
    }

    /**
     * Hydrates the job content into an executable function.
     * The job content must define an `execute(stack, params, job)` function.
     */
    private hydrate() {
        return new Function("stack", "params", "job", `"use strict"; ${this.model.content}; return execute(stack, params, job);`);
    }

    private async hasRunningInstance() {
        if (!this.model.isSingleton) return false;
        const existingRuns = await (this.stack.db as any).find({
            selector: {
                "~class": "~JobRun",
                jobId: this.model._id,
                status: "RUNNING",
            },
            limit: 1,
        });
        return Boolean(existingRuns?.docs?.length);
    }

    private buildRun(triggerType: JobTriggerType, runtimeArgs?: Record<string, any>): JobRunModel {
        const getCrypto = () => globalThis.crypto;
        const crypto = getCrypto();
        const id = `JobRun-${crypto.randomUUID ? crypto.randomUUID() :
                Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
            }`;
        const base: JobRunModel = {
            _id: id,
            "~class": "~JobRun",
            jobId: this.model._id,
            status: "PENDING" as JobStatus,
            triggerType,
            startTime: now(),
            runtimeArgs,
            initialMetadata: this.model.metadata ? { ...this.model.metadata } : undefined,
        };
        return base;
    }

    private async persistRun(run: JobRunModel) {
        const existing = await this.stack.db.get<JobRunModel>(run._id).catch(() => null);
        const doc = existing ? { ...run, _rev: existing._rev } : run;
        await this.stack.db.bulkDocs([doc as any]);
        return (doc as JobRunModel);
    }

    private async persistJobMetadata(metadata?: Record<string, any>) {
        if (!metadata) return;
        const current = await this.stack.db.get<JobModel>(this.model._id).catch(() => null);
        const nextDoc: JobModel = {
            ...this.model,
            _rev: current?._rev,
            metadata,
        } as JobModel;
        await this.stack.db.bulkDocs([nextDoc as any]);
    }

    /**
     * Executes the job with optional runtime arguments.
     * 
     * Creates a JobRun document to track execution, handles singleton logic,
     * and persists any metadata updates from the job execution.
     * 
     * @param runtimeArgs - Optional parameters to pass to the job
     * @param triggerType - How the job was triggered ('manual', 'scheduled', etc.)
     * @returns The completed JobRunModel with status and results
     * @throws Error if the job is disabled or a singleton instance is already running
     * 
     * @example
     * ```typescript
     * const run = await job.execute({ userId: 'user-123' }, 'manual');
     * if (run.status === 'SUCCESS') {
     *     console.log('Result:', run.finalMetadata);
     * }
     * ```
     */
    public async execute(runtimeArgs?: Record<string, any>, triggerType: JobTriggerType = "manual") {
        let run = this.buildRun(triggerType, runtimeArgs);
        run = await this.persistRun(run);

        if (!this.model.isEnabled) {
            run.status = "SKIPPED";
            run.errorMessage = `Job ${this.model._id} is disabled`;
            run.endTime = now();
            run.durationMs = run.endTime - run.startTime;
            await this.persistRun(run);
            throw new Error(run.errorMessage);
        }

        if (await this.hasRunningInstance()) {
            run.status = "SKIPPED";
            run.errorMessage = `Job ${this.model._id} already has a running instance`;
            run.endTime = now();
            run.durationMs = run.endTime - run.startTime;
            await this.persistRun(run);
            throw new Error(run.errorMessage);
        }

        try {
            run.status = "RUNNING";
            run.startTime = now();
            run = await this.persistRun(run);

            const executor = this.hydrate();
            const params = { ...(this.model.defaultParams || {}), ...(runtimeArgs || {}) };
            const result = await executor(this.stack, params, this.model);
            const finalMetadata = (result && result.metadata) || this.model.metadata;

            if (finalMetadata) {
                run.finalMetadata = finalMetadata;
                this.model.metadata = finalMetadata;
                await this.persistJobMetadata(finalMetadata);
            }

            run.status = "SUCCESS";
            run.endTime = now();
            run.durationMs = run.endTime - run.startTime;
            return await this.persistRun(run);
        } catch (error: any) {
            run.status = "FAILURE";
            run.errorMessage = error?.message || String(error);
            run.errorStack = error?.stack;
            run.endTime = now();
            run.durationMs = run.endTime - run.startTime;
            return await this.persistRun(run);
        }
    }
}

/**
 * Engine for executing background jobs in the DocStack system.
 * 
 * The JobEngine provides a simple interface to execute jobs by their ID.
 * Jobs are fetched from the database, validated, and executed with
 * full run tracking and metadata persistence.
 * 
 * @example
 * ```typescript
 * // Execute a job
 * const run = await stack.jobEngine.executeJob('Job-process-data', {
 *     batchSize: 100
 * });
 * 
 * console.log('Status:', run.status);
 * console.log('Duration:', run.durationMs, 'ms');
 * ```
 */
export class JobEngine {
    /** Reference to the parent stack for database operations. */
    private readonly stack: ClientStack;

    /**
     * Creates a new JobEngine instance.
     * @param stack - The parent ClientStack instance
     */
    constructor(stack: ClientStack) {
        this.stack = stack;
    }

    /**
     * Executes a job by its document ID.
     * 
     * @param jobId - The job document ID (e.g., 'Job-auth')
     * @param runtimeArgs - Optional parameters to pass to the job
     * @param triggerType - How the job was triggered (default: 'manual')
     * @returns The completed JobRunModel with execution results
     * 
     * @example
     * ```typescript
     * const authRun = await jobEngine.executeJob('Job-auth', {
     *     password: 'secret',
     *     salt: 'user-salt'
     * });
     * const derivedKey = authRun.finalMetadata?.derivedKey;
     * ```
     */
    public async executeJob(jobId: string, runtimeArgs?: Record<string, any>, triggerType: JobTriggerType = "manual") {
        const jobDoc = await this.stack.db.get<JobModel>(jobId);
        const job = await Job.create(jobDoc, this.stack);
        return job.execute(runtimeArgs, triggerType);
    }
}
