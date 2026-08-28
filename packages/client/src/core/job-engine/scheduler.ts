/**
 * Running jobs unattended, on a client.
 *
 * {@link JobEngine} executes a job when something asks it to. This decides *when* to
 * ask, on a device that a server-side scheduler's assumptions do not describe:
 *
 * 1. **The app is closed most of the time.** "Daily at 09:00" is missed on most days.
 * 2. **Timers are throttled or frozen.** A background tab gets about one tick a minute;
 *    a suspended app gets none, and `setInterval` does not catch up on wake.
 * 3. **There are several instances.** Two devices, or two tabs, run this against
 *    replicas of the same `~Job` documents.
 * 4. **A run can vanish mid-flight.** A closed tab kills a `RUNNING` job with no
 *    `catch`, no `finally`, and no process left to notice.
 * 5. **The clock is the user's.** It can be wrong, and it can move backwards.
 *
 * Four rules answer those, and each is load-bearing:
 *
 * - **Missed occurrences collapse into one run** ({@link nextOccurrence}). Never a
 *   backlog.
 * - **Schedule state is device-local**, in a `_local/` document. `JobModel.nextRunTimestamp`
 *   looks like the place for it and is not: an application's `~Job` documents replicate —
 *   `DATA_MODEL_CLASSES` keeps them even under an `include` allow-list — so every device
 *   would write that field on every run and collide on a document whose `content` field is
 *   executable code. A losing revision there does not lose a timestamp, it forks what the
 *   job does.
 * - **Duplicate work is answered by the jobs, not by a lock.** Leader election needs a
 *   consensus point that two offline replicas do not have. Jobs that run here must write
 *   documents whose `_id` is derived from what they are about (`ReviewRequest-<orderId>`),
 *   so a second device's sweep collides into one document instead of sending a second
 *   email. The scheduler cannot enforce that; it is the price of running campaign logic
 *   on clients.
 * - **Only named jobs run unattended** ({@link SchedulerOptions.jobs}). `~Job.content` is
 *   JavaScript, it replicates, and {@link Job} hydrates it with `new Function` — which
 *   runs with full ambient authority, whatever the docs call it. Until now a human was
 *   always behind an execution. An allow-list keeps that true: a job document arriving
 *   over sync cannot become code that runs itself.
 *
 * @module
 */

import type { JobModel, JobRunModel } from "@docstack/shared";

import createLogger from "../../utils/logger/index.js";
import { isImplausible, nextOccurrence, parseSchedule } from "./schedule.js";

const logger = createLogger().child({ module: "job-scheduler" });

/** The `_local/` document holding this device's schedule state. Never replicates. */
export const JOB_SCHEDULE_DOC_ID = "_local/docstack-job-schedule";

/** What the scheduler needs from a stack. Narrow on purpose, so it can be tested without one. */
export interface SchedulerHost {
    db: {
        get: (id: string) => Promise<any>;
        put: (doc: any) => Promise<any>;
        bulkDocs: (docs: any[]) => Promise<any>;
        find: (request: any) => Promise<{ docs: any[] }>;
    };
    jobEngine: {
        executeJob: (jobId: string, runtimeArgs?: Record<string, any>, triggerType?: string) => Promise<JobRunModel>;
    };
}

/** Per-job bookkeeping, as stored in {@link JOB_SCHEDULE_DOC_ID}. */
export interface JobScheduleState {
    /** When this job next comes due on this device. */
    nextRunAt: number;
    /** When this device last dispatched it. */
    lastRunAt?: number;
    /** Outcome of that dispatch. */
    lastStatus?: string;
    /** Drives the backoff. Reset by any success. */
    consecutiveFailures: number;
    /** The schedule string this state was computed from; a change to it resets the state. */
    schedule?: string;
}

/** Why a due-looking job was not dispatched. Reported rather than thrown. */
export type SkipReason =
    | "missing"
    | "disabled"
    | "no-schedule"
    | "unparseable-schedule"
    | "hash-mismatch"
    | "in-flight"
    | "not-due";

