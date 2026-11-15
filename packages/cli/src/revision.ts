import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { diffModel, foldPatchChain } from "@docstack/shared";
import semver from "semver";
import { renderIndexFile, renderPatchFile } from "./emit.js";
import {
    MODEL_CANDIDATES, PATCH_CANDIDATES, listPatchFiles, loadChain, loadModel, resolvePath,
} from "./load.js";

/** What `revision` was asked to do. */
export type RevisionOptions = {
    /** Project root. */
    cwd: string;
    /** `--autogenerate` writes a patch; `--check` only reports. */
    mode: "autogenerate" | "check";
    /** `-m`, the changelog line. Required when generating. */
    message?: string;
    /** `--model`, overriding the conventions. */
    model?: string;
    /** `--patches`, overriding the conventions. */
    patches?: string;
    /** `--target`, the consumer patch target. Defaults to the project's package name. */
    target?: string;
    /** `--bump`, how to derive the next version. */
    bump?: "major" | "minor" | "patch";
    /** `--version`, an explicit next version, which wins over `--bump`. */
    version?: string;
};

/** What the command decided, so a caller can report it without re-deriving anything. */
export type RevisionResult = {
    /** Process exit code: non-zero when `--check` found a difference. */
    code: number;
    /** Lines to print. */
    output: string[];
    /** The file written, if any. */
    written?: string;
};

/**
 * The next version for a generated patch.
 *
 * @param versions - Versions already in the chain, any order.
 * @param explicit - `--version`, which is used as given.
 * @param bump - `--bump`; minor by default, a schema change being additive more often
 * than not.
 * @returns The version to write.
 * @throws If an explicit version is not valid semver, or is not ahead of the chain -
 * a patch that sorts before an applied one would never apply on a device that has it.
 */
export const nextVersion = (
    versions: readonly string[],
    explicit?: string,
    bump: "major" | "minor" | "patch" = "minor"
): string => {
    const valid = versions.filter(version => semver.valid(version)).sort(semver.compare);
    const highest = valid.length ? valid[valid.length - 1] : null;
    if (explicit) {
        if (!semver.valid(explicit)) {
            throw new Error(`--version '${explicit}' is not valid semver.`);
        }
        if (highest && !semver.gt(explicit, highest)) {
            throw new Error(
                `--version '${explicit}' is not ahead of '${highest}', the chain's highest. ` +
                "A patch that sorts before an applied one never applies."
            );
        }
        return explicit;
    }
    if (!highest) return "0.1.0";
    const bumped = semver.inc(highest, bump);
    if (!bumped) throw new Error(`Could not ${bump}-bump '${highest}'.`);
    return bumped;
};

/**
 * Reads the project's own package name, for the default patch target.
 *
 * @param cwd - Project root.
 * @returns The package name, or the directory name when there is no package.
 */
const defaultTarget = (cwd: string): string => {
    try {
        const pkg = join(cwd, "package.json");
        if (existsSync(pkg)) {
            const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
            if (parsed.name) return parsed.name;
        }
    } catch {
        // No package.json, or an unreadable one: the directory name still identifies
        // the consumer, and `--target` overrides either way.
    }
    return basename(cwd);
};

/**
 * Diffs the declared model against the folded patch chain, then either writes the
 * patch that closes the gap or reports that one is missing.
 *
 * Pattern: Command. Every decision about *what* a patch should contain belongs to
 * `@docstack/shared`; this function owns paths, versions and files (`proposal.md` §6.2).
 *
 * @param options - See {@link RevisionOptions}.
 * @returns What happened; see {@link RevisionResult}.
 * @throws If the model or the chain cannot be loaded, or `-m` is missing when
 * generating.
 */
export const revision = (options: RevisionOptions): RevisionResult => {
    const modelPath = resolvePath(options.cwd, options.model, MODEL_CANDIDATES, "model");
    const model = loadModel(modelPath);

    let patchDir: string;
    try {
        patchDir = resolvePath(options.cwd, options.patches, PATCH_CANDIDATES, "patch directory");
    } catch (error) {
        // Generating the first patch is allowed to create the directory; checking
        // against a chain that does not exist is not an error either - everything is
        // new, which the diff will say.
        if (options.mode === "check" || !options.patches) {
            patchDir = join(options.cwd, options.patches ?? PATCH_CANDIDATES[0]);
        } else {
            throw error;
        }
    }

    const chain = loadChain(patchDir);
    const folded = foldPatchChain(chain);
    const diff = diffModel(folded, model);
    const output: string[] = [];
    for (const warning of diff.warnings) output.push(`warning: ${warning}`);

    if (!diff.docs.length && !diff.warnings.length) {
        output.push(
            diff.unchanged.length
                ? `Model and patch chain agree on ${diff.unchanged.length} class(es): ${diff.unchanged.join(", ")}.`
                : "Model and patch chain agree; the model declares no classes."
        );
        return { code: 0, output };
    }

    if (options.mode === "check") {
        if (diff.docs.length) {
            output.push(
                `Model and patch chain disagree on ${diff.docs.length} class(es): ` +
                `${diff.docs.map(doc => doc.name ?? doc._id).join(", ")}.`,
                "Run `docstack revision --autogenerate -m \"<what changed>\"` and commit the generated patch."
            );
        } else {
            output.push("The model and the chain disagree in a way the generator will not write for you.");
        }
        return { code: 1, output };
    }

    if (!options.message) {
        throw new Error("--autogenerate needs a message: -m \"what changed\".");
    }

    const version = nextVersion(folded.versions, options.version, options.bump);
    const target = options.target ?? defaultTarget(options.cwd);
    mkdirSync(patchDir, { recursive: true });

    const file = join(patchDir, `${version}.ts`);
    writeFileSync(file, renderPatchFile({
        version,
        target,
        changelog: options.message,
        docs: diff.docs,
    }), "utf8");

    const versions = listPatchFiles(patchDir)
        .map(entry => entry.version)
        .filter(entry => semver.valid(entry))
        .sort(semver.compare);
    writeFileSync(join(patchDir, "index.ts"), renderIndexFile(versions), "utf8");

    output.push(
        `Wrote ${file}`,
        `  ${diff.docs.length} class document(s): ${diff.docs.map(doc => doc.name ?? doc._id).join(", ")}`,
        `  target '${target}', version ${version}`,
        `Updated ${join(patchDir, "index.ts")} with ${versions.length} patch(es).`
    );
    return { code: 0, output, written: file };
};
