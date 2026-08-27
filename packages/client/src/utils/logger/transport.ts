import type { Stack } from "@docstack/shared";

/**
 * The id prefix every log record carries.
 *
 * Records used to be written with `db.post` and a bare `{ log }` payload, which gives a
 * random id and no field any filter can match on - so every record replicated. On one
 * measured remote, 111 of 134 documents were log records, pushed by every client and
 * pulled by every other. See ADR-0023.
 *
 * A prefix rather than a `~class`: a `~class` makes the document `isDocument()` to
 * `StackPlugin`, which then demands a class model for it and rejects the write. The
 * prefix reaches `INTERNAL_DOC_ID_PREFIXES` - where `~lock-` already lives - and touches
 * nothing on the write path.
 */
export const LOG_RECORD_ID_PREFIX = "~log-";

/**
 * The ephemeral class log records belong to.
 *
 * Declared by system patch `0.0.15`. Diagnostics written before that patch has applied -
 * during a stack's own startup - cannot be stored and are dropped by the sink's existing
 * catch; they still reach the console.
 */
export const LOG_RECORD_CLASS = "~Log";

/** A locally unique id for one record. Collisions only ever lose a log line. */
const logRecordId = () => {
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    return `${LOG_RECORD_ID_PREFIX}${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};

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
            // A document of the ephemeral `~Log` class. Its class is what keeps it on this
            // device - not replicated, and emptied when the stack next opens - rather than
            // a payload shape the sync filter has to recognise. The `~log-` id prefix is
            // kept alongside it: it costs nothing, states intent at the write site, and
            // still covers a database holding records written before `~Log` existed.
            //
            // `level` and `message` are the class's own attributes; everything the call
            // site attached goes under `fields`, which is where an unbounded value such as
            // a query selector belongs - on a class that never leaves the device.
            // See ADR-0027 and ADR-0028.
            .then(() => {
                const { level, message, ...fields } = record;
                return stack.db.put({
                    _id: logRecordId(),
                    "~class": LOG_RECORD_CLASS,
                    active: true,
                    level,
                    message,
                    fields,
                } as any);
            })
            .catch(() => undefined);
    };
};

export default createStackSink;
