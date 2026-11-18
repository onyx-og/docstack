import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { DEFAULT_TYPES_IMPORT } from "./emit.js";
import { revision } from "./revision.js";

/** What kind of project `init` found, which decides the wiring it prints. */
export type Target = "react" | "node" | "unknown";

/** What `init` was asked to do. */
export type InitOptions = {
    /** Project root. */
    cwd: string;
    /** `--model`, where to write the model. Default `src/model.ts`, or `model.ts`. */
    model?: string;
    /** `--patches`, the patch directory. Default beside the model. */
    patches?: string;
    /** `--target`, the consumer patch target. Defaults to the project's package name. */
    target?: string;
    /**
     * `--types-import`, where the starter model and the generated patch import from.
     * Defaults to `@docstack/client/model`; a project that depends on a different
     * DocStack package points it at that one.
     */
    typesImport?: string;
};

/** What `init` did. */
export type InitResult = {
    /** Process exit code. */
    code: number;
    /** Lines to print. */
    output: string[];
    /** Files created or changed, relative to the project root. */
    changed: string[];
};

/** Markers around the section `init` maintains, so a re-run replaces it in place. */
const BEGIN = "<!-- docstack:begin -->";
const END = "<!-- docstack:end -->";

/**
 * The starter model, written only when there is none.
 *
 * @param from - Where to import the builders from; see {@link InitOptions.typesImport}.
 * @returns The module source.
 */
const starterModel = (from: string) => `import { a, defineClass, defineModel, type InferDoc, type InferInput } from "${from}";

/**
 * The first class of your model. Rename it, or delete it once you have your own.
 *
 * One declaration gives you three things: the TypeScript types below, the class document
 * the engine stores, and the input to \`docstack revision\`, which writes the patch that
 * installs it.
 */
export const Note = defineClass("Note", {
    description: "A note",
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        // A declared default is written on a document's first write, so a read is
        // guaranteed a boolean even when a write omits it.
        archived: a.boolean({ defaultValue: false }),
        // ISO-8601, date-only. A \`Date\` object is not the stored shape: a document body
        // round-trips through JSON.
        createdOn: a.date({ format: "date" }),
    },
});

/** A \`Note\` as stored: what a read gives you. */
export type NoteDoc = InferDoc<typeof Note>;
/** A \`Note\` as written: required only where the engine will not fill it. */
export type NoteInput = InferInput<typeof Note>;

/**
 * The model.
 *
 * \`docstack revision\` reads this export to decide what a patch has to carry, so keep it
 * exported under this name.
 */
export const model = defineModel({ classes: [Note] });
`;


/**
 * The section `init` writes into the project's agent instructions.
 *
 * Short on purpose: an agent reading a long section skips it. It says where the model is,
 * that patches are generated, and the one command CI runs (`proposal.md` §12.4).
 *
 * @param modelPath - The model's path, relative to the project root.
 * @param patchPath - The patch directory, relative to the project root.
 * @returns The section, between its markers.
 */
const agentSection = (modelPath: string, patchPath: string): string => `${BEGIN}
## DocStack

The data model is **declared in code** at \`${modelPath}\`. It is the single source of
truth: the TypeScript types and the stored schema are both derived from it, so they cannot
disagree.

- **Change the model by editing that file**, then run
  \`npx docstack revision --autogenerate -m "<what changed>"\`.
- **Patches in \`${patchPath}\` are generated. Never hand-edit the documents in them.** A
  data migration goes in the \`preApply\` / \`postApply\` hook the generated file stubs out.
- **\`npx docstack revision --check\` must pass**, and CI runs it. It fails when the model
  and the patch chain disagree, which is the mistake that ships an application whose code
  expects a schema no device installed.
- \`npx docstack doctor\` reports the rest: chain health, model shapes that do not mean
  what they read like, and dependency or TypeScript settings that silently weaken the types.
- Do not create classes at runtime (\`Class.create\`, \`addAttribute\`) in code that also
  uses the declared model. Runtime edits are supported and stay untyped; mixing the two on
  one class makes the types describe something the database may not hold.
${END}`;

/**
 * Detects what the project is, from its dependencies.
 *
 * Deliberately shallow: the only thing the answer changes is which wiring snippet gets
 * printed. A wrong guess costs the reader one glance, so there is no need to probe deeper
 * than the manifest.
 *
 * @param manifest - The parsed `package.json`.
 * @returns The target kind.
 */
const detectTarget = (manifest: Record<string, any>): Target => {
    const deps = { ...manifest.dependencies, ...manifest.devDependencies } as Record<string, string>;
    if (deps.react || deps["react-dom"]) return "react";
    if (deps.express || deps.fastify || deps["@docstack/server"] || manifest.type === "module") return "node";
    return "unknown";
};

/** The install line for a target, which `init` prints rather than runs. */
const installCommand = (target: Target): string =>
    target === "react"
        ? "npm install @docstack/client @docstack/react && npm install -D @docstack/cli"
        : "npm install @docstack/client && npm install -D @docstack/cli";

/**
 * The wiring to add, as a snippet to read rather than code written into the project.
 *
 * `init` does not edit an application's own source. Where a provider belongs is a
 * question about that application - which component tree, which stack names, which
 * credentials - and a scaffolder guessing produces a diff the author has to undo.
 *
 * @param target - What the project is.
 * @param patchPath - The patch directory, relative to the project root.
 * @returns The snippet.
 */
