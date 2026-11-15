import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import type { ModelDefinition, Patch } from "@docstack/shared";

/**
 * Loads a TypeScript or JavaScript module from source, with no build step.
 *
 * The application's model is ordinary source in its own project, so the CLI has to read
 * it the way the application's own tooling would. `jiti` transpiles on the fly and
 * caches, which is what the proposal picked (`proposal.md` §12.1).
 *
 * Pattern: Adapter.
 *
 * @param path - Absolute path to the module.
 * @returns The module's exports.
 */
const loadModule = (path: string): Record<string, unknown> => {
    const require = createRequire(import.meta.url);
    // `requireCache: false` so a second call in one process re-reads the file. The
    // transpile cache stays on, being keyed by content. Without this the command is
    // only correct once per process: generating a patch, editing the model and
    // generating again - which is what a watch mode or a programmatic caller does -
    // would diff against the model as it was first loaded.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jiti = require("jiti")(path, {
        interopDefault: true,
        esmResolve: true,
        requireCache: false,
    });
    return jiti(path) as Record<string, unknown>;
};

/** Where the CLI looks for a model when no path is given, in priority order. */
export const MODEL_CANDIDATES = [
    "src/model.ts", "src/model.js", "model.ts", "model.js",
    "src/docstack/model.ts", "src/model/index.ts",
] as const;

/** Where the CLI looks for a patch directory when no path is given, in priority order. */
export const PATCH_CANDIDATES = ["src/patches", "patches", "src/docstack/patches"] as const;

/**
 * Resolves a path the caller gave, or the first convention that exists.
 *
 * @param cwd - The project root.
 * @param given - An explicit path from a flag, if any.
 * @param candidates - Conventional locations, in priority order.
 * @param what - Noun for the error message.
 * @returns The absolute path.
 * @throws If nothing is found, naming every place that was tried, since a silent
 * fallback to the wrong file would generate a patch against the wrong baseline.
 */
export const resolvePath = (
    cwd: string,
    given: string | undefined,
    candidates: readonly string[],
    what: string
): string => {
    if (given) {
        const absolute = isAbsolute(given) ? given : resolve(cwd, given);
        if (!existsSync(absolute)) throw new Error(`No ${what} at '${absolute}'.`);
        return absolute;
    }
    for (const candidate of candidates) {
        const absolute = join(cwd, candidate);
        if (existsSync(absolute)) return absolute;
    }
    throw new Error(
        `No ${what} found. Looked for ${candidates.join(", ")} under '${cwd}'. ` +
        `Pass an explicit path if it lives somewhere else.`
    );
};

/**
 * Loads the application's declared model.
 *
 * @param path - Absolute path to the model module.
 * @returns The model definition.
 * @throws If the module exports nothing that looks like one, naming what it did export
 * so the author can see whether they forgot to call `defineModel`.
 */
export const loadModel = (path: string): ModelDefinition => {
    const exported = loadModule(path);
    const candidates = [exported.model, exported.default, exported.MODEL];
    for (const candidate of candidates) {
        const maybe = candidate as ModelDefinition | undefined;
        if (maybe && Array.isArray(maybe.classes) && typeof maybe.toClassModels === "function") {
            return maybe;
        }
    }
    throw new Error(
        `'${path}' exports no model. Export one as \`model\` or as the default: ` +
        `\`export const model = defineModel({ classes: [...] })\`. ` +
        `Found: ${Object.keys(exported).join(", ") || "nothing"}.`
    );
};

/** A patch file on disk, with the version its name states. */
export type PatchFile = {
    /** The version, taken from the file name rather than the contents. */
    version: string;
    /** Absolute path. */
    path: string;
};

/**
 * Lists the patch files in a directory.
 *
 * The file name is the version, which is what makes the chain readable in a diff and
 * orderable without loading anything. `index` is skipped, being generated.
 *
 * @param directory - Absolute path to the patch directory.
 * @returns The files found, unordered.
 */
export const listPatchFiles = (directory: string): PatchFile[] => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
        .filter(entry => /\.(ts|js|mjs)$/.test(entry))
        .filter(entry => !/^index\./.test(entry))
        .map(entry => ({
            version: entry.replace(/\.(ts|js|mjs)$/, ""),
            path: join(directory, entry),
        }));
};

/**
 * Loads every patch in a directory.
 *
 * @param directory - Absolute path to the patch directory.
 * @returns The chain, unordered; `foldPatchChain` owns the ordering.
 * @throws If a file exports no patch, naming the file.
 */
export const loadChain = (directory: string): Patch[] => {
    return listPatchFiles(directory).map(file => {
        const exported = loadModule(file.path);
        const patch = (exported.default ?? exported.patch) as Patch | undefined;
        if (!patch || typeof patch !== "object" || !("version" in patch)) {
            throw new Error(`'${file.path}' exports no patch as its default.`);
        }
        return patch;
    });
};
