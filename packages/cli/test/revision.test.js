import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { revision, nextVersion } from "../lib/revision.js";
import { parseArgs } from "../lib/index.js";
import { renderPatchFile, toSource } from "../lib/emit.js";

/**
 * Where throwaway projects are created.
 *
 * Inside this package rather than the system temp directory, because a generated model
 * imports `@docstack/shared` and module resolution has to be able to walk up and find
 * it, exactly as it would in a real application that installed it.
 */
const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), ".tmp");

test.after(() => rmSync(SCRATCH, { recursive: true, force: true }));

/**
 * A throwaway project with a model in it.
 *
 * The command is exercised against real files, because its whole job is paths,
 * versions and file contents; mocking the filesystem would test the mock.
 */
const project = (modelSource) => {
    mkdirSync(SCRATCH, { recursive: true });
    const root = mkdtempSync(join(SCRATCH, "proj-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "todo-app" }), "utf8");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "model.ts"), modelSource, "utf8");
    return root;
};

const TODO_MODEL = `
import { defineClass, defineModel, a } from "@docstack/shared";

export const Todo = defineClass("Todo", {
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        priority: a.enum(["low", "high"]),
    },
});

export const model = defineModel({ classes: [Todo] });
`;

const TODO_MODEL_WITH_EXTRA = `
import { defineClass, defineModel, a } from "@docstack/shared";

export const Todo = defineClass("Todo", {
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        priority: a.enum(["low", "high"]),
        dueOn: a.date(),
    },
});

export const model = defineModel({ classes: [Todo] });
`;

test("check fails when no patch states the model, and names the command to run", () => {
    const root = project(TODO_MODEL);
    const result = revision({ cwd: root, mode: "check" });
    assert.equal(result.code, 1);
    assert.match(result.output.join("\n"), /disagree on 1 class\(es\): Todo/);
    assert.match(result.output.join("\n"), /--autogenerate/);
});

test("autogenerate writes the first patch and its index", () => {
    const root = project(TODO_MODEL);
    const result = revision({ cwd: root, mode: "autogenerate", message: "add the Todo class" });

    assert.equal(result.code, 0);
    const dir = join(root, "src", "patches");
    assert.deepEqual(readdirSync(dir).sort(), ["0.1.0.ts", "index.ts"]);

    const patch = readFileSync(join(dir, "0.1.0.ts"), "utf8");
    // The target comes from the project's own package name, and the version starts the
    // consumer chain rather than guessing at the app's release number.
    assert.match(patch, /target: "todo-app"/);
    assert.match(patch, /version: "0\.1\.0"/);
    assert.match(patch, /changelog: "add the Todo class"/);
    assert.match(patch, /_id: "todo-app-0\.1\.0"/);
    // A class the chain has never seen arrives whole, so no merge marker.
    assert.doesNotMatch(patch, /_rev: "auto"/);
    assert.match(patch, /maxLength: 200/);
    // The job hooks are offered as commented stubs, not silently omitted.
    assert.match(patch, /\/\/ patch_0_1_0\.preApply/);

    const index = readFileSync(join(dir, "index.ts"), "utf8");
    assert.match(index, /import patch_0_1_0 from "\.\/0\.1\.0\.js";/);
    assert.match(index, /export const patches: Patch\[\] = \[\n    patch_0_1_0,\n\];/);
});

test("check passes once the generated patch states the model", () => {
    const root = project(TODO_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "add the Todo class" });
    const result = revision({ cwd: root, mode: "check" });
    assert.equal(result.code, 0);
    assert.match(result.output.join("\n"), /agree on 1 class\(es\): Todo/);
});

test("a second revision emits only the delta, as a merge", () => {
    const root = project(TODO_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "add the Todo class" });
    writeFileSync(join(root, "src", "model.ts"), TODO_MODEL_WITH_EXTRA, "utf8");

    const result = revision({ cwd: root, mode: "autogenerate", message: "add a due date" });
    assert.equal(result.code, 0);

    const dir = join(root, "src", "patches");
    assert.deepEqual(readdirSync(dir).sort(), ["0.1.0.ts", "0.2.0.ts", "index.ts"]);
    const patch = readFileSync(join(dir, "0.2.0.ts"), "utf8");
    // A delta over a class the chain already produces must carry the merge marker, or
    // the engine would treat it as a fresh insert and conflict.
    assert.match(patch, /_rev: "auto"/);
    assert.match(patch, /dueOn/);
    // Only the new attribute: the untouched ones stay where they already are.
    assert.doesNotMatch(patch, /maxLength: 200/);

    const index = readFileSync(join(dir, "index.ts"), "utf8");
    assert.match(index, /patch_0_1_0,\n    patch_0_2_0,/);
    assert.equal(revision({ cwd: root, mode: "check" }).code, 0);
});

