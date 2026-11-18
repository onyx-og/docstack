import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { doctor } from "../lib/doctor.js";

/** Fixtures created outside the repository, cleaned up with the rest. */
const isolatedRoots = [];

/** Throwaway projects, inside this package so a model's imports resolve by walking up. */
const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), ".tmp-doctor");

test.after(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
    for (const root of isolatedRoots) rmSync(root, { recursive: true, force: true });
});

/**
 * A throwaway project.
 *
 * @param files - Files to create, keyed by relative path.
 * @param manifest - What its package.json should say.
 * @returns The project root.
 */
const project = (files, manifest = { name: "probe-app" }) => {
    mkdirSync(SCRATCH, { recursive: true });
    const root = mkdtempSync(join(SCRATCH, "proj-"));
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest), "utf8");
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content, "utf8");
    }
    return root;
};

/**
 * The findings of one check, as `severity:message` strings.
 *
 * @param result - What `doctor` returned.
 * @param check - The check's name.
 * @returns One string per finding.
 */
const of = (result, check) => result.findings
    .filter(finding => finding.check === check)
    .map(finding => `${finding.severity}:${finding.message}`);

const HEALTHY_MODEL = `import { defineClass, defineModel, a } from "@docstack/shared";
export const Note = defineClass("Note", {
    attributes: {
        title: a.string({ mandatory: true }),
        archived: a.boolean({ defaultValue: false }),
    },
});
export const model = defineModel({ classes: [Note] });
`;

const HEALTHY_PATCH = `const patch = {
    _id: "probe-app-0.1.0", "~class": "patch", target: "probe-app", version: "0.1.0",
    docs: [{ _id: "Note", "~class": "class", name: "Note", active: true, triggers: [], schema: {
        title: { name: "title", type: "string", config: { mandatory: true } },
        archived: { name: "archived", type: "boolean", config: { defaultValue: false } },
    } }],
};
export default patch;
`;

test("a healthy project reports no errors, and says what it looked at", () => {
    const root = project({ "src/model.ts": HEALTHY_MODEL, "src/patches/0.1.0.ts": HEALTHY_PATCH });
    const result = doctor({ cwd: root });

    assert.equal(result.code, 0);
    assert.equal(result.findings.filter(f => f.severity === "error").length, 0);
    // A doctor that stays silent about what passed leaves you wondering whether it looked.
    assert.ok(of(result, "model").some(line => line.startsWith("ok:") && line.includes("Note")));
    assert.ok(of(result, "chain").some(line => line.includes("agree on 1 class")));
    assert.ok(of(result, "deps").some(line => line.startsWith("ok:") && line.includes("zod")));
});

test("names the classes when the model and the chain disagree", () => {
    const ahead = HEALTHY_MODEL.replace(
        "archived: a.boolean({ defaultValue: false }),",
        "archived: a.boolean({ defaultValue: false }),\n        pinned: a.boolean({}),"
    );
    const root = project({ "src/model.ts": ahead, "src/patches/0.1.0.ts": HEALTHY_PATCH });
    const result = doctor({ cwd: root });

    assert.equal(result.code, 1);
    const chain = of(result, "chain").join("\n");
    assert.match(chain, /error:The model and the patch chain disagree on Note/);
    assert.match(result.output.join("\n"), /revision --autogenerate/);
});

test("catches a patch whose file name and declared version differ", () => {
    const misnamed = HEALTHY_PATCH.replace('version: "0.1.0"', 'version: "0.9.0"');
    const root = project({ "src/model.ts": HEALTHY_MODEL, "src/patches/0.1.0.ts": misnamed });
    const result = doctor({ cwd: root });

    assert.equal(result.code, 1);
    assert.match(of(result, "chain").join("\n"), /declares version '0\.9\.0'/);
});

