import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

/**
 * Other files beside the chosen model that look like one too.
 *
 * The conventions pick the FIRST candidate that exists, which is right for a project with
 * one model and silently wrong for a project with two: a `--check` that passes while a
 * second model's chain has drifted is a green CI run over a broken schema. The tool cannot
 * know a project has two stacks unless the project says so, so where it might be guessing
 * it refuses instead and asks for an explicit path.
 *
 * Deliberately a heuristic, and deliberately overridable: a file named `model-utils.ts`
 * next to the model trips it, and the cost of that false positive is one `--model` flag,
 * which is also the fix. A missed second model costs a false pass, which is worse.
 *
 * @param chosen - Absolute path to the model the conventions picked.
 * @returns Absolute paths of the others, sorted; empty when the choice is unambiguous.
 */
export const otherModelCandidates = (cwd: string, chosen: string): string[] => {
    const found = new Set<string>();
    for (const candidate of MODEL_CANDIDATES) {
        const absolute = join(cwd, candidate);
        if (existsSync(absolute)) found.add(absolute);
    }
    const directory = dirname(chosen);
    if (existsSync(directory)) {
        for (const entry of readdirSync(directory)) {
            if (/\.d\.(ts|mts)$/.test(entry)) continue;
            if (/^model.*\.(ts|js|mjs)$/.test(entry) || /\.model\.(ts|js|mjs)$/.test(entry)) {
                found.add(join(directory, entry));
            }
        }
    }
    found.delete(chosen);
    return [...found].sort();
};

/**
 * Other directories beside the chosen one that look like a patch chain.
 *
 * Same reasoning as {@link otherModelCandidates}, for the same reason: a patch generated
 * into the wrong chain is as wrong as a check that read the wrong one.
 *
 * @param cwd - Project root.
 * @param chosen - Absolute path to the patch directory the conventions picked.
 * @returns Absolute paths of the others, sorted; empty when the choice is unambiguous.
 */
export const otherPatchCandidates = (cwd: string, chosen: string): string[] => {
    const found = new Set<string>();
    for (const candidate of PATCH_CANDIDATES) {
        const absolute = join(cwd, candidate);
        if (existsSync(absolute)) found.add(absolute);
    }
    const parent = dirname(chosen);
    if (existsSync(parent)) {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (/patches/i.test(entry.name)) found.add(join(parent, entry.name));
        }
    }
    found.delete(chosen);
    return [...found].sort();
};

/**
 * Refuses when the conventions had more than one plausible answer.
 *
 * @param cwd - Project root.
 * @param chosen - What the conventions picked.
 * @param others - The other candidates.
 * @param flag - The flag that makes the choice explicit.
 * @throws Always, when `others` is non-empty.
 */
export const refuseAmbiguous = (
    cwd: string, chosen: string, others: string[], flag: string
): void => {
    if (!others.length) return;
    const show = (path: string) => relative(cwd, path) || path;
    throw new Error(
        `Ambiguous: ${flag} was not given, and '${show(chosen)}' is not the only candidate. `
        + `Also found ${others.map(show).map(entry => `'${entry}'`).join(", ")}. `
        + `Pass ${flag} explicitly. A project with more than one model or chain - one stack `
        + "per workspace, say - runs this command once per pair, because a run that silently "
        + "covered only one of them would pass while the other had drifted."
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

/** A loaded patch, with the file it came from. */
export type LoadedPatch = PatchFile & {
    /** The patch the module exported. */
    patch: Patch;
};

/**
 * Loads every patch in a directory, keeping the file each one came from.
 *
 * The pairing is what lets a caller compare a patch's **declared** version against the
 * one its file name states. They can differ, and the consequence is not obvious: the
 * generator orders files by name while the engine orders patches by the version inside
 * them, so the two disagree about when the patch applies. `doctor` reports that.
 *
 * @param directory - Absolute path to the patch directory.
 * @returns One entry per patch file, unordered; `foldPatchChain` owns the ordering.
 * @throws If a file exports no patch, naming the file.
 */
export const loadPatchFiles = (directory: string): LoadedPatch[] => {
    return listPatchFiles(directory).map(file => {
        const exported = loadModule(file.path);
        const patch = (exported.default ?? exported.patch) as Patch | undefined;
        if (!patch || typeof patch !== "object" || !("version" in patch)) {
            throw new Error(`'${file.path}' exports no patch as its default.`);
        }
        return { ...file, patch };
    });
};

/**
 * Loads every patch in a directory.
 *
 * @param directory - Absolute path to the patch directory.
 * @returns The chain, unordered; `foldPatchChain` owns the ordering.
 * @throws If a file exports no patch, naming the file.
 */
export const loadChain = (directory: string): Patch[] =>
    loadPatchFiles(directory).map(entry => entry.patch);
