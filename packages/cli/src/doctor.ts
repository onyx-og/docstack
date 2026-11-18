import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { diffModel, foldPatchChain } from "@docstack/shared";
import type { AttributeModel, ClassModel, ModelDefinition, Patch } from "@docstack/shared";
import semver from "semver";
import {
    LoadedPatch, MODEL_CANDIDATES, PATCH_CANDIDATES, loadModel, loadPatchFiles, resolvePath,
} from "./load.js";

/**
 * How much a finding matters.
 *
 * `error` fails the command, because something is wrong now. `warning` is something that
 * will bite later, or in a consumer's project rather than here. `note` asks for attention
 * without failing - what the data scan cannot check from outside the application, most of
 * all. `ok` is a check reporting that it ran and found nothing, which a report is worse
 * without: a doctor that stays silent about dependencies leaves you wondering whether it
 * looked at them.
 */
export type Severity = "error" | "warning" | "note" | "ok";

/** One thing the report has to say. */
export type Finding = {
    /** How much it matters. */
    severity: Severity;
    /** Short name of the check, so a reader can tell which one spoke. */
    check: string;
    /** One line, naming what is wrong and where. */
    message: string;
    /** Optional second paragraph: why it matters, or what to do. */
    detail?: string;
};

/** What `doctor` was asked to look at. */
export type DoctorOptions = {
    /** Project root. */
    cwd: string;
    /** `--model`, overriding the conventions. */
    model?: string;
    /** `--patches`, overriding the conventions. */
    patches?: string;
};

/** What the command found. */
export type DoctorResult = {
    /** Process exit code: non-zero when any finding is an `error`. */
    code: number;
    /** Every finding, in the order the checks ran. */
    findings: Finding[];
    /** Lines to print. */
    output: string[];
};

/** Attribute types whose stored values the 2.0 data-shape fixes made stricter. */
const NEWLY_STRICT: Record<string, string> = {
    integer: "rejects a decimal, which it used to accept",
    enum: "accepts only the declared string members; a numeric enum used to reject everything",
    date: "requires an ISO-8601 string in UTC, where the type used to throw instead of validating",
};

/**
 * Reads a dependency's version as installed, from the project's own resolution.
 *
 * Two attempts, because the obvious one is not enough: `require.resolve(name +
 * "/package.json")` fails for any package with an `exports` map that does not list
 * `./package.json` - which `@docstack/client` does not, and most modern packages do not.
 * Reporting that as "not installed" would be a false negative in exactly the check a
 * doctor is trusted for, so the fallback resolves the package's entry point and walks up
 * to the manifest beside it.
 *
 * @param cwd - Project root.
 * @param name - Package name.
 * @returns The version, or `null` when the package cannot be resolved from there.
 */
const installedVersion = (cwd: string, name: string): string | null => {
    const require = createRequire(join(cwd, "package.json"));
    const read = (path: string): string | null => {
        try {
            const parsed = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
            return parsed.name === name ? parsed.version ?? null : null;
        } catch {
            return null;
        }
    };
    try {
        return read(require.resolve(`${name}/package.json`));
    } catch {
        // Not exported; find the manifest by walking up from whatever the entry resolves to.
        try {
            let directory = dirname(require.resolve(name));
            for (let depth = 0; depth < 8; depth += 1) {
                const version = read(join(directory, "package.json"));
                if (version) return version;
                const parent = dirname(directory);
                if (parent === directory) break;
                directory = parent;
            }
        } catch {
            // Genuinely not resolvable from here.
        }
        return null;
    }
};

/**
 * Checks the declared model for shapes that are legal to write down and do not mean what
 * they read like.
 *
 * These are static: every one is visible in the declaration, which is the point of
 * declaring it. Several exist because the 2.0 data-shape fixes made a previously
 * meaningless config into an error (`proposal.md` §8).
 *
 * @param model - The loaded model.
 * @returns The findings, in declaration order.
 */
