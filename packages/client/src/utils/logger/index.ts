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

/** Levels written to the stack, when one is attached. Winston's default logger level. */
const SINK_LEVEL: LogLevel = "info";

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

const build = (context: LogFields, sink?: (record: LogRecord) => void): Logger => {
    const emit = (level: LogLevel, message: string, fields?: unknown) => {
        const record: LogRecord = { level, message, ...context, ...toFields(fields) };
        writeToConsole(record);
        if (sink && LEVEL_ORDER[level] <= LEVEL_ORDER[SINK_LEVEL]) sink(record);
    };

    return {
        child: (fields: LogFields) => build({ ...context, ...fields }, sink),
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
 * way the winston `PouchDBTransport` did.
 * @returns A logger with no accumulated context; call `.child()` to add some.
 */
const createLogger = (stack?: Stack | null): Logger => {
    return build({}, stack ? createStackSink(stack) : undefined);
};

export default createLogger;
