/**
 * The schedule grammar a client can actually honour.
 *
 * `JobModel.schedule` is a string, and the obvious thing to put in it is cron. Cron is
 * not offered here, and the reason is not implementation cost: cron's entire vocabulary
 * is about *naming occurrences* — "02:15 on the 3rd of every month" — and a client
 * cannot promise to be running at an occurrence. It is a closed tab, a suspended app, a
 * sleeping laptop. Accepting the syntax would promise a precision the runtime has no way
 * to keep, and the failure would be silent: the job simply never runs on the 3rd.
 *
 * So the grammar says only what a client can honour, which is a floor rather than a
 * moment: *not more often than this*.
 *
 * | Form | Meaning |
 * | --- | --- |
 * | `@every 30m`, `@every 6h`, `@every 7d` | Fixed interval since the last run. |
 * | `@hourly` | Top of each local hour. |
 * | `@daily` | Local midnight. |
 * | `@daily@09:00` | A local wall-clock time. |
 * | `@weekly` | Monday, local midnight. |
 * | `@weekly@09:00` | Monday, at a local wall-clock time. |
 *
 * Anchored forms are computed against *local* time through `Date`, so they follow the
 * device across daylight-saving changes: `@daily@09:00` stays 09:00 to the person
 * reading the screen, which is the only definition of "nine" that a campaign cares
 * about.
 *
 * @module
 */

/** Milliseconds per unit accepted by `@every`. */
const UNIT_MS: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
};

/** Shortest interval `@every` will accept. Below this a client is polling, not scheduling. */
export const MIN_PERIOD_MS = 30_000;

/** A schedule string after parsing. `source` is kept so callers can report what they read. */
export type ParsedSchedule =
    | { kind: "interval"; source: string; periodMs: number }
    | { kind: "hourly"; source: string }
    | { kind: "daily"; source: string; minutes: number }
    | { kind: "weekly"; source: string; weekday: number; minutes: number };

/** `HH:MM`, 24-hour, as minutes past local midnight. `null` when the text is not a time. */
const parseTimeOfDay = (text: string): number | null => {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

/**
 * Reads a schedule string, or returns `null` when it is not one.
 *
 * `null` is a value the scheduler acts on rather than an error to throw: a job document
 * carrying a schedule nobody can parse should be skipped and reported, not allowed to
 * take down the tick that would have run the other jobs.
 *
 * @example
 * ```typescript
 * parseSchedule("@every 6h");     // { kind: "interval", periodMs: 21600000, ... }
 * parseSchedule("@daily@09:00");  // { kind: "daily", minutes: 540, ... }
 * parseSchedule("0 9 * * *");     // null — cron is not accepted, see the module docblock
 * ```
 */
export const parseSchedule = (schedule: string | null | undefined): ParsedSchedule | null => {
    if (typeof schedule !== "string") return null;
    const source = schedule.trim();
    const text = source.toLowerCase();
    if (!text.startsWith("@")) return null;

    const every = /^@every\s+(\d+)\s*([smhdw])$/.exec(text);
    if (every) {
        const periodMs = Number(every[1]) * UNIT_MS[every[2]];
        if (!Number.isFinite(periodMs) || periodMs < MIN_PERIOD_MS) return null;
        return { kind: "interval", source, periodMs };
    }

    if (text === "@hourly") return { kind: "hourly", source };

    const parts = text.split("@").filter(Boolean);
    const [keyword, at] = parts;

    if (keyword === "daily") {
        if (at === undefined) return { kind: "daily", source, minutes: 0 };
        const minutes = parseTimeOfDay(at);
        return minutes === null ? null : { kind: "daily", source, minutes };
    }

    if (keyword === "weekly") {
        // Monday, because a week that starts on Sunday surprises most of the people who
        // write "@weekly" and none of the ones who wanted Monday.
        if (at === undefined) return { kind: "weekly", source, weekday: 1, minutes: 0 };
        const minutes = parseTimeOfDay(at);
        return minutes === null ? null : { kind: "weekly", source, weekday: 1, minutes };
    }

    return null;
};

/** Local midnight of the day containing `at`. */
const startOfLocalDay = (at: number): Date => {
    const date = new Date(at);
    date.setHours(0, 0, 0, 0);
    return date;
};

/** `n` days later in *local* time — `setDate` rather than arithmetic, so DST is handled. */
const addDays = (date: Date, n: number): Date => {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + n);
    return next;
};

/**
 * The first moment this schedule comes due strictly after `from`.
 *
 * **The occurrences between the last run and `from` are not returned, and there is no
 * way to ask for them.** That absence is the design: a device that was closed for a
 * fortnight has missed fourteen occurrences of a daily job, and replaying them would run
 * the campaign fourteen times over data that only justifies running it once. A sweep
 * that reads current state does the right thing in a single pass; fourteen sweeps do the
 * same thing plus a stampede.
 *
 * @param schedule - A parsed schedule.
 * @param from - The instant to measure from, normally "now".
 * @returns The next due timestamp, strictly greater than `from`.
 */
export const nextOccurrence = (schedule: ParsedSchedule, from: number): number => {
    switch (schedule.kind) {
        case "interval":
            return from + schedule.periodMs;

        case "hourly": {
            const hour = new Date(from);
            hour.setMinutes(0, 0, 0);
            return hour.getTime() + UNIT_MS.h;
        }

        case "daily": {
            const candidate = startOfLocalDay(from).getTime() + schedule.minutes * UNIT_MS.m;
            if (candidate > from) return candidate;
            return addDays(startOfLocalDay(from), 1).getTime() + schedule.minutes * UNIT_MS.m;
        }

        case "weekly": {
            const today = startOfLocalDay(from);
            const shift = (schedule.weekday - today.getDay() + 7) % 7;
            const candidate = addDays(today, shift).getTime() + schedule.minutes * UNIT_MS.m;
            if (candidate > from) return candidate;
            return addDays(today, shift + 7).getTime() + schedule.minutes * UNIT_MS.m;
        }
    }
};

/** The longest a schedule may legitimately wait — the ceiling used to detect a bad clock. */
export const periodCeilingMs = (schedule: ParsedSchedule): number => {
    switch (schedule.kind) {
        case "interval":
            return schedule.periodMs;
        case "hourly":
            return UNIT_MS.h;
        case "daily":
            return UNIT_MS.d;
        case "weekly":
            return UNIT_MS.w;
    }
};

/**
 * Whether a stored `nextRunAt` is too far in the future to have been computed honestly.
 *
 * The device clock belongs to the user: it can be wrong, and it can be set back. A run
 * recorded while the clock read 2031 leaves a `nextRunAt` that would suppress the job for
 * years once the clock is corrected. Anything further out than two periods did not come
 * from this schedule, so the scheduler recomputes it from now rather than honouring it.
 */
export const isImplausible = (nextRunAt: number, schedule: ParsedSchedule, now: number): boolean =>
    nextRunAt - now > periodCeilingMs(schedule) * 2;
