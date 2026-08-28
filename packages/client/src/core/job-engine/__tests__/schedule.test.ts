import { MIN_PERIOD_MS, isImplausible, nextOccurrence, parseSchedule } from "../schedule";

/** A local-time instant, built through `Date` so the assertions hold in any timezone. */
const local = (year: number, month: number, day: number, hour = 0, minute = 0) =>
    new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("parseSchedule", () => {
    it("reads the interval forms", () => {
        expect(parseSchedule("@every 30m")).toEqual({ kind: "interval", source: "@every 30m", periodMs: 1_800_000 });
        expect(parseSchedule("@every 6h")).toEqual({ kind: "interval", source: "@every 6h", periodMs: 6 * HOUR });
        expect(parseSchedule("@every 7d")).toEqual({ kind: "interval", source: "@every 7d", periodMs: 7 * DAY });
    });

    it("reads the anchored forms", () => {
        expect(parseSchedule("@hourly")).toEqual({ kind: "hourly", source: "@hourly" });
        expect(parseSchedule("@daily")).toEqual({ kind: "daily", source: "@daily", minutes: 0 });
        expect(parseSchedule("@daily@09:00")).toEqual({ kind: "daily", source: "@daily@09:00", minutes: 540 });
        expect(parseSchedule("@weekly")).toEqual({ kind: "weekly", source: "@weekly", weekday: 1, minutes: 0 });
        expect(parseSchedule("@weekly@18:30")).toEqual({
            kind: "weekly",
            source: "@weekly@18:30",
            weekday: 1,
            minutes: 1110,
        });
    });

    it("is case-insensitive and tolerates surrounding space, but keeps the source verbatim", () => {
        expect(parseSchedule("  @DAILY@09:00  ")).toEqual({
            kind: "daily",
            source: "@DAILY@09:00",
            minutes: 540,
        });
    });

    it("refuses cron, so a schedule nobody can honour is never silently accepted", () => {
        expect(parseSchedule("0 9 * * *")).toBeNull();
        expect(parseSchedule("*/5 * * * *")).toBeNull();
    });

    it("refuses intervals short enough to be polling", () => {
        expect(parseSchedule("@every 10s")).toBeNull();
        expect(parseSchedule(`@every ${MIN_PERIOD_MS / 1000}s`)).not.toBeNull();
    });

    it("refuses malformed input rather than guessing", () => {
        expect(parseSchedule("@every")).toBeNull();
        expect(parseSchedule("@every 6")).toBeNull();
        expect(parseSchedule("@every 6y")).toBeNull();
        expect(parseSchedule("@daily@25:00")).toBeNull();
        expect(parseSchedule("@daily@9:0")).toBeNull();
        expect(parseSchedule("@monthly")).toBeNull();
        expect(parseSchedule("")).toBeNull();
        expect(parseSchedule(null)).toBeNull();
        expect(parseSchedule(undefined)).toBeNull();
    });
});

describe("nextOccurrence", () => {
    it("measures an interval from the moment asked, not from a calendar", () => {
        const from = local(2026, 8, 28, 14, 12);
        expect(nextOccurrence(parseSchedule("@every 6h")!, from)).toBe(from + 6 * HOUR);
    });

    it("moves to the top of the next hour", () => {
        expect(nextOccurrence(parseSchedule("@hourly")!, local(2026, 8, 28, 14, 12))).toBe(local(2026, 8, 28, 15));
    });

    it("returns today's time when it is still ahead, and tomorrow's once it has passed", () => {
        const schedule = parseSchedule("@daily@09:00")!;
        expect(nextOccurrence(schedule, local(2026, 8, 28, 7, 30))).toBe(local(2026, 8, 28, 9));
        expect(nextOccurrence(schedule, local(2026, 8, 28, 9, 30))).toBe(local(2026, 8, 29, 9));
    });

    it("never returns the instant it was given", () => {
        const schedule = parseSchedule("@daily@09:00")!;
        const nine = local(2026, 8, 28, 9);
        expect(nextOccurrence(schedule, nine)).toBe(local(2026, 8, 29, 9));
    });

    it("finds the next Monday, and skips to the following one when today is Monday and past the time", () => {
        const schedule = parseSchedule("@weekly@09:00")!;
        // 2026-08-28 is a Friday; 2026-08-31 is the Monday after it.
        expect(nextOccurrence(schedule, local(2026, 8, 28, 12))).toBe(local(2026, 8, 31, 9));
        expect(nextOccurrence(schedule, local(2026, 8, 31, 10))).toBe(local(2026, 9, 7, 9));
        expect(nextOccurrence(schedule, local(2026, 8, 31, 8))).toBe(local(2026, 8, 31, 9));
    });

    it("collapses a fortnight of missed occurrences into the next one", () => {
        const schedule = parseSchedule("@daily@09:00")!;
        // The last run was two weeks ago; what comes back is one occurrence, and it is
        // the next one — there is no backlog to ask for and no way to ask for it.
        const after = nextOccurrence(schedule, local(2026, 8, 28, 12));
        expect(after).toBe(local(2026, 8, 29, 9));
        expect(after - local(2026, 8, 28, 12)).toBeLessThanOrEqual(DAY);
    });
});

describe("isImplausible", () => {
    const daily = parseSchedule("@daily")!;

    it("accepts a timestamp inside the schedule's own reach", () => {
        const now = local(2026, 8, 28, 12);
        expect(isImplausible(now + HOUR, daily, now)).toBe(false);
        expect(isImplausible(now + DAY, daily, now)).toBe(false);
    });

    it("rejects one that could only have come from a clock that was wrong", () => {
        const now = local(2026, 8, 28, 12);
        expect(isImplausible(now + 5 * DAY, daily, now)).toBe(true);
        expect(isImplausible(local(2031, 1, 1), daily, now)).toBe(true);
    });

    it("treats a timestamp in the past as due, not implausible", () => {
        const now = local(2026, 8, 28, 12);
        expect(isImplausible(now - 30 * DAY, daily, now)).toBe(false);
    });
});
