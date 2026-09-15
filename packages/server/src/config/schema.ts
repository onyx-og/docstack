import { z } from "zod";
import type { AuthorityMaterial, Grant, HostStackConfig, Principal } from "../types.js";

const fn = <T>() => z.custom<T>((value) => typeof value === "function", { message: "expected a function" });
const stackConfig = () => z.custom<HostStackConfig>((value) => typeof value === "object" && value !== null, { message: "expected a stack configuration object" });

/** `authority` accepts inline material (tests), an encrypted file, or a loader (a KMS). */
export const AuthorityConfigSchema = z.union([
    z.object({ pk: z.string(), msk: z.string() }),
    z.object({ file: z.string(), passphrase: z.string().optional() }),
    z.object({ load: fn<() => Promise<AuthorityMaterial> | AuthorityMaterial>() }),
]);

const SessionCookieSchema = z.object({
    name: z.string().default("ds_session"),
    sameSite: z.enum(["Strict", "Lax", "None"]).default("Lax"),
    secure: z.boolean().default(false),
});

const SessionSchema = z.object({
    ttlSeconds: z.number().int().positive().default(3600),
    cookie: SessionCookieSchema.default({ name: "ds_session", sameSite: "Lax", secure: false }),
});

export const ConfigSchema = z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().min(0).max(65535).default(5984),
    storage: z.object({
        adapter: z.enum(["leveldb", "memory"]).default("leveldb"),
        dir: z.string().default("./data"),
    }).default({ adapter: "leveldb", dir: "./data" }),
    /** Where the node keeps what it must remember: the authority file, the node secret, the credential store. */
    state: z.object({ dir: z.string().default("./.docstack") }).default({ dir: "./.docstack" }),
    keys: z.object({
        /** The document key every stack opens with unless the stack says otherwise. Absent: a blind hub. */
        documentKey: z.string().regex(/^[0-9a-f]{64}$/).optional(),
        /** Per-stack key material from wherever the operator keeps it. */
        load: fn<(stack: string) => Promise<string | undefined> | string | undefined>().optional(),
    }).default({}),
    authority: AuthorityConfigSchema.optional(),
    stacks: z.record(z.string(), stackConfig()).default({}),
    stackTemplates: z.record(z.string(), stackConfig()).default({}),
    warm: z.array(z.string()).default([]),
    auth: z.object({
        jwt: z.object({
            secret: z.string().min(16).optional(),
            jwks: z.string().url().optional(),
            issuer: z.string().optional(),
            audience: z.string().optional(),
        }).optional(),
        /** Enable the credential store and `POST /auth/session`. Needs `jwt.secret` to sign what it issues. */
        users: z.boolean().default(false),
        /** Where the credential store lives: a JSON file under `state.dir`, or memory (tests, throwaway nodes). */
        store: z.enum(["file", "memory"]).default("file"),
        session: SessionSchema.default({ ttlSeconds: 3600, cookie: { name: "ds_session", sameSite: "Lax", secure: false } }),
    }).default({ users: false, session: { ttlSeconds: 3600, cookie: { name: "ds_session", sameSite: "Lax", secure: false } } }),
    grant: fn<(principal: Principal) => Grant | Promise<Grant>>().default(() => () => ({ stacks: {} })),
    cors: z.object({ origins: z.array(z.string()).default([]) }).default({ origins: [] }),
    feed: z.object({
        heartbeatMs: z.number().int().positive().default(15_000),
        idleMs: z.number().int().positive().default(300_000),
    }).default({ heartbeatMs: 15_000, idleMs: 300_000 }),
    /** JSON request bodies larger than this are refused with 413. */
    maxBodyBytes: z.number().int().positive().default(1_048_576),
    /** The host's own log level. */
    logLevel: z.enum(["error", "warn", "info", "debug", "silent"]).default("warn"),
    /** The engine's module-level loggers, silenced unless asked; a stack's own `logLevel` still wins. */
    engineLogLevel: z.enum(["error", "warn", "info", "debug", "silent"]).default("silent"),
});

export type ServerConfigInput = z.input<typeof ConfigSchema>;
export type ServerConfig = z.output<typeof ConfigSchema>;

/**
 * Identity helper for `ds.config.js`: types the object, changes nothing.
 *
 * @example
 * ```javascript
 * import { defineConfig } from '@docstack/server';
 * export default defineConfig({
 *     port: 5984,
 *     stacks: { 'my-app': { patches } },
 *     grant: (principal) => ({ stacks: { 'my-app': { api: true, documentKey: true } } }),
 * });
 * ```
 */
export const defineConfig = (config: ServerConfigInput): ServerConfigInput => config;

/** Validates and fills defaults. Throws naming the first offending field. */
export const resolveConfig = (input: ServerConfigInput): ServerConfig => {
    const parsed = ConfigSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(`Invalid server configuration at '${issue.path.join(".") || "<root>"}': ${issue.message}`);
    }
    const config = parsed.data;
    if (config.auth.users && !config.auth.jwt?.secret) {
        throw new Error("Invalid server configuration: 'auth.users' needs 'auth.jwt.secret' to sign the sessions it issues.");
    }
    return config;
};

/** A stack name that is safe in a path and as a database name. */
export const STACK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