test("catches a restated class with no merge marker, and a changing target", () => {
    const second = `const patch = {
    _id: "other-0.2.0", "~class": "patch", target: "other", version: "0.2.0",
    docs: [{ _id: "Note", "~class": "class", name: "Note", active: true, schema: {
        title: { name: "title", type: "string", config: { mandatory: true } },
    } }],
};
export default patch;
`;
    const root = project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        "src/patches/0.2.0.ts": second,
    });
    const result = doctor({ cwd: root });
    const chain = of(result, "chain").join("\n");

    // Without `_rev: "auto"` the second document replaces the first rather than merging,
    // which is ADR-0037's lost-attributes failure.
    assert.match(chain, /error:Patch 0\.2\.0 restates class 'Note' without/);
    assert.match(chain, /warning:The chain carries 2 different targets/);
    assert.equal(result.code, 1);
});

test("catches model shapes that do not mean what they read like", () => {
    const model = `import { defineClass, defineModel, a } from "@docstack/shared";
export const Note = defineClass("Note", {
    attributes: {
        rank: a.integer({ defaultValue: 1.5 }),
        tags: a.string({ isArray: true, defaultValue: "none" }),
        owner: a.foreignKey({ targetClass: "Persona" }),
        secret: a.string({ encrypted: true }),
    },
});
export const model = defineModel({ classes: [Note] });
`;
    const root = project({ "src/model.ts": model, "src/patches/0.1.0.ts": HEALTHY_PATCH });
    const findings = of(doctor({ cwd: root }), "model").join("\n");

    // An integer default that is not an integer cannot be written at all since 2.0.
    assert.match(findings, /error:Note\.rank is an integer whose defaultValue \(1\.5\) is not one/);
    // An array's default is a MEMBER default, so nothing is filled.
    assert.match(findings, /warning:Note\.tags is an array with a defaultValue, which fills nothing/);
    // A dangling target is legal but usually a typo.
    assert.match(findings, /warning:Note\.owner points at 'Persona'/);
    // Encrypted attributes change what a locked stack may do.
    assert.match(findings, /note:Note\.secret is encrypted/);
});

test("lists the attributes whose stored values 2.0 would newly reject", () => {
    const model = `import { defineClass, defineModel, a } from "@docstack/shared";
export const Note = defineClass("Note", {
    attributes: {
        rank: a.integer({}),
        due: a.date({ format: "date" }),
        title: a.string({}),
    },
});
export const model = defineModel({ classes: [Note] });
`;
    const root = project({ "src/model.ts": model, "src/patches/0.1.0.ts": HEALTHY_PATCH });
    const data = doctor({ cwd: root }).findings.filter(f => f.check === "data");

    assert.equal(data.length, 1);
    // Named per attribute, with the reason, because the scan itself has to run where the
    // data is - this process cannot open a browser's IndexedDB.
    assert.match(data[0].detail, /Note\.rank \(integer/);
    assert.match(data[0].detail, /Note\.due \(date/);
    assert.doesNotMatch(data[0].detail, /Note\.title/);
    assert.match(data[0].detail, /cannot read your data/);
    // It asks for attention without failing: nothing here is known to be wrong.
    assert.equal(data[0].severity, "note");
});

test("finds a second copy of zod, and grades it by whether the majors differ", () => {
    /**
     * A project whose installed `@docstack/shared` carries its own zod, which is what an
     * old shared - one declaring zod as a dependency rather than a peer - gets. Built as
     * real directories because that is what Node's resolution reads; the check asks how
     * the dependency itself resolves zod, not what any manifest claims.
     */
    const withNestedZod = (appZod, nestedZod) => project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        "node_modules/zod/package.json": JSON.stringify({ name: "zod", version: appZod }),
        "node_modules/@docstack/shared/package.json":
            JSON.stringify({ name: "@docstack/shared", version: "0.1.0" }),
        "node_modules/@docstack/shared/node_modules/zod/package.json":
            JSON.stringify({ name: "zod", version: nestedZod }),
    });

    // Across majors the copies are not interchangeable at all.
    const acrossMajors = doctor({ cwd: withNestedZod("4.4.3", "3.25.76") });
    const major = acrossMajors.findings.find(f => f.check === "deps" && f.severity === "warning");
    assert.match(major.message, /@docstack\/shared resolves zod 3\.25\.76 while this project resolves 4\.4\.3/);
    assert.match(major.detail, /PEER dependency/);

    // Within one major they behave alike, so this is a note: reporting it as a warning in
    // every workspace monorepo would be noise.
    const sameMajor = doctor({ cwd: withNestedZod("4.6.7", "4.4.3") });
    const minor = sameMajor.findings.find(f => f.check === "deps" && f.severity === "note");
    assert.match(minor.message, /resolves zod 4\.4\.3 while this project resolves 4\.6\.7/);
    assert.equal(sameMajor.findings.filter(f => f.severity === "warning").length, 0);

    // One copy is the healthy case and says nothing at all.
    const single = project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        "node_modules/zod/package.json": JSON.stringify({ name: "zod", version: "4.4.3" }),
        "node_modules/@docstack/shared/package.json":
            JSON.stringify({ name: "@docstack/shared", version: "0.1.0" }),
    });
    assert.ok(!doctor({ cwd: single }).findings.some(f => f.message.includes("while this project resolves")));
});