test("generating twice from the same model is a no-op, not an empty patch", () => {
    const root = project(TODO_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "add the Todo class" });
    const again = revision({ cwd: root, mode: "autogenerate", message: "nothing changed" });
    assert.equal(again.code, 0);
    assert.equal(again.written, undefined);
    assert.deepEqual(readdirSync(join(root, "src", "patches")).sort(), ["0.1.0.ts", "index.ts"]);
});

test("a dropped attribute emits null, and a dropped class is only reported", () => {
    const root = project(TODO_MODEL_WITH_EXTRA);
    revision({ cwd: root, mode: "autogenerate", message: "initial" });
    writeFileSync(join(root, "src", "model.ts"), TODO_MODEL, "utf8");

    const result = revision({ cwd: root, mode: "autogenerate", message: "drop the due date" });
    const patch = readFileSync(result.written, "utf8");
    assert.match(patch, /dueOn: null/);

    // A class the model stops declaring is a warning and a failed check, never an
    // automatic removal: class removal has no defined semantics yet.
    writeFileSync(join(root, "src", "model.ts"), `
import { defineModel } from "@docstack/shared";
export const model = defineModel({ classes: [] });
`, "utf8");
    const removal = revision({ cwd: root, mode: "check" });
    assert.equal(removal.code, 1);
    assert.match(removal.output.join("\n"), /warning: Class 'Todo'/);
    assert.match(removal.output.join("\n"), /will not write for you/);
});

test("the model must be findable, and say so when it is not", () => {
    mkdirSync(SCRATCH, { recursive: true });
    const root = mkdtempSync(join(SCRATCH, "empty-"));
    assert.throws(() => revision({ cwd: root, mode: "check" }), /No model found\. Looked for/);
});

test("a module that forgets defineModel is told what it exported", () => {
    const root = project(`export const notAModel = 42;`);
    assert.throws(() => revision({ cwd: root, mode: "check" }), /exports no model.*notAModel/s);
});

test("nextVersion bumps, starts a chain, and refuses to go backwards", () => {
    assert.equal(nextVersion([]), "0.1.0");
    assert.equal(nextVersion(["0.9.0", "0.10.0"]), "0.11.0");
    assert.equal(nextVersion(["1.2.3"], undefined, "patch"), "1.2.4");
    assert.equal(nextVersion(["1.2.3"], undefined, "major"), "2.0.0");
    assert.equal(nextVersion(["1.2.3"], "2.0.0"), "2.0.0");
    assert.throws(() => nextVersion(["1.2.3"], "1.0.0"), /not ahead of '1\.2\.3'/);
    assert.throws(() => nextVersion([], "oops"), /not valid semver/);
});

test("argument parsing refuses what it does not understand", () => {
    assert.deepEqual(parseArgs(["revision", "--check"]), {
        command: "revision", options: { mode: "check" },
    });
    assert.equal(parseArgs(["revision", "--autogenerate", "-m", "hi"]).options.message, "hi");
    assert.equal(parseArgs(["revision", "--bump", "major"]).options.bump, "major");
    // A silently dropped option would generate against the wrong baseline.
    assert.throws(() => parseArgs(["revision", "--patchez", "x"]), /Unknown option/);
    assert.throws(() => parseArgs(["revision", "--bump", "sideways"]), /must be major, minor or patch/);
    assert.throws(() => parseArgs(["revision", "-m"]), /needs a value/);
});

test("the source printer is deterministic and readable", () => {
    assert.equal(toSource({ b: 1, a: 2 }), "{\n    b: 1,\n    a: 2,\n}");
    assert.equal(toSource({ "~class": "class" }), "{\n    \"~class\": \"class\",\n}");
    assert.equal(toSource([]), "[]");
    assert.equal(toSource({ nested: { deep: null } }), "{\n    nested: {\n        deep: null,\n    },\n}");
    const rendered = renderPatchFile({ version: "1.0.0", target: "t", changelog: "c", docs: [] });
    assert.equal(rendered, renderPatchFile({ version: "1.0.0", target: "t", changelog: "c", docs: [] }));
});
