/**
 * The scheduler is tested against a hand-rolled {@link SchedulerHost} rather than a real
 * stack, for two reasons: the behaviour worth pinning down is about *time* — a fortnight
 * offline, a run abandoned mid-flight, a clock that lies — which an injected clock states
 * directly and a live database only obscures; and opening a database under Node is not
 * something this package supports (`pouchdb-browser` finds no adapter there), so every
 * stack-backed suite lives in the playwright tests under `src-test/` instead — the job
 * engine's own execution contract included (`src-test/job-engine.test.ts`).
 */

import type { JobModel, JobRunModel } from "@docstack/shared";

import { JOB_SCHEDULE_DOC_ID, JobScheduler } from "../scheduler";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Executor = (jobId: string) => Promise<JobRunModel> | JobRunModel;

/** An in-memory stand-in for the two stack surfaces the scheduler touches. */
const makeHost = () => {
    const docs = new Map<string, any>();
    const calls: { jobId: string; triggerType?: string }[] = [];
    let executor: Executor = jobId => run(jobId, "SUCCESS");

    const host = {
        db: {
            // Deep copies on every boundary, the way a real database serialises. A
            // shallow copy here shares nested objects by reference, which quietly turns
            // the store into shared memory - a write that "failed" with a 409 has still
            // mutated the stored document, and races the scheduler actually has become
            // unobservable.
            get: async (id: string) => {
                if (!docs.has(id)) throw Object.assign(new Error("missing"), { status: 404 });
                return structuredClone(docs.get(id));
            },
            put: async (doc: any) => {
                const previous = docs.get(doc._id);
                if (previous && previous._rev !== doc._rev) {
                    throw Object.assign(new Error("conflict"), { status: 409 });
                }
                const rev = `${Number((doc._rev ?? "0-x").split("-")[0]) + 1}-x`;
                docs.set(doc._id, structuredClone({ ...doc, _rev: rev }));
                return { ok: true, id: doc._id, rev };
            },
            bulkDocs: async (batch: any[]) => {
                for (const doc of batch) docs.set(doc._id, structuredClone(doc));
                return batch.map(doc => ({ ok: true, id: doc._id }));
            },
            find: async ({ selector, limit }: any) => {
                const matches = [...docs.values()]
                    .filter(doc => Object.entries(selector).every(([key, value]) => doc[key] === value))
                    .slice(0, limit ?? Infinity);
                return { docs: matches.map(doc => structuredClone(doc)) };
            },
        },
        jobEngine: {
            executeJob: async (jobId: string, _args?: Record<string, any>, triggerType?: string) => {
                calls.push({ jobId, triggerType });
                return executor(jobId);
            },
        },
    };

    return {
        host,
        docs,
        calls,
        setExecutor: (next: Executor) => {
            executor = next;
        },
        state: () => docs.get(JOB_SCHEDULE_DOC_ID)?.jobs ?? {},
    };
};

const run = (jobId: string, status: JobRunModel["status"]): JobRunModel => ({
    _id: `JobRun-${jobId}-${Math.random()}`,
    "~class": "~JobRun",
    jobId,
    status,
    triggerType: "scheduled",
    startTime: 0,
});

const job = (overrides: Partial<JobModel> & Pick<JobModel, "_id">): JobModel => ({
    "~class": "~Job",
    name: overrides._id,
    type: "user",
    workerPlatform: "client",
    content: "function execute() { return {}; }",
    hash: "hash-of-content",
    isEnabled: true,
    schedule: "@every 1h",
    ...overrides,
});