test("the ambient PouchDB namespace counts from either package that declares it", () => {
    /**
     * Outside the repository, unlike every other fixture here.
     *
     * Node resolution walks up, so a project created inside this monorepo always finds
     * the root's own `@types/pouchdb` and the absence of one cannot be simulated. The
     * trade is that `@docstack/shared` does not resolve out here either, so these
     * projects declare no model - which does not matter, because the only findings under
     * test are the ones about types.
     */
    const isolated = (files) => {
        const root = mkdtempSync(join(tmpdir(), "docstack-doctor-"));
        writeFileSync(join(root, "package.json"), JSON.stringify({ name: "iso" }), "utf8");
        for (const [path, content] of Object.entries(files)) {
            mkdirSync(dirname(join(root, path)), { recursive: true });
            writeFileSync(join(root, path), content, "utf8");
        }
        isolatedRoots.push(root);
        return root;
    };

    // `@types/pouchdb-core` is what carries `declare namespace PouchDB`. Testing only for
    // the umbrella package was a false positive on a real project that depends on
    // pouchdb-browser and never installed the umbrella.
    const viaCore = doctor({ cwd: isolated({
        "node_modules/@types/pouchdb-core/package.json":
            JSON.stringify({ name: "@types/pouchdb-core", version: "7.0.0" }),
    }) });
    assert.ok(of(viaCore, "types").some(line => line.startsWith("ok:") && line.includes("pouchdb-core")));

    const viaUmbrella = doctor({ cwd: isolated({
        "node_modules/@types/pouchdb/package.json":
            JSON.stringify({ name: "@types/pouchdb", version: "6.4.2" }),
    }) });
    assert.ok(of(viaUmbrella, "types").some(line => line.startsWith("ok:")));

    const viaNeither = doctor({ cwd: isolated({}) });
    assert.ok(of(viaNeither, "types").some(line => line.startsWith("warning:")
        && line.includes("Neither @types/pouchdb nor @types/pouchdb-core")));
});

test("warns about a tsconfig that restricts types, which silently weakens them", () => {
    const root = project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        "tsconfig.json": '{ "compilerOptions": { "types": ["vite/client"] } }',
    });
    const types = of(doctor({ cwd: root }), "types").join("\n");

    assert.match(types, /warning:tsconfig\.json sets compilerOptions\.types without "pouchdb"/);
    // A warning, not an error: it weakens types rather than breaking anything at runtime.
    assert.equal(doctor({ cwd: root }).code, 0);
});

