import type { Stack } from "@docstack/shared";

/** A finished log line: level, message, and whatever context was attached. */
export type LogRecord = {
    level: "error" | "warn" | "info" | "debug";
    message: string;
    [field: string]: unknown;
};

/**
 * Writes log records into a stack's own database.
 *
 * Previously a `winston-transport` subclass. The base class contributed a Node stream
 * (and with it `readable-stream`, `buffer` and `process`) in exchange for `super(opts)`
 * and an `emit('logged')` nothing listened to, so it is gone; the useful part, one
 * `db.post` per record, is below.
 *
 * Failures are swallowed deliberately. Logging is not the caller's operation, and a
 * rejected write here - a closed database mid-teardown, most often - must not surface as
 * a failure of whatever was being logged about.
 *
 * @param stack - The stack whose database receives the records.
 * @returns A sink to hand {@link createLogger}.
 *
 * @example
 * ```typescript
 * const sink = createStackSink(stack);
 * sink({ level: "warn", message: "slow query", ms: 1200 });
 * ```
 */
export const createStackSink = (stack: Stack) => {
    return (record: LogRecord) => {
        // Detached on purpose: a log line must never make its caller wait, and must never
        // reject into it either.
        void Promise.resolve()
            .then(() => stack.db.post({ log: record } as any))
            .catch(() => undefined);
    };
};

export default createStackSink;