export interface TickReport {
    /** The instant the tick was evaluated at. */
    at: number;
    /** Jobs dispatched by this tick. They may still be running when the report is returned. */
    dispatched: string[];
    skipped: { jobId: string; reason: SkipReason }[];
    /** Abandoned `RUNNING` runs moved to `CANCELED`. */
    sweptRuns: number;
}

export interface SchedulerOptions {
    /**
     * Job ids allowed to run unattended.
     *
     * Required, and there is deliberately no "all": see the module docblock. Manual
     * {@link JobEngine.executeJob} is unaffected — it already has a human behind it.
     */
    jobs: string[];
    /**
     * Expected `hash` per job, for jobs whose code must not change under the application.
     *
     * `JobModel.hash` is stored beside the content it certifies, so a peer that writes
     * one writes the other: on its own it detects corruption, not authorship. Pinning the
     * value *in application code* is what makes it mean something.
     */
    pinnedHashes?: Record<string, string>;
    /** Floor between automatic ticks. Default 60s, minimum 5s. */
    intervalMs?: number;
    /** A `RUNNING` run older than this is swept to `CANCELED`. Default 15 minutes. */
    staleRunMs?: number;
    /** First retry delay after a failure; doubles per consecutive failure. Default 5 minutes. */
    backoffBaseMs?: number;
    /** Ceiling for that doubling. Default 6 hours. */
    maxBackoffMs?: number;
    /** Injectable clock, for tests. */
    now?: () => number;
    /** Called with each completed run, successful or not. */
    onRun?: (run: JobRunModel) => void;
}

interface ResolvedOptions extends Required<Omit<SchedulerOptions, "pinnedHashes" | "onRun">> {
    pinnedHashes: Record<string, string>;
    onRun?: (run: JobRunModel) => void;
}

const DEFAULTS = {
    intervalMs: 60_000,
    minIntervalMs: 5_000,
    staleRunMs: 15 * 60_000,
    backoffBaseMs: 5 * 60_000,
    maxBackoffMs: 6 * 60 * 60_000,
    /** Most abandoned runs reaped per tick — a sweep is not a migration. */
    staleRunBatch: 50,
};

interface ScheduleDoc {
    _id: string;
    _rev?: string;
    jobs: Record<string, JobScheduleState>;
}

/**
 * Decides when the jobs an application has approved should run, and dispatches them.
 *
 * Mounted at `stack.jobScheduler`, but never started by the stack: what may run
 * unattended is the application's decision.
 *
 * @example
 * ```typescript
 * stack.jobScheduler.start({
 *     jobs: ["Job-review-campaign", "Job-cross-sell"],
 *     pinnedHashes: { "Job-review-campaign": "9f2c…" },
 * });
 *
 * // Wake sources are the application's, because `core/` imports no DOM:
 * document.addEventListener("visibilitychange", () => {
 *     if (document.visibilityState === "visible") void stack.jobScheduler.tick();
 * });
 * ```
 */
export class JobScheduler {
    private readonly host: SchedulerHost;
    private options: ResolvedOptions | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    /** Jobs this device has dispatched and not yet seen finish. */
    private readonly inFlight = new Set<string>();
    /** Dispatches still running, so {@link drain} can wait for them. */
    private readonly pending = new Set<Promise<void>>();
    /** Deduplicates concurrent ticks — a wake signal and the interval can land together. */
    private ticking: Promise<TickReport> | null = null;
    /** Serialises read-modify-write of the `_local/` document. */
    private stateWrites: Promise<unknown> = Promise.resolve();
    /** Last state read, for {@link status} — reporting must not require a database round-trip. */
    private snapshot: Record<string, JobScheduleState> = {};

    constructor(host: SchedulerHost) {
        this.host = host;
    }

