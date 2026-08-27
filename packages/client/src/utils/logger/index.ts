import type { LogFields, Logger, LogLevel, Stack } from "@docstack/shared";
import { createStackSink, type LogRecord } from "./transport.js";

/**
 * Structured logging for a browser-first package.
 *
 * This replaced winston, which was the only reason `@docstack/client` needed Node core
 * modules at all: `fs`, `http`, `https`, `os`, `path`, `util` and `zlib` directly, plus
 * `stream`, `buffer`, `process` and the rest through `logform` and `readable-stream`.
 * Every consumer had to configure a bundler around that - `resolve.fallback` entries, a
 * `ProvidePlugin` for `process` and `Buffer`, and a rule to strip `node:` prefixes - to
 * use a library that never leaves the browser. What was actually used of winston was
 * `createLogger`, `.child()` and three level methods, so the dependency bought nothing
 * the twenty lines below do not.
 *
 * Nothing here is exported from the package; log output is the only observable change.
 *
 * @module
 */

export type { LogFields, Logger, LogLevel };

const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * Levels the console shows.
 *
 * `warn`, matching the console transport winston was configured with. `info` is used
 * throughout the codebase for routine tracing and would drown the console.
 */
const CONSOLE_LEVEL: LogLevel = "warn";

/**
 * Levels written to the stack's database when it has not been told otherwise.
 *
 * `warn`, not `info`. Records go into the stack's own database, which replicates, and at
 * `info` this codebase traces routinely enough to drown the data: on one measured stack,
 * 54 of 56 replicated documents were log records. Their fields are whatever the call site
 * passed - `getCards - selector` carries the query selector - so a query over
 * user-entered text was writing that text to the remote in the clear, outside the crypto
 * engine. The replication filter now holds them back regardless (ADR-0027), but the
 * default should not have been producing them at that volume in the first place.
 *
 * A stack configured with an explicit `logLevel` still gets exactly that level in its
 * database, so asking for `info` when diagnosing something still works.
 */
const SINK_LEVEL: LogLevel = "warn";

/**
 * Coerces whatever a caller passed as context into fields.
 *
 * Call sites pass plain objects, but also bare `Error`s (`logger.info("not found", e)`),
 * which would otherwise serialise to `{}` and lose the only useful part.
 */
const toFields = (fields?: unknown): LogFields => {
    if (fields === undefined || fields === null) return {};
    if (fields instanceof Error) {
        return { error: fields.message, stack: fields.stack };
    }
    if (typeof fields !== "object") return { detail: fields };
    return fields as LogFields;
};

/**
 * Serialises a record for the console.
 *
 * Log context routinely holds documents and stack instances, which contain cycles;
 * `JSON.stringify` throws on those, and a logger that can throw is worse than no logger.
 */
const format = (record: LogRecord): string => {
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(record, (_key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            if (typeof value === "bigint") return value.toString();
            if (typeof value === "function") return undefined;
            return value;
        }) ?? String(record.message);
    } catch {
        return `${record.level}: ${record.message}`;
    }
};

const CONSOLE_METHOD: Record<LogLevel, "error" | "warn" | "info" | "debug"> = {
    error: "error",
    warn: "warn",
    info: "info",
    debug: "debug",
};

const writeToConsole = (record: LogRecord) => {
    if (LEVEL_ORDER[record.level] > LEVEL_ORDER[CONSOLE_LEVEL]) return;
    // eslint-disable-next-line no-console
    console[CONSOLE_METHOD[record.level]](format(record));
};

/**
 * Reads the level a stack was configured with, at emit time.
 *
 * Resolved per record rather than at logger creation because a stack's options are
 * assigned during initialization, which can run after its first loggers exist.
 */
const stackLevel = (stack?: Stack | null): LogLevel | "silent" | undefined => {
    return (stack as any)?.options?.logLevel;
};

const build = (context: LogFields, sink?: (record: LogRecord) => void, stack?: Stack | null): Logger => {
    const emit = (level: LogLevel, message: string, fields?: unknown) => {
        // A stack-bound logger obeys the stack's `logLevel`: "silent" - what a
        // production build sets - emits nothing at all, and an explicit level caps
        // console and sink alike (opening the console past its `warn` default when
        // asked for `info` or `debug`).
        const configured = stackLevel(stack);
        if (configured === "silent") return;
        if (configured !== undefined && LEVEL_ORDER[level] > LEVEL_ORDER[configured]) return;

        const record: LogRecord = { level, message, ...context, ...toFields(fields) };
        if (configured !== undefined) {
            // eslint-disable-next-line no-console
            console[CONSOLE_METHOD[record.level]](format(record));
            if (sink) sink(record);
            return;
        }
        writeToConsole(record);
        if (sink && LEVEL_ORDER[level] <= LEVEL_ORDER[SINK_LEVEL]) sink(record);
    };

    return {
        child: (fields: LogFields) => build({ ...context, ...fields }, sink, stack),
        error: (message, fields) => emit("error", message, fields),
        warn: (message, fields) => emit("warn", message, fields),
        info: (message, fields) => emit("info", message, fields),
        debug: (message, fields) => emit("debug", message, fields),
    };
};

/**
 * Creates a logger, optionally recording into a stack.
 *
 * @param stack - When given, log records are also written into the stack's database, the
 * way the winston `PouchDBTransport` did, and the stack's `logLevel` option governs how
 * much this logger emits - `"silent"` for none at all.
 * @returns A logger with no accumulated context; call `.child()` to add some.
 */
const createLogger = (stack?: Stack | null): Logger => {
    return build({}, stack ? createStackSink(stack) : undefined, stack);
};

export default createLogger;