const checkModel = (model: ModelDefinition): Finding[] => {
    const findings: Finding[] = [];
    const declared = new Set(model.classes.map(c => c.name));

    for (const classObj of model.classes) {
        const schema = classObj.toClassModel().schema ?? {};
        for (const [name, attribute] of Object.entries(schema as Record<string, AttributeModel>)) {
            const where = `${classObj.name}.${name}`;
            const config = (attribute.config ?? {}) as Record<string, unknown>;

            if (attribute.type === "enum") {
                const values = (config.values ?? []) as { value?: unknown }[];
                if (!values.length) {
                    findings.push({
                        severity: "error", check: "model",
                        message: `${where} is an enum with no members, so no value can satisfy it.`,
                    });
                } else {
                    const bad = values.filter(entry => typeof entry?.value !== "string");
                    if (bad.length) {
                        findings.push({
                            severity: "error", check: "model",
                            message: `${where} declares ${bad.length} non-string enum member(s).`,
                            detail: "`z.enum` only ever accepted strings: handed anything else it "
                                + "built without complaint and then rejected every input, so such an "
                                + "attribute has never accepted a value.",
                        });
                    }
                }
            }

            if (config.defaultValue !== undefined && config.isArray === true) {
                findings.push({
                    severity: "warning", check: "model",
                    message: `${where} is an array with a defaultValue, which fills nothing.`,
                    detail: "Modifiers apply `defaultValue` before `isArray`, so the default "
                        + "belongs to the array's members. The engine writes no value for the "
                        + "attribute itself and the key may be absent on a stored document.",
                });
            }

            if (attribute.type === "integer" && typeof config.defaultValue === "number"
                && !Number.isInteger(config.defaultValue)) {
                findings.push({
                    severity: "error", check: "model",
                    message: `${where} is an integer whose defaultValue (${config.defaultValue}) is not one.`,
                    detail: "An integer attribute rejects a decimal since 2.0, so this default "
                        + "cannot be written.",
                });
            }

            if (attribute.type === "decimal" && typeof config.precision === "number"
                && typeof config.defaultValue === "number") {
                const places = String(config.defaultValue).split(".")[1]?.length ?? 0;
                if (places > config.precision) {
                    findings.push({
                        severity: "error", check: "model",
                        message: `${where} has a defaultValue with ${places} decimal places but `
                            + `declares precision ${config.precision}.`,
                    });
                }
            }

            if (attribute.type === "foreign_key") {
                const target = config.targetClass as string | undefined;
                if (!target) {
                    findings.push({
                        severity: "error", check: "model",
                        message: `${where} is a foreign key with no targetClass.`,
                    });
                } else if (!declared.has(target)) {
                    findings.push({
                        severity: "warning", check: "model",
                        message: `${where} points at '${target}', which this model does not declare.`,
                        detail: "Legal if that class is created at runtime or installed by another "
                            + "patch chain; a typo otherwise, and the existence check fails at "
                            + "write time rather than here.",
                    });
                }
            }

            if (config.encrypted === true) {
                findings.push({
                    severity: "note", check: "model",
                    message: `${where} is encrypted, so writes to ${classObj.name} need an unlocked stack.`,
                    detail: "A stack opened without a document key refuses them (ADR-0018), and a "
                        + "patch touching this class defers while locked (ADR-0044).",
                });
            }
        }
    }
    return findings;
};

/**
 * Checks the patch chain for shapes the engine reads differently than they look.
 *
 * @param loaded - The patch files, each with the patch it exported, so a file name and the
 * version inside it can be compared.
 * @returns The findings.
 */