test("ignores a tsconfig that does not compile the model, and says so when it cannot read one", () => {
    const root = project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        // What a Vite project has: one config for the app, one for the build tooling.
        // Only the first ever sees a DocStack type, so only the first is worth a warning.
        "tsconfig.app.json": '{ "compilerOptions": { "types": ["vite/client"] }, "include": ["src"] }',
        "tsconfig.node.json": '{ "compilerOptions": { "types": ["node"] }, "include": ["vite.config.ts"] }',
        // Block comments are legal here and `JSON.parse` refuses them; the Vite templates
        // use them, so stripping only `//` skipped the one file that matters.
        "tsconfig.json": '{ /* bundler */ "compilerOptions": { "types": ["vite/client"] } }',
        // And one that no amount of comment-stripping will fix.
        "tsconfig.broken.json": '{ "compilerOptions": { "types": ["x"], } ',
    });
    const types = of(doctor({ cwd: root }), "types");

    assert.ok(types.some(line => line.includes("tsconfig.app.json")));
    assert.ok(types.some(line => line.includes("tsconfig.json")), "block comments must not hide it");
    assert.ok(!types.some(line => line.includes("tsconfig.node.json")), "build tooling is not the app");
    // A config it cannot parse is a config it cannot vouch for; silence would read as approval.
    assert.ok(types.some(line => line.startsWith("note:") && line.includes("tsconfig.broken.json")));
});

test("what a missing model means depends on whether there are patches", () => {
    // Neither: the project has not adopted the code-defined model. Nothing is wrong, and
    // a diagnostic that exits 1 for a feature you have not adopted is crying wolf - it
    // would be useless as a gate in any repository that mixes the two.
    const neither = doctor({ cwd: project({}) });
    assert.equal(neither.code, 0);
    assert.match(of(neither, "model").join("\n"), /^note:This project does not declare/);
    assert.match(neither.findings.find(f => f.check === "model").detail, /docstack init/);

    // Patches and no model: the pre-2.0 way, still supported. The chain is checked on its
    // own - which is where a hand-written chain's mistakes live - and only the comparison
    // against a model is skipped.
    const handWritten = doctor({ cwd: project({ "src/patches/0.1.0.ts": HEALTHY_PATCH }) });
    assert.equal(handWritten.code, 0);
    assert.match(of(handWritten, "model").join("\n"), /^note:No model is declared in code/);
    assert.match(of(handWritten, "chain").join("\n"), /folds to 1 class\(es\): Note/);

    // A model with nothing to install it IS broken: the code expects a schema no device
    // will ever have.
    const orphan = doctor({ cwd: project({ "src/model.ts": HEALTHY_MODEL }) });
    assert.equal(orphan.code, 1);
    const chain = orphan.findings.find(f => f.check === "chain" && f.severity === "error");
    assert.match(chain.message, /no patch directory, so nothing installs it/);
    assert.match(chain.detail, /revision --autogenerate/);
});

test("reports a partial view rather than refusing, when a project has two pairs", () => {
    const root = project({
        "src/model.ts": HEALTHY_MODEL,
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
        // A second stack's pair, which the conventions do not pick.
        "src/model.workspace.ts": HEALTHY_MODEL,
        "src/patches-ws/0.1.0.ts": HEALTHY_PATCH,
    });
    const result = doctor({ cwd: root });

    // `revision` refuses here; a report has no reason to stop, so it says what it covered.
    const partial = result.findings.find(f => f.severity === "warning" && f.check === "model");
    assert.match(partial.message, /only src\/model\.ts and src\/patches/);
    assert.match(partial.detail, /src\/model\.workspace\.ts/);
    assert.match(partial.detail, /src\/patches-ws/);
    assert.match(partial.detail, /once per pair/);

    // And the rest of the report is still there, for the pair it did look at.
    assert.ok(of(result, "chain").some(line => line.includes("agree on 1 class")));
    assert.equal(result.code, 0);

    // Naming the pair is not ambiguous, so nothing is reported.
    const explicit = doctor({ cwd: root, model: "src/model.ts", patches: "src/patches" });
    assert.ok(!explicit.findings.some(f => f.message.includes("only src/model.ts")));
});

test("a model file that exports no model is an error, not an absence", () => {
    const root = project({
        "src/model.ts": "export const notTheModel = 1;\n",
        "src/patches/0.1.0.ts": HEALTHY_PATCH,
    });
    const result = doctor({ cwd: root });

    assert.equal(result.code, 1);
    // It says what the file DID export, so the author can see whether they forgot
    // `defineModel` or exported it under another name.
    assert.match(of(result, "model").join("\n"), /^error:.*exports no model/);
    assert.match(result.findings.find(f => f.check === "model").message, /notTheModel/);
});
