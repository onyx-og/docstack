import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveConfig, type ServerConfig, type ServerConfigInput } from "./schema.js";

/**
 * Reads a secret from `DS_<NAME>`, or from the file named by `DS_<NAME>_FILE` (Docker
 * and Cloud Run secrets), whichever is set.
 */
const secret = async (name: string): Promise<string | undefined> => {
    const direct = process.env[`DS_${name}`];
    if (direct !== undefined && direct !== "") return direct;
    const file = process.env[`DS_${name}_FILE`];
    if (file) return (await readFile(file, "utf8")).trim();
    return undefined;
};

/**
 * Applies the `DS_*` environment overrides an operator can set without editing the
 * config file: `DS_HOST`, `DS_PORT`, `DS_STORAGE_ADAPTER`, `DS_STORAGE_DIR`,
 * `DS_STATE_DIR`, `DS_JWT_SECRET`, `DS_DOC_KEY`, `DS_AUTHORITY_PASSPHRASE`,
 * `DS_LOG_LEVEL`. Secrets also accept the `_FILE` form.
 */
export const applyEnvironment = async (input: ServerConfigInput): Promise<ServerConfigInput> => {
    const out: any = { ...input };
    if (process.env.DS_HOST) out.host = process.env.DS_HOST;
    if (process.env.DS_PORT) out.port = Number(process.env.DS_PORT);
    if (process.env.DS_STORAGE_ADAPTER || process.env.DS_STORAGE_DIR) {
        out.storage = { ...(out.storage ?? {}) };
        if (process.env.DS_STORAGE_ADAPTER) out.storage.adapter = process.env.DS_STORAGE_ADAPTER;
        if (process.env.DS_STORAGE_DIR) out.storage.dir = process.env.DS_STORAGE_DIR;
    }
    if (process.env.DS_STATE_DIR) out.state = { ...(out.state ?? {}), dir: process.env.DS_STATE_DIR };
    if (process.env.DS_LOG_LEVEL) out.logLevel = process.env.DS_LOG_LEVEL;
    const jwtSecret = await secret("JWT_SECRET");
    if (jwtSecret) out.auth = { ...(out.auth ?? {}), jwt: { ...(out.auth?.jwt ?? {}), secret: jwtSecret } };
    const documentKey = await secret("DOC_KEY");
    if (documentKey) out.keys = { ...(out.keys ?? {}), documentKey };
    const passphrase = await secret("AUTHORITY_PASSPHRASE");
    if (passphrase && out.authority && "file" in out.authority) out.authority = { ...out.authority, passphrase };
    return out;
};

/**
 * Loads `ds.config.js` (ESM, default export, `defineConfig` optional) from a path,
 * applies the environment, validates, fills defaults.
 */
export const loadConfig = async (path = "ds.config.js"): Promise<ServerConfig> => {
    const absolute = resolve(process.cwd(), path);
    const module = await import(pathToFileURL(absolute).href);
    const input = (module.default ?? module.config ?? module) as ServerConfigInput;
    return resolveConfig(await applyEnvironment(input));
};