const checkChain = (loaded: LoadedPatch[]): Finding[] => {
    const findings: Finding[] = [];
    const chain = loaded.map(entry => entry.patch);
    const byVersion = new Map<string, string[]>();

    for (const entry of loaded) {
        if (!semver.valid(entry.version)) {
            findings.push({
                severity: "error", check: "chain",
                message: `'${entry.path}' is not named for a semver version.`,
                detail: "The file name is the version, which is what makes the chain orderable "
                    + "without loading anything.",
            });
            continue;
        }
        if (entry.patch.version !== entry.version) {
            findings.push({
                severity: "error", check: "chain",
                message: `'${entry.path}' declares version '${entry.patch.version}'.`,
                detail: "The generator orders files by name and the engine orders patches by the "
                    + "version inside them, so the two disagree about when this patch applies.",
            });
        }
        byVersion.set(entry.version, [...(byVersion.get(entry.version) ?? []), entry.path]);
    }

    for (const [version, paths] of byVersion) {
        if (paths.length > 1) {
            findings.push({
                severity: "error", check: "chain",
                message: `Version ${version} is carried by ${paths.length} files: ${paths.join(", ")}.`,
            });
        }
    }

    const targets = new Set(chain.map(patch => patch.target).filter(Boolean));
    if (targets.size > 1) {
        findings.push({
            severity: "warning", check: "chain",
            message: `The chain carries ${targets.size} different targets: ${[...targets].join(", ")}.`,
            detail: "The sync gate compares versions per target (ADR-0040), so a chain that "
                + "changes target mid-way is two chains as far as the gate is concerned.",
        });
    }

    const seenClassDoc = new Set<string>();
    for (const patch of [...chain].sort((left, right) =>
        semver.valid(left.version) && semver.valid(right.version)
            ? semver.compare(left.version, right.version) : 0)) {
        for (const doc of patch.docs ?? []) {
            const id = (doc as { _id?: string })._id;
            if (!id) {
                findings.push({
                    severity: "error", check: "chain",
                    message: `Patch ${patch.version} carries a document with no _id.`,
                });
                continue;
            }
            const isClassDoc = (doc as { "~class"?: string })["~class"] === "class"
                || (doc as { "~class"?: string })["~class"] === "~self";
            if (!isClassDoc) continue;
            const rev = (doc as { _rev?: string })._rev;
            if (seenClassDoc.has(id) && rev !== "auto") {
                findings.push({
                    severity: "error", check: "chain",
                    message: `Patch ${patch.version} restates class '${id}' without \`_rev: "auto"\`.`,
                    detail: "Without that marker the document is a fresh insert that REPLACES the "
                        + "stored class, so every attribute an earlier patch added is lost "
                        + "(ADR-0037). A generated delta always carries it.",
                });
            }
            seenClassDoc.add(id);
        }
    }
    return findings;
};

/**
 * Checks the project's dependencies and TypeScript configuration.
 *
 * The `types` check is here because of a defect this release fixed the hard way: a public
 * type declared through the ambient `PouchDB` namespace resolves to `any` in a project
 * that restricts `compilerOptions.types`, `skipLibCheck` hides the cause, and a typed
 * model silently stops being typed. The document types are self-contained now, but
 * everything engine-facing still goes through the namespace.
 *
 * @param cwd - Project root.
 * @param modelRelative - The model's path relative to the root, used to tell which
 * TypeScript configuration actually compiles the model. Omitted when no model was found.
 * @returns The findings.
 */