    /**
     * Begins scheduling, and evaluates once immediately.
     *
     * The immediate evaluation is the point: a client's most reliable clock signal is
     * "the app just opened", not a timer that was frozen while it was closed.
     */
    start(options: SchedulerOptions): void {
        if (this.timer) this.stop();

        this.options = {
            jobs: [...options.jobs],
            pinnedHashes: options.pinnedHashes ?? {},
            intervalMs: Math.max(DEFAULTS.minIntervalMs, options.intervalMs ?? DEFAULTS.intervalMs),
            staleRunMs: options.staleRunMs ?? DEFAULTS.staleRunMs,
            backoffBaseMs: options.backoffBaseMs ?? DEFAULTS.backoffBaseMs,
            maxBackoffMs: options.maxBackoffMs ?? DEFAULTS.maxBackoffMs,
            now: options.now ?? (() => Date.now()),
            onRun: options.onRun,
        };

        this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
        // Node keeps the process alive for a pending interval; a scheduler should not be
        // the reason a CLI or a test runner refuses to exit.
        (this.timer as any)?.unref?.();

        void this.tick();
    }

    /**
     * Stops scheduling. Jobs already dispatched keep running — a hydrated `new Function`
     * has no cancellation, and pretending otherwise would leave a `RUNNING` run behind.
     */
    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        // Dropping the options, not just the timer: an application's wake handlers
        // outlive teardown more often than not, and `tick()` from one of them after
        // `stop()` has to be nothing rather than one last dispatch.
        this.options = null;
    }

    /** Whether {@link start} is in effect. */
    get isRunning(): boolean {
        return this.timer !== null;
    }

    /**
     * Evaluates every allowed job and dispatches those that are due.
     *
     * Idempotent and safe to call from any wake signal. Concurrent calls share one
     * evaluation. It returns once dispatch has *started*: a long job does not hold the
     * tick open, because a tick that waits is a tick that stops the others.
     */
    tick(): Promise<TickReport> {
        if (this.ticking) return this.ticking;
        const run = this.runTick().finally(() => {
            this.ticking = null;
        });
        this.ticking = run;
        return run;
    }

    /** Resolves when every job this scheduler started has finished. For teardown and tests. */
    async drain(): Promise<void> {
        while (this.pending.size) {
            await Promise.all([...this.pending]);
        }
    }

    /** What the scheduler believes, without touching the database. */
    status(): { running: boolean; inFlight: string[]; jobs: Record<string, JobScheduleState> } {
        return {
            running: this.isRunning,
            inFlight: [...this.inFlight],
            jobs: { ...this.snapshot },
        };
    }

    // ---------------------------------------------------------------- evaluation

    private async runTick(): Promise<TickReport> {
        const options = this.options;
        const at = options ? options.now() : Date.now();
        const report: TickReport = { at, dispatched: [], skipped: [], sweptRuns: 0 };

        // A wake signal can arrive after stop(); that is not an error, it is nothing.
        if (!options) return report;

        report.sweptRuns = await this.sweepAbandonedRuns(at, options.staleRunMs);

        const due: { jobId: string; job: JobModel; nextRunAt: number }[] = [];

        // The whole read-evaluate-write shares {@link recordOutcome}'s serialisation. A
        // job finishing mid-evaluation would otherwise bump the `_local` rev between
        // this read and this write; the write would 409 and be dropped - and with it
        // the claims it carried, so a job this very tick dispatched would still look
        // due on the next one and run twice inside its own period.
        await this.withState(async doc => {
            for (const jobId of options.jobs) {
                const job = await this.host.db.get(jobId).catch(() => null) as JobModel | null;
                if (!job) {
                    report.skipped.push({ jobId, reason: "missing" });
                    continue;
                }
                if (!job.isEnabled) {
                    report.skipped.push({ jobId, reason: "disabled" });
                    continue;
                }

                const pinned = options.pinnedHashes[jobId];
                if (pinned && pinned !== job.hash) {
                    // Fail closed. The content behind an unexpected hash is exactly the case
                    // the allow-list exists for.
                    logger.warn("tick - job hash does not match the pinned value; not running", { jobId });
                    report.skipped.push({ jobId, reason: "hash-mismatch" });
                    continue;
                }

                if (!job.schedule) {
                    report.skipped.push({ jobId, reason: "no-schedule" });
                    continue;
                }

                const schedule = parseSchedule(job.schedule);
                if (!schedule) {
                    logger.warn("tick - job carries a schedule this client cannot read", {
                        jobId,
                        schedule: job.schedule,
                    });
                    report.skipped.push({ jobId, reason: "unparseable-schedule" });
                    continue;
                }

                const state = doc.jobs[jobId];
                const changedSchedule = state && state.schedule !== schedule.source;

                // First sight of a job, or a schedule that has been rewritten: give it a
                // starting point rather than running it on the spot. A newly installed daily
                // job that fires the instant it is saved would fire again on every device
                // that receives it, which is a stampede dressed as a first run.
                if (!state || changedSchedule) {
                    doc.jobs[jobId] = {
                        nextRunAt: nextOccurrence(schedule, at),
                        consecutiveFailures: 0,
                        schedule: schedule.source,
                    };
                    report.skipped.push({ jobId, reason: "not-due" });
                    continue;
                }

                if (isImplausible(state.nextRunAt, schedule, at)) {
                    logger.warn("tick - stored nextRunAt is further out than the schedule allows; recomputing", {
                        jobId,
                        nextRunAt: state.nextRunAt,
                    });
                    state.nextRunAt = nextOccurrence(schedule, at);
                    report.skipped.push({ jobId, reason: "not-due" });
                    continue;
                }

                if (state.nextRunAt > at) {
                    report.skipped.push({ jobId, reason: "not-due" });
                    continue;
                }

                // Due, but the previous dispatch has not come back. Leaving `nextRunAt`
                // where it is means the job runs as soon as it is free, rather than losing
                // the slot to a run that is still doing it.
                if (this.inFlight.has(jobId)) {
                    report.skipped.push({ jobId, reason: "in-flight" });
                    continue;
                }

                // Claim before dispatching, not after. A tab closed mid-run then costs the
                // job one period, rather than re-running it on every boot from then on —
                // and jobs here are required to be idempotent anyway, so a lost run is the
                // cheaper of the two failures.
                state.nextRunAt = nextOccurrence(schedule, at);
                state.lastRunAt = at;
                due.push({ jobId, job, nextRunAt: state.nextRunAt });
            }
        });

        for (const entry of due) {
            this.inFlight.add(entry.jobId);
            report.dispatched.push(entry.jobId);
            this.track(this.dispatch(entry.jobId, options));
        }

        return report;
    }

    /** Runs one job and records what happened. Never throws: a tick outlives its jobs. */
    private async dispatch(jobId: string, options: ResolvedOptions): Promise<void> {
        try {
            const run = await this.host.jobEngine.executeJob(jobId, undefined, "scheduled");
            await this.recordOutcome(jobId, run.status, options);
            options.onRun?.(run);
        } catch (error: any) {
            // `executeJob` throws for a disabled job and for a blocked singleton, and
            // rejects if the content hash no longer matches. All three are outcomes, not
            // crashes; the backoff is what keeps a permanently broken job from becoming
            // a write per minute.
            logger.warn("dispatch - scheduled job did not run", { jobId, error: error?.message || String(error) });
            await this.recordOutcome(jobId, "FAILURE", options);
        } finally {
            this.inFlight.delete(jobId);
        }
    }

    private async recordOutcome(jobId: string, status: string, options: ResolvedOptions): Promise<void> {
        await this.withState(doc => {
            const state = doc.jobs[jobId];
            if (!state) return;

            state.lastStatus = status;

            if (status === "SUCCESS") {
                state.consecutiveFailures = 0;
                return;
            }

            state.consecutiveFailures += 1;
            const backoff = Math.min(
                options.backoffBaseMs * 2 ** (state.consecutiveFailures - 1),
                options.maxBackoffMs,
            );
            // Backoff replaces the claimed slot only when it pushes the job further out;
            // a daily job that fails should not come back in five minutes *sooner* than
            // its own schedule would have.
            state.nextRunAt = Math.max(state.nextRunAt, options.now() + backoff);
        });
    }

    // ------------------------------------------------------------------- sweeping

    /**
     * Moves this device's abandoned runs to `CANCELED`.
     *
     * A `~JobRun` only changes status inside `Job.execute`'s `try`/`catch`, so a tab
     * closed mid-run leaves one `RUNNING` for ever — and `hasRunningInstance` then skips
     * that singleton job on this device permanently. Unattended execution turns that from
     * a latent oddity into a job that silently stops working, so the sweep runs before
     * every dispatch. `~JobRun` never replicates, so these are unambiguously *this*
     * device's abandoned runs.
     */
    private async sweepAbandonedRuns(at: number, staleRunMs: number): Promise<number> {
        try {
            const found = await this.host.db.find({
                selector: { "~class": "~JobRun", status: "RUNNING" },
                limit: DEFAULTS.staleRunBatch,
            });

            const stale = (found?.docs ?? []).filter(
                (run: JobRunModel) => typeof run.startTime === "number" && at - run.startTime > staleRunMs,
            );
            if (!stale.length) return 0;

            await this.host.db.bulkDocs(
                stale.map((run: JobRunModel) => ({
                    ...run,
                    status: "CANCELED",
                    endTime: at,
                    durationMs: at - run.startTime,
                    errorMessage: "Run abandoned — the client stopped before it finished.",
                })),
            );
            logger.info("sweepAbandonedRuns - reaped abandoned runs", { count: stale.length });
            return stale.length;
        } catch (error: any) {
            logger.warn("sweepAbandonedRuns - could not sweep", { error: error?.message || String(error) });
            return 0;
        }
    }

    // ---------------------------------------------------------------------- state

    private async readState(): Promise<ScheduleDoc> {
        try {
            const doc = await this.host.db.get(JOB_SCHEDULE_DOC_ID);
            const jobs = (doc?.jobs ?? {}) as Record<string, JobScheduleState>;
            this.snapshot = jobs;
            return { _id: JOB_SCHEDULE_DOC_ID, _rev: doc?._rev, jobs };
        } catch {
            return { _id: JOB_SCHEDULE_DOC_ID, jobs: {} };
        }
    }

    private async writeState(doc: ScheduleDoc): Promise<void> {
        this.snapshot = doc.jobs;
        try {
            await this.host.db.put(doc);
        } catch (error: any) {
            // A 409 means another tick wrote first; its state is as good as this one's,
            // and the next tick reads the winner.
            logger.warn("writeState - could not persist schedule state", {
                error: error?.message || String(error),
            });
        }
    }

    /**
     * Read-modify-write against the `_local/` document, serialised.
     *
     * Everything that touches the state document goes through here - tick evaluation
     * and outcome recording alike - so within this instance no write can land between
     * another's read and write. Two *instances* (two tabs) still contend; there the 409
     * in {@link writeState} stands, logged, and the jobs' own idempotency is the answer,
     * as the module docblock requires of them.
     */
    private withState(change: (doc: ScheduleDoc) => void | Promise<void>): Promise<void> {
        const next = this.stateWrites.then(async () => {
            const doc = await this.readState();
            await change(doc);
            await this.writeState(doc);
        });
        this.stateWrites = next.catch(() => undefined);
        return next;
    }

    private track(work: Promise<void>): void {
        this.pending.add(work);
        void work.finally(() => this.pending.delete(work));
    }
}

export default JobScheduler;
