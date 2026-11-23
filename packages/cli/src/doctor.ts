import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { diffModel, foldPatchChain } from "@docstack/shared";
import type { AttributeModel, ClassModel, ModelDefinition, Patch } from "@docstack/shared";
import semver from "semver";
import {
    LoadedPatch, MODEL_CANDIDATES, PATCH_CANDIDATES, loadModel, loadPatchFiles,
    otherModelCandidates, otherPatchCandidates, resolvePath,
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
const installed = (from: string, name: string): { dir: string; version: string } | null => {
    const require = createRequire(join(from, "package.json"));
    const read = (path: string): { dir: string; version: string } | null => {
        try {
            const parsed = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
            if (parsed.name !== name || !parsed.version) return null;
            return { dir: dirname(path), version: parsed.version };
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
                const found = read(join(directory, "package.json"));
                if (found) return found;
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
 * A dependency's version as resolved from a directory.
 *
 * @param from - Where to resolve from: a project root, or an installed package's own
 * directory, which is how a second nested copy becomes visible.
 * @param name - Package name.
 * @returns The version, or `null` when it does not resolve from there.
 */
const installedVersion = (from: string, name: string): string | null =>
    installed(from, name)?.version ?? null;

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
        // A patch from an exported array has no file name of its own, so the two checks
        // that compare a name against the version inside it do not apply.
        if (entry.fromArray) {
            if (!semver.valid(entry.version)) {
                findings.push({
                    severity: "error", check: "chain",
                    message: `A patch in '${entry.path}' declares version '${entry.version}', which is not semver.`,
                    detail: "The chain has no order without it: the engine sorts patches by version.",
                });
            }
            continue;
        }
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

    // Either package will do, and testing only the umbrella one was a false positive on a
    // real project: `@types/pouchdb-core` is what carries `declare namespace PouchDB`, and
    // an application that depends on `pouchdb-browser` has that without the umbrella.
    const namespaceFrom = ["@types/pouchdb", "@types/pouchdb-core"]
        .find(name => installedVersion(cwd, name));
    if (namespaceFrom) {
        findings.push({
            severity: "ok", check: "types",
            message: `${namespaceFrom} resolves, so the engine-facing public types are real types.`,
        });
    } else {
        findings.push({
            severity: "warning", check: "types",
            message: "Neither @types/pouchdb nor @types/pouchdb-core resolves from this project.",
            detail: "One of them declares the ambient `PouchDB` namespace, which DocStack's "
                + "engine-facing public types are written in terms of. Without it they resolve "
                + "to `any` and `skipLibCheck` hides why. `@docstack/shared` depends on the "
                + "umbrella package, so a current install has it.",
        });
    }

    // Two copies of zod in one graph is two schema identities: a schema built by one and
    // parsed by the other fails in ways that read as a validation bug. This is why zod is
    // a peer dependency of `@docstack/shared` - and an older shared that declared it as a
    // direct dependency gets a nested copy, which is live in at least one real project.
    for (const name of ["@docstack/shared", "@docstack/client"]) {
        const pkg = installed(cwd, name);
        if (!pkg || !zod || !semver.valid(zod)) continue;
        const theirs = installedVersion(pkg.dir, "zod");
        if (!theirs || theirs === zod || !semver.valid(theirs)) continue;

        // Two majors is a different problem from two minors, so it gets a different
        // severity. Across majors the copies are not interchangeable at all - a schema
        // built by zod 3 cannot be parsed by zod 4's machinery - and that is a package
        // declaring zod as a dependency rather than a peer, which is fixed by upgrading.
        // Within one major the copies behave alike and the cost is a second one in the
        // bundle, which a lockfile or an `overrides` entry dedupes; reporting that as a
        // warning in every workspace monorepo would be noise.
        if (semver.major(theirs) !== semver.major(zod)) {
            findings.push({
                severity: "warning", check: "deps",
                message: `${name} resolves zod ${theirs} while this project resolves ${zod}.`,
                detail: "Across majors the two are not interchangeable, so a schema built by one "
                    + `and parsed by the other fails in ways that read as a validation bug. `
                    + `Upgrade ${name} to a version that takes zod as a PEER dependency, which `
                    + "is what makes an application resolve exactly one copy.",
            });
        } else {
            findings.push({
                severity: "note", check: "deps",
                message: `${name} resolves zod ${theirs} while this project resolves ${zod}.`,
                detail: "Same major, so they behave alike; the cost is two copies in the bundle "
                    + "and two schema identities. Aligning the ranges, or an `overrides` entry, "
                    + "dedupes them.",
            });
        }
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
 * Takes schemas by class name rather than a model, so it can read either source: a
 * declared model when there is one, and the **folded patch chain** when there is not.
 * That second case is the one that matters for an upgrade - an application still on 1.x
 * has hand-written patches and no declared model, and it is exactly the application that
 * needs this list.
 *
 * @param schemas - Class schemas by class name.
 * @returns One note per at-risk attribute type, or none.
 */
const checkStoredData = (schemas: Record<string, ClassModel["schema"]>): Finding[] => {
    const atRisk: string[] = [];
    for (const className of Object.keys(schemas).sort()) {
        const schema = (schemas[className] ?? {}) as Record<string, AttributeModel>;
        for (const [name, attribute] of Object.entries(schema)) {
            if (NEWLY_STRICT[attribute.type]) {
                atRisk.push(`${className}.${name} (${attribute.type}: ${NEWLY_STRICT[attribute.type]})`);
            }
        }
    }
    // The other half of an upgrade: attributes whose declared default the engine now
    // writes. Nothing is rejected, but a document stored before that happened has no
    // value for them, so a read gives `undefined` where the types promise one. That is a
    // backfill - a `postApply` job in the next patch - and it needs the same list.
    const unfilled: string[] = [];
    for (const className of Object.keys(schemas).sort()) {
        const schema = (schemas[className] ?? {}) as Record<string, AttributeModel>;
        for (const [name, attribute] of Object.entries(schema)) {
            const config = (attribute.config ?? {}) as { defaultValue?: unknown; isArray?: boolean };
            if (config.defaultValue === undefined || config.isArray === true) continue;
            unfilled.push(`${className}.${name} (default: ${JSON.stringify(config.defaultValue)})`);
        }
    }

    const findings: Finding[] = [];
    if (atRisk.length) {
        findings.push({
            severity: "note", check: "data",
            message: `${atRisk.length} attribute(s) are stricter in 2.0 than when existing documents were written.`,
            detail: "This process cannot read your data - it lives where the application runs - so "
                + "check these where it does, before upgrading. A document that fails is still "
                + "readable; it is the next WRITE that is refused.\n  - " + atRisk.join("\n  - "),
        });
    }
    if (unfilled.length) {
        findings.push({
            severity: "note", check: "data",
            message: `${unfilled.length} attribute(s) declare a default that older documents do not carry.`,
            detail: "A declared `defaultValue` is written on a document's first write since 2.0, so "
                + "documents stored before that have no value for these and a read returns "
                + "`undefined` where the types promise one. Backfill them in a `postApply` job on "
                + "your next patch, or treat them as optional in code.\n  - " + unfilled.join("\n  - "),
        });
    }
    return findings;
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
    let patchDir: string | null = null;
    let modelError: string | null = null;
    let foldedClasses: Record<string, ClassModel> | null = null;

    // Resolved before anything is reported, because what the absence of one MEANS depends
    // on the other. A project with neither has not adopted the code-defined model, which
    // is not a fault; a declared model with nothing to install it is.
    try {
        modelPath = resolvePath(options.cwd, options.model, MODEL_CANDIDATES, "model");
    } catch (error) {
        modelError = (error as Error).message;
    }
    try {
        patchDir = resolvePath(options.cwd, options.patches, PATCH_CANDIDATES, "patch directory");
    } catch {
        patchDir = null;
    }

    if (modelPath) {
        // `revision` refuses outright here; a report has no reason to stop, so it says
        // what it covered and what it did not.
        const extraModels = options.model ? [] : otherModelCandidates(options.cwd, modelPath);
        const extraChains = options.patches || !patchDir
            ? [] : otherPatchCandidates(options.cwd, patchDir);
        if (extraModels.length || extraChains.length) {
            findings.push({
                severity: "warning", check: "model",
                message: "More than one model or patch chain is present, and this report covers "
                    + `only ${relative(options.cwd, modelPath)}`
                    + `${patchDir ? ` and ${relative(options.cwd, patchDir)}` : ""}.`,
                detail: "Also found "
                    + [...extraModels, ...extraChains]
                        .map(entry => relative(options.cwd, entry)).join(", ")
                    + ". Run this once per pair with --model and --patches. `revision` refuses to "
                    + "guess between them, because a check that covered only one would pass while "
                    + "the other had drifted.",
            });
        }
        try {
            model = loadModel(modelPath);
            findings.push({
                severity: "ok", check: "model",
                message: `${model.classes.length} class(es) declared in ${modelPath}: `
                    + `${model.classes.map(c => c.name).join(", ") || "none"}.`,
            });
        } catch (error) {
            // The file is there and does not export a model: that IS broken.
            findings.push({
                severity: "error", check: "model",
                message: (error as Error).message,
            });
        }
        // Only worth saying when the model actually loaded: piling a missing patch
        // directory on top of a model that does not export one buries the real error.
        if (!patchDir && model) {
            findings.push({
                severity: "error", check: "chain",
                message: "A model is declared but there is no patch directory, so nothing installs it.",
                detail: "Run `docstack revision --autogenerate -m \"the initial model\"`. Looked for "
                    + `${PATCH_CANDIDATES.join(", ")} under '${options.cwd}'.`,
            });
        }
    } else if (patchDir) {
        // Hand-written patches and no declared model: the pre-2.0 way, and still supported.
        // The chain checks below do not need a model, so they run; only the comparison
        // between the two is skipped.
        findings.push({
            severity: "note", check: "model",
            message: "No model is declared in code, so the model-versus-chain check was skipped.",
            detail: `${modelError ?? "No model found."}\n`
                + "The chain itself is still checked. `docstack init` sets up a declared model, "
                + "after which `revision --check` can tell you whether the two agree.",
        });
    } else {
        findings.push({
            severity: "note", check: "model",
            message: "This project does not declare its DocStack model in code.",
            detail: "Nothing is wrong: hand-written patches are still supported. `docstack init` "
                + "scaffolds a declared model, from which the types and the patches are both "
                + "derived. The dependency and TypeScript checks below apply either way.",
        });
    }

    if (patchDir) {
        try {
            const loaded = loadPatchFiles(patchDir);
            const chain = loaded.map(entry => entry.patch);
            findings.push({
                severity: "ok", check: "chain",
                message: `${chain.length} patch(es) in ${patchDir}.`,
            });
            findings.push(...checkChain(loaded));

            const folded = foldPatchChain(chain);
            foldedClasses = folded.classes;
            if (!model) {
                // No declared model to compare against, so the fold is reported for what
                // it is worth on its own: the classes a device ends up with.
                findings.push({
                    severity: "ok", check: "chain",
                    message: `The chain folds to ${Object.keys(folded.classes).length} class(es): `
                        + `${Object.keys(folded.classes).join(", ") || "none"}.`,
                });
            } else {
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
    }
    // From the declared model when there is one, and from the folded chain otherwise, so
    // an application still on 1.x gets the list it needs to plan an upgrade.
    const schemas: Record<string, ClassModel["schema"]> = {};
    if (model) {
        for (const classObj of model.classes) schemas[classObj.name] = classObj.toClassModel().schema ?? {};
    } else if (foldedClasses) {
        for (const [name, classModel] of Object.entries(foldedClasses)) {
            schemas[name] = classModel.schema ?? {};
        }
    }
    findings.push(...checkStoredData(schemas));
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
