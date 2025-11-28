import crypto from "crypto";
import type ClientStack from "../stack.js";
import type { JobModel, JobRunModel, JobStatus, JobTriggerType } from "@docstack/shared";

const calculateHash = (content: string): string => {
    return crypto.createHash("sha256").update(content).digest("hex");
};

const now = () => Date.now();

export class Job {
    public readonly model: JobModel;
    private readonly stack: ClientStack;

    constructor(model: JobModel, stack: ClientStack) {
        this.model = model;
        this.stack = stack;

        const computed = calculateHash(model.content);
        if (computed !== model.hash) {
            throw new Error(`Job content hash mismatch for ${model._id}`);
        }
    }

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
        const id = `JobRun-${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")}`;
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

export class JobEngine {
    private readonly stack: ClientStack;

    constructor(stack: ClientStack) {
        this.stack = stack;
    }

    public async executeJob(jobId: string, runtimeArgs?: Record<string, any>, triggerType: JobTriggerType = "manual") {
        const jobDoc = await this.stack.db.get<JobModel>(jobId);
        const job = new Job(jobDoc, this.stack);
        return job.execute(runtimeArgs, triggerType);
    }
}