const wiringSnippet = (target: Target, patchPath: string): string => {
    const importPath = `./${patchPath.replace(/^src\//, "")}/index.js`;
    if (target === "react") {
        return `import { StackProvider } from "@docstack/react";
import { patches } from "${importPath}";

<StackProvider config={[{ name: "my-app", patches }]}>
    <App />
</StackProvider>`;
    }
    return `import { DocStack } from "@docstack/client";
import { patches } from "${importPath}";

const docstack = new DocStack({ name: "my-app", patches });`;
};

/**
 * Adds or replaces the DocStack section in a file of agent instructions.
 *
 * Idempotent by construction: the section lives between markers, so a second run replaces
 * what the first wrote instead of appending a second copy.
 *
 * @param path - Absolute path to the file.
 * @param section - The section, markers included.
 * @returns Whether the file changed.
 */
const writeAgentSection = (path: string, section: string): boolean => {
    const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
    let next: string;
    if (existing.includes(BEGIN) && existing.includes(END)) {
        const before = existing.slice(0, existing.indexOf(BEGIN));
        const after = existing.slice(existing.indexOf(END) + END.length);
        next = `${before}${section}${after}`;
    } else {
        next = existing
            ? `${existing.replace(/\s*$/, "")}\n\n${section}\n`
            : `${section}\n`;
    }
    if (next === existing) return false;
    writeFileSync(path, next, "utf8");
    return true;
};

/**
 * Scaffolds the model-first workflow into an existing project.
 *
 * Pattern: Command. What it will not do, on purpose: install packages, or edit the
 * application's own source. Installing means choosing versions, which belongs to the
 * registry and the author's lockfile; editing source means guessing where a provider
 * goes. Both are printed instead, so the author runs one command and pastes one snippet
 * and nothing has to be undone.
 *
 * @param options - See {@link InitOptions}.
 * @returns What it did; see {@link InitResult}.
 * @throws If there is no `package.json` - without one there is no project to set up, and
 * the patch target has nothing to default to.
 */
export const init = (options: InitOptions): InitResult => {
    const output: string[] = [];
    const changed: string[] = [];

    const manifestPath = join(options.cwd, "package.json");
    if (!existsSync(manifestPath)) {
        throw new Error(
            `No package.json in '${options.cwd}'. Run this inside the project that will use `
            + "DocStack, or pass a different working directory."
        );
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any>;
    const target = detectTarget(manifest);
    const hasSrc = existsSync(join(options.cwd, "src"));

    const modelRelative = options.model ?? (hasSrc ? "src/model.ts" : "model.ts");
    const patchRelative = options.patches ?? (hasSrc ? "src/patches" : "patches");
    const modelPath = join(options.cwd, modelRelative);
    const patchPath = join(options.cwd, patchRelative);

    // Only ever created, never overwritten: a model is the one file in this scaffold that
    // carries decisions, and a second `init` must not eat them.
    let wroteModel = false;
    if (existsSync(modelPath)) {
        output.push(`Kept ${modelRelative}, which already exists.`);
    } else {
        mkdirSync(dirname(modelPath), { recursive: true });
        writeFileSync(modelPath, starterModel(options.typesImport ?? DEFAULT_TYPES_IMPORT), "utf8");
        changed.push(modelRelative);
        wroteModel = true;
        output.push(`Wrote ${modelRelative} with a starter class.`);
    }

    mkdirSync(patchPath, { recursive: true });

    // The first patch is generated only for a model this run created. For a model that
    // was already there, generating would decide on the author's behalf what their next
    // revision contains - which is what `revision` is for, run deliberately.
    if (wroteModel) {
        const generated = revision({
            cwd: options.cwd, mode: "autogenerate", message: "the initial model",
            model: modelRelative, patches: patchRelative, target: options.target,
            version: "0.1.0", typesImport: options.typesImport,
        });
        output.push(...generated.output);
        if (generated.written) changed.push(relative(options.cwd, generated.written));
        changed.push(join(patchRelative, "index.ts"));
    } else {
        output.push(
            `Left ${patchRelative} alone. Run \`npx docstack revision --check\` to see whether `
            + "it matches your model."
        );
    }

    const scripts = (manifest.scripts ?? {}) as Record<string, string>;
    const wanted: Record<string, string> = {
        revision: "docstack revision --autogenerate",
        "revision:check": "docstack revision --check",
        "docstack:doctor": "docstack doctor",
    };
    const added: string[] = [];
    for (const [name, command] of Object.entries(wanted)) {
        if (!scripts[name]) {
            scripts[name] = command;
            added.push(name);
        }
    }
    if (added.length) {
        manifest.scripts = scripts;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        changed.push("package.json");
        output.push(`Added npm script(s): ${added.join(", ")}.`);
    }

    const section = agentSection(modelRelative, patchRelative);
    const agentFiles = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]
        .filter(name => name === "AGENTS.md" || existsSync(join(options.cwd, name)));
    for (const name of agentFiles) {
        if (writeAgentSection(join(options.cwd, name), section)) {
            changed.push(name);
            output.push(`Updated the DocStack section in ${name}.`);
        }
    }

    output.push("");
    output.push(`Detected a ${target === "unknown" ? "plain Node" : target} project. Two things left, `
        + "which this command does not do for you:");
    output.push("");
    output.push(`  1. Install the packages:  ${installCommand(target)}`);
    output.push("");
    output.push("  2. Pass the chain to the stack:");
    output.push("");
    for (const line of wiringSnippet(target, patchRelative).split("\n")) {
        output.push(`     ${line}`);
    }
    output.push("");
    output.push("Versions belong to your lockfile and the provider belongs in your own component "
        + "tree, so neither is written for you.");

    return { code: 0, output, changed };
};