describe("JobScheduler", () => {
    let harness: ReturnType<typeof makeHost>;
    let scheduler: JobScheduler;
    let clock: number;

    /** A long interval: every test drives the scheduler through `tick()` explicitly. */
    const startWith = (options: Partial<Parameters<JobScheduler["start"]>[0]> = {}) =>
        scheduler.start({
            jobs: ["Job-sweep"],
            intervalMs: HOUR,
            now: () => clock,
            ...options,
        });

    /** Runs a tick and waits for whatever it dispatched to finish. */
    const settle = async () => {
        const report = await scheduler.tick();
        await scheduler.drain();
        return report;
    };

    beforeEach(() => {
        clock = new Date(2026, 7, 28, 12, 0, 0, 0).getTime();
        harness = makeHost();
        scheduler = new JobScheduler(harness.host as any);
    });

    afterEach(async () => {
        scheduler.stop();
        await scheduler.drain();
    });

    it("does not run a job the moment it first sees it", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep" }));
        startWith();

        const report = await settle();

        // A daily job saved at noon, running on the spot on every device that receives
        // it, is a stampede dressed as a first run.
        expect(report.dispatched).toEqual([]);
        expect(report.skipped).toContainEqual({ jobId: "Job-sweep", reason: "not-due" });
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + HOUR);
    });

    it("dispatches a due job, as a scheduled run", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep" }));
        startWith();
        await settle();

        clock += HOUR + MINUTE;
        const report = await settle();

        expect(report.dispatched).toEqual(["Job-sweep"]);
        expect(harness.calls).toEqual([{ jobId: "Job-sweep", triggerType: "scheduled" }]);
        expect(harness.state()["Job-sweep"].lastStatus).toBe("SUCCESS");
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + HOUR);
    });

    it("keeps its bookkeeping in a _local document, which never replicates", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep" }));
        startWith();
        await settle();

        expect(harness.docs.has(JOB_SCHEDULE_DOC_ID)).toBe(true);
        expect(JOB_SCHEDULE_DOC_ID.startsWith("_local/")).toBe(true);
        // The job document itself is untouched: `nextRunTimestamp` stays as it was, so a
        // conflict can never fork the executable `content` beside it.
        expect(harness.docs.get("Job-sweep").nextRunTimestamp).toBeUndefined();
    });

    it("collapses a fortnight of missed occurrences into one run", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@daily@09:00" }));
        startWith();
        await settle();

        clock += 14 * DAY;
        const report = await settle();

        expect(report.dispatched).toEqual(["Job-sweep"]);
        expect(harness.calls).toHaveLength(1);
        expect(harness.state()["Job-sweep"].nextRunAt - clock).toBeLessThanOrEqual(DAY);
    });

    it("runs nothing that is not on the allow-list", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep" }));
        harness.docs.set("Job-from-a-peer", job({ _id: "Job-from-a-peer" }));
        startWith();
        await settle();

        clock += HOUR + MINUTE;
        const report = await settle();

        expect(report.dispatched).toEqual(["Job-sweep"]);
        expect(harness.calls.map(call => call.jobId)).toEqual(["Job-sweep"]);
        expect(harness.state()["Job-from-a-peer"]).toBeUndefined();
    });

    it("fails closed when a job's hash is not the pinned one", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", hash: "something-else" }));
        startWith({ pinnedHashes: { "Job-sweep": "hash-of-content" } });
        await settle();

        clock += HOUR + MINUTE;
        const report = await settle();

        expect(report.dispatched).toEqual([]);
        expect(report.skipped).toContainEqual({ jobId: "Job-sweep", reason: "hash-mismatch" });
        expect(harness.calls).toHaveLength(0);
    });

    it("reports the jobs it cannot run, rather than throwing on them", async () => {
        harness.docs.set("Job-disabled", job({ _id: "Job-disabled", isEnabled: false }));
        harness.docs.set("Job-unscheduled", job({ _id: "Job-unscheduled", schedule: null }));
        harness.docs.set("Job-cron", job({ _id: "Job-cron", schedule: "0 9 * * *" }));
        startWith({ jobs: ["Job-disabled", "Job-unscheduled", "Job-cron", "Job-absent"] });

        const report = await settle();

        expect(report.skipped).toEqual(
            expect.arrayContaining([
                { jobId: "Job-disabled", reason: "disabled" },
                { jobId: "Job-unscheduled", reason: "no-schedule" },
                { jobId: "Job-cron", reason: "unparseable-schedule" },
                { jobId: "Job-absent", reason: "missing" },
            ]),
        );
        expect(report.dispatched).toEqual([]);
    });

    it("backs off after a failure instead of retrying every tick", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        harness.setExecutor(jobId => run(jobId, "FAILURE"));
        startWith({ backoffBaseMs: 5 * MINUTE });
        await settle();

        clock += 2 * MINUTE;
        await settle();
        expect(harness.state()["Job-sweep"].consecutiveFailures).toBe(1);
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + 5 * MINUTE);

        // Its own schedule would have made it due again by now; the backoff is what
        // stops a permanently broken job becoming a write a minute.
        clock += 2 * MINUTE;
        const report = await settle();
        expect(report.dispatched).toEqual([]);

        // ...and the delay doubles while it keeps failing.
        clock += 5 * MINUTE;
        await settle();
        expect(harness.state()["Job-sweep"].consecutiveFailures).toBe(2);
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + 10 * MINUTE);
    });

    it("clears the backoff on the first success", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        harness.setExecutor(jobId => run(jobId, "FAILURE"));
        startWith({ backoffBaseMs: MINUTE });
        await settle();

        clock += 2 * MINUTE;
        await settle();
        expect(harness.state()["Job-sweep"].consecutiveFailures).toBe(1);

        harness.setExecutor(jobId => run(jobId, "SUCCESS"));
        clock += 2 * MINUTE;
        await settle();
        expect(harness.state()["Job-sweep"].consecutiveFailures).toBe(0);
        expect(harness.state()["Job-sweep"].lastStatus).toBe("SUCCESS");
    });

    it("treats a throw from the engine as an outcome, not a crash", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        // What `executeJob` does for a blocked singleton, and for a content hash that no
        // longer matches its document.
        harness.setExecutor(() => Promise.reject(new Error("already has a running instance")));
        startWith();
        await settle();

        clock += 2 * MINUTE;
        await expect(settle()).resolves.toMatchObject({ dispatched: ["Job-sweep"] });
        expect(harness.state()["Job-sweep"].lastStatus).toBe("FAILURE");
    });

    it("does not start a second copy of a job that is still running", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        let release: (value: JobRunModel) => void = () => undefined;
        harness.setExecutor(jobId => new Promise<JobRunModel>(resolve => {
            release = resolve;
            void jobId;
        }));

        startWith();
        await scheduler.tick();

        clock += 2 * MINUTE;
        const first = await scheduler.tick();
        expect(first.dispatched).toEqual(["Job-sweep"]);

        clock += 2 * MINUTE;
        const second = await scheduler.tick();
        expect(second.dispatched).toEqual([]);
        expect(second.skipped).toContainEqual({ jobId: "Job-sweep", reason: "in-flight" });
        expect(harness.calls).toHaveLength(1);

        release(run("Job-sweep", "SUCCESS"));
        await scheduler.drain();
    });

    it("reaps runs abandoned by a client that stopped mid-flight", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep" }));
        harness.docs.set("JobRun-abandoned", {
            _id: "JobRun-abandoned",
            "~class": "~JobRun",
            jobId: "Job-sweep",
            status: "RUNNING",
            triggerType: "scheduled",
            startTime: clock - 30 * MINUTE,
        });
        harness.docs.set("JobRun-current", {
            _id: "JobRun-current",
            "~class": "~JobRun",
            jobId: "Job-sweep",
            status: "RUNNING",
            triggerType: "manual",
            startTime: clock - MINUTE,
        });

        startWith({ staleRunMs: 15 * MINUTE });
        const report = await settle();

        // Left RUNNING for ever, this is what permanently skips a singleton job on this
        // device: `hasRunningInstance` would keep finding it.
        expect(report.sweptRuns).toBe(1);
        expect(harness.docs.get("JobRun-abandoned").status).toBe("CANCELED");
        expect(harness.docs.get("JobRun-abandoned").endTime).toBe(clock);
        expect(harness.docs.get("JobRun-current").status).toBe("RUNNING");
    });

    it("recomputes a nextRunAt that a wrong clock put out of reach", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@daily" }));
        startWith();
        await settle();

        // What a run recorded while the device thought it was 2031 leaves behind.
        const stored = harness.docs.get(JOB_SCHEDULE_DOC_ID);
        stored.jobs["Job-sweep"].nextRunAt = new Date(2031, 0, 1).getTime();

        const report = await settle();
        expect(report.dispatched).toEqual([]);
        expect(harness.state()["Job-sweep"].nextRunAt - clock).toBeLessThanOrEqual(DAY);
    });

    it("re-seeds a job whose schedule was rewritten", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1h" }));
        startWith();
        await settle();
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + HOUR);

        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 7d" }));
        const report = await settle();

        expect(report.dispatched).toEqual([]);
        expect(harness.state()["Job-sweep"].schedule).toBe("@every 7d");
        expect(harness.state()["Job-sweep"].nextRunAt).toBe(clock + 7 * DAY);
    });

    it("shares one evaluation between concurrent ticks", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        startWith();
        await settle();

        clock += 2 * MINUTE;
        // A wake signal and the interval landing together must not dispatch twice.
        const [a, b] = await Promise.all([scheduler.tick(), scheduler.tick()]);
        await scheduler.drain();

        expect(a).toBe(b);
        expect(harness.calls).toHaveLength(1);
    });

    it("does nothing once stopped", async () => {
        harness.docs.set("Job-sweep", job({ _id: "Job-sweep", schedule: "@every 1m" }));
        startWith();
        await settle();

        scheduler.stop();
        clock += 2 * MINUTE;

        // A wake handler firing after teardown is nothing, not an error.
        const report = await settle();
        expect(report.dispatched).toEqual([]);
        expect(harness.calls).toHaveLength(0);
        expect(scheduler.status().running).toBe(false);
    });

    it("a job finishing mid-tick cannot knock the tick's claims out of the state document", async () => {
        // The race: `recordOutcome` writes through the serialised queue, but a tick's own
        // read-evaluate-write must share that serialisation. If it does not, a slow job's
        // outcome landing between a later tick's read and write bumps the `_local` rev,
        // the tick's write 409s, and the claim it carried is silently dropped - so the
        // job that tick dispatched still *looks* due and runs again a minute later. On
        // one device, within one period.
        harness.docs.set("Job-slow", job({ _id: "Job-slow" }));
        harness.docs.set("Job-fast", job({ _id: "Job-fast" }));

        let releaseSlow!: (result: JobRunModel) => void;
        harness.setExecutor(jobId => {
            if (jobId === "Job-slow") {
                return new Promise<JobRunModel>(resolve => { releaseSlow = resolve; });
            }
            return run(jobId, "SUCCESS");
        });

        startWith({ jobs: ["Job-slow", "Job-fast"] });
        await settle();                                    // first sight: seed both

        clock += HOUR + MINUTE;
        await scheduler.tick();                            // dispatches both; slow parks
        await new Promise(resolve => setTimeout(resolve, 20)); // fast's outcome lands

        // Park the next tick between its state read and its claim write, by gating the
        // job-model read that happens in between.
        clock += HOUR + MINUTE;
        const realGet = harness.host.db.get;
        let releaseGate!: () => void;
        const gate = new Promise<void>(resolve => { releaseGate = resolve; });
        harness.host.db.get = async (id: string) => {
            if (id === "Job-fast") await gate;
            return realGet(id);
        };

        const parked = scheduler.tick();                   // skips slow (in-flight), parks at fast
        await new Promise(resolve => setTimeout(resolve, 10));
        releaseSlow(run("Job-slow", "SUCCESS"));           // outcome write races the parked tick
        await new Promise(resolve => setTimeout(resolve, 20));
        releaseGate();
        const report = await parked;
        harness.host.db.get = realGet;
        await scheduler.drain();

        expect(report.dispatched).toContain("Job-fast");   // second period: a legitimate run
        const fastCallsSoFar = harness.calls.filter(call => call.jobId === "Job-fast").length;
        expect(fastCallsSoFar).toBe(2);

        // Job-slow's own claim has expired by now, so the next tick may re-dispatch it;
        // let it complete instantly rather than park drain() forever.
        harness.setExecutor(jobId => run(jobId, "SUCCESS"));

        // One minute on, inside the period the parked tick claimed: nothing is due. A
        // dropped claim makes Job-fast run a third time here.
        clock += MINUTE;
        await settle();
        expect(harness.calls.filter(call => call.jobId === "Job-fast")).toHaveLength(2);
    });
});
