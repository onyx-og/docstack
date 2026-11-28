import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
    assertJobReference, assertTriggerReference, diffModel, foldPatchChain,
    type ClassModel, type ModelDefinition, type Patch,
} from "@docstack/shared";
import semver from "semver";
import { renderIndexFile, renderPatchFile } from "./emit.js";
import {
    MODEL_CANDIDATES, PATCH_CANDIDATES, listPatchFiles, loadChain, loadModel,
    otherModelCandidates, otherPatchCandidates, refuseAmbiguous, resolvePath,
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
    /**
     * `--types-import`, where generated files import the `Patch` type from. Defaults to
     * `@docstack/client/model`; a project that depends on a different DocStack package
     * points it at that one.
     */
    typesImport?: string;
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
 * Whether a folded document describes a class.
 *
 * Shape-based, like the fold's own test: this runs over patch JSON with no stack to ask.
 *
 * @param doc - A document from a patch.
 * @returns `true` when it is a class model.
 */
const isClassDoc = (doc: { [key: string]: any }): boolean =>
    doc["~class"] === "class" || doc["~class"] === "~self";

/**
 * Every handler reference in a chain and a model that the model cannot answer.
 *
 * The build-time half of `ports.md` §5.3's fail-closed rule. The engine refuses to open
 * on an unresolvable reference, which is correct and also late: the mistake is usually a
 * handler renamed in code, or one declared but never passed to `defineModel`, and that is
 * a `--check` away from being caught in CI instead of in an application that will not
 * start.
 *
 * The exactly-one rule (`proposal.md` §13) is checked here too, for the same reason: the
 * engine enforces it when a patch applies, and a patch stating both a `handler` and a
 * `run` is worth failing a build over rather than shipping.
 *
 * @param chain - The patch chain, as loaded.
 * @param model - The declared model, whose `handlers` is the registry.
 * @returns One line per problem, in the order found; empty when every reference resolves.
 */
const handlerProblems = (chain: readonly Patch[], model: ModelDefinition): string[] => {
    const problems: string[] = [];
    const registered = model.handlers ?? {};
    const check = (name: string, kind: "trigger" | "job", where: string): void => {
        const handler = registered[name];
        if (!handler) {
            const known = Object.keys(registered).sort();
            problems.push(
                `${where} names the handler '${name}', which the model does not register. ` +
                (known.length
                    ? `The model registers: ${known.join(", ")}.`
                    : "The model registers no handlers - pass them as " +
                      "`defineModel({ classes, handlers })`.")
            );
            return;
        }
        if (handler.kind !== kind) {
            problems.push(
                `${where} needs a '${kind}' handler, but '${name}' is declared as '${handler.kind}'.`
            );
        }
    };

    const checkClass = (doc: ClassModel, where: string): void => {
        for (const trigger of (doc.triggers ?? [])) {
            try {
                assertTriggerReference(trigger, where);
            } catch (error) {
                problems.push((error as Error).message);
                continue;
            }
            if (trigger.handler) {
                check(trigger.handler, "trigger", `Trigger '${trigger.name}' on ${where}`);
            }
        }
    };

    for (const patch of chain) {
        const where = `patch '${patch.version}'`;
        for (const doc of (patch.docs ?? [])) {
            if (isClassDoc(doc)) checkClass(doc as unknown as ClassModel, `class '${doc.name ?? doc._id}' of ${where}`);
        }
        for (const phase of ["preApply", "postApply"] as const) {
            const job = patch[phase];
            if (!job) continue;
            try {
                assertJobReference(job, `${where} ${phase}`);
            } catch (error) {
                problems.push((error as Error).message);
                continue;
            }
            if (job.handler) check(job.handler, "job", `The ${phase} job of ${where}`);
        }
    }

    // The declared model too: a trigger written as `{ name, order, handler: "a.name" }` -
    // a string rather than a `defineHandler` result - is not collected into the registry,
    // so it can name something nothing declares.
    for (const doc of model.toClassModels()) {
        checkClass(doc, `declared class '${doc.name}'`);
    }

    return problems;
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
    // Only when the path was guessed: an explicit `--model` is the author saying which
    // one they mean, and a project with several pairs says it once per invocation.
    if (!options.model) {
        refuseAmbiguous(
            options.cwd, modelPath, otherModelCandidates(options.cwd, modelPath), "--model"
        );
    }
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

    if (!options.patches) {
        refuseAmbiguous(
            options.cwd, patchDir, otherPatchCandidates(options.cwd, patchDir), "--patches"
        );
    }

    const chain = loadChain(patchDir);
    const folded = foldPatchChain(chain);
    const diff = diffModel(folded, model);
    const output: string[] = [];
    for (const warning of diff.warnings) output.push(`warning: ${warning}`);

    // Before anything else is reported: a chain the engine will refuse to open is a
    // failure whatever the diff says, and generating another patch on top of it would
    // only add to what cannot be applied.
    const handlers = handlerProblems(chain, model);
    if (handlers.length) {
        for (const problem of handlers) output.push(`error: ${problem}`);
        output.push(
            "A handler reference has to resolve in the model this build registers, or the " +
            "stack refuses to open (`ports.md` §5.3)."
        );
        return { code: 1, output };
    }

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
        typesImport: options.typesImport,
    }), "utf8");

    const versions = listPatchFiles(patchDir)
        .map(entry => entry.version)
        .filter(entry => semver.valid(entry))
        .sort(semver.compare);
    writeFileSync(join(patchDir, "index.ts"), renderIndexFile(versions, options.typesImport), "utf8");

    output.push(
        `Wrote ${file}`,
        `  ${diff.docs.length} class document(s): ${diff.docs.map(doc => doc.name ?? doc._id).join(", ")}`,
        `  target '${target}', version ${version}`,
        `Updated ${join(patchDir, "index.ts")} with ${versions.length} patch(es).`
    );
    return { code: 0, output, written: file };
};