const checkEnvironment = (cwd: string, modelRelative?: string): Finding[] => {
    const findings: Finding[] = [];

    const zod = installedVersion(cwd, "zod");
    if (zod && semver.valid(zod) && semver.major(zod) >= 4) {
        findings.push({
            severity: "ok", check: "deps",
            message: `zod ${zod} resolves from this project.`,
        });
    } else if (!zod) {
        findings.push({
            severity: "error", check: "deps",
            message: "zod does not resolve from this project.",
            detail: "`@docstack/shared` takes it as a peer dependency so the application "
                + "resolves one copy, and therefore one schema identity. Install zod 4.",
        });
    } else if (semver.major(zod) < 4) {
        findings.push({
            severity: "error", check: "deps",
            message: `zod ${zod} resolves here, but the validator is built against 4.x.`,
        });
    }

    const client = installedVersion(cwd, "@docstack/client");
    const shared = installedVersion(cwd, "@docstack/shared");
    if (client) {
        findings.push({
            severity: "ok", check: "deps",
            message: `@docstack/client ${client}${shared ? `, @docstack/shared ${shared}` : ""}.`,
        });
    } else {
        findings.push({
            severity: "warning", check: "deps",
            message: "@docstack/client does not resolve from this project.",
            detail: "The model's builders are imported from `@docstack/client/model`, so a model "
                + "that type-checks today does so against something else.",
        });
    }
    if (client && shared && semver.valid(client) && semver.valid(shared)
        && semver.major(client) !== semver.major(shared)) {
        findings.push({
            severity: "warning", check: "deps",
            message: `@docstack/client ${client} and @docstack/shared ${shared} are on different majors.`,
            detail: "The builders and the engine's validator come from the same package in a "
                + "healthy install; two majors in one graph can mean two sets of model semantics.",
        });
    }

    if (installedVersion(cwd, "@types/pouchdb")) {
        findings.push({
            severity: "ok", check: "types",
            message: "@types/pouchdb resolves, so the engine-facing public types are real types.",
        });
    } else {
        findings.push({
            severity: "warning", check: "types",
            message: "@types/pouchdb does not resolve from this project.",
            detail: "`@docstack/shared` depends on it, so a normal install has it. Without it, "
                + "the engine-facing public types resolve to `any` and `skipLibCheck` hides why.",
        });
    }

    for (const entry of readdirSync(cwd).filter(name => /^tsconfig.*\.json$/.test(name))) {
        let parsed: {
            compilerOptions?: { types?: string[] };
            include?: string[];
            files?: string[];
        };
        try {
            // Comments are legal in a tsconfig and `JSON.parse` refuses them, so both
            // kinds come out first. Both, because the Vite templates use `/* ... */` and
            // stripping only `//` skipped `tsconfig.app.json` - the one file where this
            // check matters most - without saying so.
            const source = readFileSync(join(cwd, entry), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, "");
            parsed = JSON.parse(source);
        } catch {
            // Said out loud rather than skipped: a config this cannot read is a config
            // this cannot vouch for, and silence would read as approval.
            findings.push({
                severity: "note", check: "types",
                message: `${entry} could not be parsed, so its compilerOptions were not checked.`,
                detail: "Trailing commas or an unusual comment are the usual reasons. Check by "
                    + `hand that compilerOptions.types, if it is set, includes "pouchdb".`,
            });
            continue;
        }
        const types = parsed.compilerOptions?.types;
        if (!Array.isArray(types) || types.includes("pouchdb")) continue;

        // Only the configuration that compiles the model matters. A Vite project has a
        // second one for `vite.config.ts` alone, and warning about that is noise: it
        // never sees a DocStack type. A config declaring no `include` compiles
        // everything, so it counts.
        const scope = [
            ...(parsed.include ?? []),
            ...(parsed.files ?? []),
        ].map(entry => entry.replace(/^\.\//, "").split("/")[0]);
        const modelRoot = modelRelative?.split("/")[0];
        if (scope.length && modelRoot && !scope.includes(modelRoot)) continue;

        {
            findings.push({
                severity: "warning", check: "types",
                message: `${entry} sets compilerOptions.types without "pouchdb".`,
                detail: "That turns off automatic @types inclusion, so every type declared "
                    + "through the ambient PouchDB namespace resolves to `any` in this project - "
                    + "silently, because skipLibCheck hides the cause. The document types and "
                    + "`InferDoc` are self-contained and unaffected; engine-facing signatures "
                    + `are not. Add "pouchdb" to that array.`,
            });
        }
    }
    return findings;
};

/**
 * Says what the data scan would check, and why it cannot run from here.
 *
 * The 2.0 data-shape fixes are stricter than what stored documents were written under, so
 * a document can be perfectly valid in the database and refused the next time it is
 * written. That is a question about **data**, and an application's data lives where the
 * application runs - a browser's IndexedDB, a Permetic store, a server's volume - none of
 * which this process can open. Rather than pretend, the report names the attributes at
 * risk so the check can be run where the data is.
 *
 * @param model - The loaded model.
 * @returns One note per at-risk attribute type, or none.
 */
const checkStoredData = (model: ModelDefinition): Finding[] => {
    const atRisk: string[] = [];
    for (const classObj of model.classes) {
        const schema = (classObj.toClassModel().schema ?? {}) as Record<string, AttributeModel>;
        for (const [name, attribute] of Object.entries(schema)) {
            if (NEWLY_STRICT[attribute.type]) {
                atRisk.push(`${classObj.name}.${name} (${attribute.type}: ${NEWLY_STRICT[attribute.type]})`);
            }
        }
    }
    if (!atRisk.length) return [];
    return [{
        severity: "note", check: "data",
        message: `${atRisk.length} attribute(s) are stricter in 2.0 than when existing documents were written.`,
        detail: "This process cannot read your data - it lives where the application runs - so "
            + "check these where it does, before upgrading. A document that fails is still "
            + "readable; it is the next WRITE that is refused.\n  - " + atRisk.join("\n  - "),
    }];
};

/**
 * Runs every check and reports.
 *
 * Pattern: Command, like `revision`. Every rule that belongs to the model itself lives in
 * `@docstack/shared`; what lives here is the project's own shape - files, dependencies,
 * TypeScript configuration - which is what a doctor is for.
 *
 * @param options - See {@link DoctorOptions}.
 * @returns What it found; see {@link DoctorResult}.
 */
export const doctor = (options: DoctorOptions): DoctorResult => {
    const findings: Finding[] = [];
    let model: ModelDefinition | null = null;
    let modelPath: string | null = null;

    try {
        modelPath = resolvePath(options.cwd, options.model, MODEL_CANDIDATES, "model");
        model = loadModel(modelPath);
        findings.push({
            severity: "ok", check: "model",
            message: `${model.classes.length} class(es) declared in ${modelPath}: `
                + `${model.classes.map(c => c.name).join(", ") || "none"}.`,
        });
    } catch (error) {
        findings.push({
            severity: "error", check: "model",
            message: (error as Error).message,
        });
    }

    let patchDir: string | null = null;
    try {
        patchDir = resolvePath(options.cwd, options.patches, PATCH_CANDIDATES, "patch directory");
    } catch (error) {
        findings.push({
            severity: "error", check: "chain",
            message: (error as Error).message,
        });
    }

    if (patchDir && model) {
        try {
            const loaded = loadPatchFiles(patchDir);
            const chain = loaded.map(entry => entry.patch);
            findings.push({
                severity: "ok", check: "chain",
                message: `${chain.length} patch(es) in ${patchDir}.`,
            });
            findings.push(...checkChain(loaded));

            const folded = foldPatchChain(chain);
            const diff = diffModel(folded, model);
            for (const warning of diff.warnings) {
                findings.push({ severity: "warning", check: "chain", message: warning });
            }
            if (diff.docs.length) {
                findings.push({
                    severity: "error", check: "chain",
                    message: "The model and the patch chain disagree on "
                        + `${diff.docs.map(doc => (doc as ClassModel).name ?? doc._id).join(", ")}.`,
                    detail: "Run `docstack revision --autogenerate -m \"<what changed>\"` and commit "
                        + "the generated patch. Until then, a device installs a schema the code "
                        + "does not expect.",
                });
            } else if (diff.unchanged.length) {
                findings.push({
                    severity: "ok", check: "chain",
                    message: `Model and chain agree on ${diff.unchanged.length} class(es).`,
                });
            }
        } catch (error) {
            findings.push({
                severity: "error", check: "chain",
                message: (error as Error).message,
            });
        }
    }

    if (model) {
        findings.push(...checkModel(model));
        findings.push(...checkStoredData(model));
    }
    findings.push(...checkEnvironment(
        options.cwd,
        modelPath ? relative(options.cwd, modelPath) : undefined
    ));

    const counts = {
        error: findings.filter(f => f.severity === "error").length,
        warning: findings.filter(f => f.severity === "warning").length,
    };
    const label: Record<Severity, string> = {
        error: "error", warning: "warning", note: "note", ok: "ok",
    };
    const output: string[] = [];
    for (const finding of findings) {
        output.push(`${label[finding.severity]}: [${finding.check}] ${finding.message}`);
        if (finding.detail) {
            for (const line of finding.detail.split("\n")) output.push(`  ${line}`);
        }
    }
    output.push("");
    output.push(counts.error
        ? `${counts.error} error(s), ${counts.warning} warning(s).`
        : `No errors, ${counts.warning} warning(s).`);

    return { code: counts.error ? 1 : 0, findings, output };
};
