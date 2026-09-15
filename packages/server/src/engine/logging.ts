/**
 * The host's own logger: JSON lines on stderr, one level for the process.
 *
 * The engine's loggers are a separate concern: `setDefaultLogLevel` from
 * `@docstack/client` silences or opens them process-wide, and a stack's own
 * `logLevel` still wins for that stack.
 *
 * @module
 */
export type HostLogLevel = "error" | "warn" | "info" | "debug" | "silent";

const ORDER: Record<Exclude<HostLogLevel, "silent">, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface HostLogger {
    error(message: string, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    debug(message: string, fields?: Record<string, unknown>): void;
    child(fields: Record<string, unknown>): HostLogger;
}

const serialise = (record: Record<string, unknown>): string => {
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(record, (_key, value) => {
            if (value instanceof Error) return { name: value.name, message: value.message };
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            return value;
        });
    } catch {
        return JSON.stringify({ level: record.level, message: String(record.message) });
    }
};

export const createHostLogger = (
    level: HostLogLevel,
    context: Record<string, unknown> = {},
    sink: (line: string) => void = (line) => process.stderr.write(line + "\n"),
): HostLogger => {
    const emit = (recordLevel: Exclude<HostLogLevel, "silent">, message: string, fields?: Record<string, unknown>) => {
        if (level === "silent" || ORDER[recordLevel] > ORDER[level]) return;
        sink(serialise({ time: new Date().toISOString(), level: recordLevel, message, ...context, ...(fields ?? {}) }));
    };
    return {
        error: (message, fields) => emit("error", message, fields),
        warn: (message, fields) => emit("warn", message, fields),
        info: (message, fields) => emit("info", message, fields),
        debug: (message, fields) => emit("debug", message, fields),
        child: (fields) => createHostLogger(level, { ...context, ...fields }, sink),
    };
};
