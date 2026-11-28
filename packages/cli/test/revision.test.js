import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

    // The Patch type comes from the entry an application actually depends on.
    // `@docstack/shared` is internal, so importing it would not compile in a project
    // that installed the client and this tool.
    assert.match(patch, /import type \{ Patch \} from "@docstack\/client\/model";/);

    const index = readFileSync(join(dir, "index.ts"), "utf8");
    assert.match(index, /import type \{ Patch \} from "@docstack\/client\/model";/);
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

test("--types-import redirects the generated imports", () => {
    const root = project(TODO_MODEL);
    revision({
        cwd: root, mode: "autogenerate", message: "add the Todo class",
        typesImport: "@acme/db",
    });
    const dir = join(root, "src", "patches");
    assert.match(readFileSync(join(dir, "0.1.0.ts"), "utf8"), /from "@acme\/db";/);
    assert.match(readFileSync(join(dir, "index.ts"), "utf8"), /from "@acme\/db";/);
});

test("a hand-written patch joins the chain and does not provoke a revision", () => {
    const root = project(TODO_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "add the Todo class" });
    const dir = join(root, "src", "patches");

    // A patch that seeds content rather than schema: the common reason to write one by
    // hand. It must fold into the chain without the diff noticing it, or every app that
    // seeds data would be told its model and chain disagree.
    writeFileSync(join(dir, "0.2.0.ts"), [
        'const patch = {',
        '    _id: "todo-app-0.2.0",',
        '    "~class": "patch",',
        '    target: "todo-app",',
        '    version: "0.2.0",',
        '    changelog: "seed",',
        '    docs: [{ _id: "task-1", "~class": "Todo", active: true, title: "Ship" }],',
        '};',
        'export default patch;',
    ].join("\n"), "utf8");

    const result = revision({ cwd: root, mode: "check" });
    assert.equal(result.code, 0);
    assert.match(result.output.join("\n"), /agree on 1 class\(es\): Todo/);

    // And the next generated index picks it up, in version order.
    writeFileSync(join(root, "src", "model.ts"), TODO_MODEL.replace(
        "title: a.string({ mandatory: true, maxLength: 200 }),",
        "title: a.string({ mandatory: true, maxLength: 200 }),\n        done: a.boolean({}),"
    ), "utf8");
    revision({ cwd: root, mode: "autogenerate", message: "add done" });
    const index = readFileSync(join(dir, "index.ts"), "utf8");
    assert.match(index, /patch_0_1_0,\n    patch_0_2_0,\n    patch_0_3_0,/);
});

test("the installed bin actually runs, reached through a symlink", () => {
    // Everything else here calls `revision()` directly, which cannot see whether the
    // command line in front of it works. `npm` installs a bin as a symlink, so
    // `process.argv[1]` is the link and `import.meta.url` is the resolved target; a guard
    // comparing the two as URLs decided this file was not the entry point and the tool
    // exited 0 having done nothing. A silent pass is worse than a failure, and only
    // invoking it the way an installed copy is invoked can tell the difference.
    const root = project(TODO_MODEL);
    const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "index.js");
    const link = join(root, "docstack-bin.mjs");
    symlinkSync(cli, link);

    const atLink = (args) => {
        try {
            return {
                code: 0,
                out: execFileSync(process.execPath, [link, ...args], {
                    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
                }),
            };
        } catch (error) {
            return { code: error.status, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
        }
    };

    // Nothing states the model yet, so a check must fail - and must say so.
    const missing = atLink(["revision", "--check"]);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /disagree on 1 class\(es\): Todo/);

    // And the generate/check cycle has to work through the same entry point.
    const generated = atLink(["revision", "--autogenerate", "-m", "the Todo class"]);
    assert.equal(generated.code, 0);
    assert.match(generated.out, /Wrote /);

    const agreeing = atLink(["revision", "--check"]);
    assert.equal(agreeing.code, 0);
    assert.match(agreeing.out, /agree on 1 class\(es\): Todo/);

    // Misuse still reports itself rather than passing quietly.
    assert.equal(atLink(["revision"]).code, 2);
});

test("refuses to guess between two models or two chains", () => {
    const root = project(TODO_MODEL);
    // A second stack's model and chain, the shape a project with one database per
    // workspace has. The conventions pick `src/model.ts`, so a flagless run would check
    // that pair and say nothing about this one - passing while this one had drifted.
    writeFileSync(join(root, "src", "model.workspace.ts"), TODO_MODEL, "utf8");
    mkdirSync(join(root, "src", "patches"), { recursive: true });
    mkdirSync(join(root, "src", "patches-ws"), { recursive: true });

    for (const mode of ["check", "autogenerate"]) {
        // Generating into the wrong chain is as wrong as checking the wrong one, so both
        // refuse rather than only the one CI runs.
        assert.throws(
            () => revision({ cwd: root, mode, message: "x" }),
            /Ambiguous: --model was not given/,
            `${mode} must refuse`
        );
    }
    // The message names the other candidate, so the fix is visible without hunting.
    assert.throws(() => revision({ cwd: root, mode: "check" }), /model\.workspace\.ts/);

    // Naming the pair is the author saying which one they mean, and it works as before.
    const explicit = revision({
        cwd: root, mode: "autogenerate", message: "the Todo class",
        model: "src/model.ts", patches: "src/patches",
    });
    assert.equal(explicit.code, 0);
    assert.equal(revision({
        cwd: root, mode: "check", model: "src/model.ts", patches: "src/patches",
    }).code, 0);
});

test("refuses on an ambiguous chain even when the model is explicit", () => {
    const root = project(TODO_MODEL);
    mkdirSync(join(root, "src", "patches"), { recursive: true });
    mkdirSync(join(root, "src", "patches-root"), { recursive: true });

    assert.throws(
        () => revision({ cwd: root, mode: "check", model: "src/model.ts" }),
        /Ambiguous: --patches was not given/
    );
    // And naming it settles the question.
    assert.equal(revision({
        cwd: root, mode: "check", model: "src/model.ts", patches: "src/patches-root",
    }).code, 1);
});

test("the source printer is deterministic and readable", () => {
    assert.equal(toSource({ b: 1, a: 2 }), "{\n    b: 1,\n    a: 2,\n}");
    assert.equal(toSource({ "~class": "class" }), "{\n    \"~class\": \"class\",\n}");
    assert.equal(toSource([]), "[]");
    assert.equal(toSource({ nested: { deep: null } }), "{\n    nested: {\n        deep: null,\n    },\n}");
    const rendered = renderPatchFile({ version: "1.0.0", target: "t", changelog: "c", docs: [] });
    assert.equal(rendered, renderPatchFile({ version: "1.0.0", target: "t", changelog: "c", docs: [] }));
});

test("a model exported as the default loads - frozen or not, named as well or not", () => {
    // `jiti` with `interopDefault` returns the *default export* and copies the other
    // exports onto it with `defineProperty` - which throws, swallowed, on a frozen
    // object, and every `defineModel` result is frozen. So a model exported as the
    // default used to arrive with neither `.default` nor `.model` reachable, and the
    // command refused it with "exports no model" while listing the model's own internal
    // keys - against its own error message, which invites exactly this shape.
    const shapes = {
        "default only": TODO_MODEL.replace(
            "export const model = defineModel({ classes: [Todo] });",
            "export default defineModel({ classes: [Todo] });"
        ),
        "both, default last": `${TODO_MODEL}\nexport default model;\n`,
    };
    for (const [shape, source] of Object.entries(shapes)) {
        const root = project(source);
        const generated = revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });
        assert.equal(generated.code, 0, `${shape}: autogenerate`);
        const checked = revision({ cwd: root, mode: "check" });
        assert.equal(checked.code, 0, `${shape}: check`);
        assert.match(checked.output.join("\n"), /agree on 1 class\(es\): Todo/, shape);
    }
});

test("a chain exported from a module loads whether the array is frozen, and counts once", () => {
    const root = project(TODO_MODEL);
    // The chain itself is the generated one, re-exported as a module: this test is about
    // how the array is *loaded*, so restating its documents here would only risk them
    // drifting from the model and failing for the wrong reason.
    revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });
    const reexport = (body) => `import patch from "./src/patches/0.1.0.js";\nexport default ${body};\n`;

    // A plain default export: jiti attaches `default` to the array, but *not
    // enumerably*, so the reader - which enumerates - could not see it. This shape is
    // what the error message's "or as the default" means, and it never worked.
    writeFileSync(join(root, "plain.ts"), reexport("[patch]"), "utf8");
    // Frozen: jiti cannot attach anything at all, so the array is reachable only as the
    // module value itself.
    writeFileSync(join(root, "frozen.ts"), reexport("Object.freeze([patch])"), "utf8");
    // Named *and* default - one array under two names. The reader has to count it once:
    // reporting two chains here would refuse a single-chain module as ambiguous.
    writeFileSync(join(root, "both.ts"),
        'import patch from "./src/patches/0.1.0.js";\n'
        + "export const patches = [patch];\nexport default patches;\n", "utf8");

    for (const file of ["plain.ts", "frozen.ts", "both.ts"]) {
        const result = revision({ cwd: root, mode: "check", model: "src/model.ts", patches: file });
        assert.equal(result.code, 0, `${file}: ${result.output.join(" ")}`);
    }
    // And `#default` names it, which is the only name a default-exported chain has.
    assert.equal(revision({
        cwd: root, mode: "check", model: "src/model.ts", patches: "frozen.ts#default",
    }).code, 0);
});

/**
 * Where the equivalence fixture lives.
 *
 * In the client package, because its primary consumer is the browser suite that drives
 * the generated patch through a real stack - the one `proposal.md` §11 criterion that
 * needs an engine. Only this side can run the generator, so the comparison below is what
 * keeps the committed output from going stale.
 */
const EQUIVALENCE = join(
    dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "src-test", "equivalence"
);

test("the committed equivalence fixture is still what the generator emits", () => {
    const root = project(readFileSync(join(EQUIVALENCE, "model.ts"), "utf8"));
    mkdirSync(join(root, "src", "patches"), { recursive: true });
    writeFileSync(
        join(root, "src", "patches", "1.0.0.ts"),
        readFileSync(join(EQUIVALENCE, "baseline.ts"), "utf8"),
        "utf8"
    );

    const result = revision({
        cwd: root, mode: "autogenerate", message: "seal the note body",
        target: "equivalence-app", version: "1.1.0",
    });
    assert.equal(result.code, 0, result.output.join("\n"));
    assert.equal(
        readFileSync(result.written, "utf8"),
        readFileSync(join(EQUIVALENCE, "generated.ts"), "utf8"),
        "packages/client/src-test/equivalence/generated.ts is no longer what the generator "
        + "writes. Regenerate it - its README.md has the command - and re-run the client suite."
    );
    // And the chain it leaves states the model, which is the other half of the fixture:
    // a baseline the diff would have had more to say about would make the delta a
    // different patch than the one the browser suite drives.
    assert.equal(revision({ cwd: root, mode: "check" }).code, 0);
});

test("changing an attribute without regenerating fails --check, whatever changed", () => {
    // `proposal.md` §11, and ADR-0037's failure mode: "edited the model, forgot the
    // patch". The failures already covered are a class the chain has never seen and a
    // class the model stopped declaring; an *edit* to an attribute that both sides
    // already know is the one that happens every week, and it reached `--check` only
    // through the diff's own unit tests.
    const edits = {
        "a config flag": 'title: a.string({ mandatory: true, maxLength: 200, primaryKey: true }),',
        "a constraint": "title: a.string({ mandatory: true, maxLength: 120 }),",
        "the type": "title: a.integer({ mandatory: true }),",
        "mandatory, dropped": "title: a.string({ maxLength: 200 }),",
        // Cosmetic to a reader, not to the stored model: a patch has to carry a changed
        // description or the stored schema never gets it, so `--check` has to notice.
        "only the description": 'title: a.string({ mandatory: true, maxLength: 200, description: "The title" }),',
    };

    for (const [what, replacement] of Object.entries(edits)) {
        const root = project(TODO_MODEL);
        // Generated and agreeing, which is the state CI is normally in.
        revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });
        assert.equal(revision({ cwd: root, mode: "check" }).code, 0, `${what}: agreeing first`);

        writeFileSync(join(root, "src", "model.ts"), TODO_MODEL.replace(
            "title: a.string({ mandatory: true, maxLength: 200 }),", replacement
        ), "utf8");

        const drifted = revision({ cwd: root, mode: "check" });
        assert.equal(drifted.code, 1, `${what}: must fail`);
        assert.match(drifted.output.join("\n"), /disagree on 1 class\(es\): Todo/, what);
        // And it names the way out, rather than only reporting.
        assert.match(drifted.output.join("\n"), /--autogenerate/, what);

        // Generating closes it, and the patch carries the one attribute as a merge.
        const written = revision({ cwd: root, mode: "autogenerate", message: `change ${what}` });
        const patch = readFileSync(written.written, "utf8");
        assert.match(patch, /_rev: "auto"/, what);
        assert.match(patch, /title:/, what);
        assert.doesNotMatch(patch, /priority:/, `${what}: only the changed attribute`);
        assert.equal(revision({ cwd: root, mode: "check" }).code, 0, `${what}: agreeing again`);
    }
});

const HANDLER_MODEL = `
import { defineClass, defineHandler, defineModel, a } from "@docstack/shared";

export const stamp = defineHandler("todo.stamp", {
    kind: "trigger",
    run: (doc) => doc,
});

export const Todo = defineClass("Todo", {
    attributes: {
        title: a.string({ mandatory: true, maxLength: 200 }),
        priority: a.enum(["low", "high"]),
    },
    triggers: [{ name: "stamp", order: "before", handler: stamp }],
});

export const model = defineModel({ classes: [Todo] });
`;

test("a declared handler is emitted as a reference, and --check accepts it", () => {
    const root = project(HANDLER_MODEL);
    const written = revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });
    const patch = readFileSync(written.written, "utf8");

    // The name, never the function: a handler body is code, versioned by the app build.
    assert.match(patch, /handler: "todo\.stamp"/);
    assert.doesNotMatch(patch, /run:/);
    assert.equal(revision({ cwd: root, mode: "check" }).code, 0);
});

test("--check fails when a chain references a handler the model does not register", () => {
    const root = project(HANDLER_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });

    // Renamed in code, with the chain left alone - which is the usual way a reference
    // goes stale. `diffModel` cannot see it: it compares schemas and the class's own
    // fields, and triggers are in neither, so the diff keeps saying the two agree. The
    // engine would refuse to open; this is that refusal moved to CI.
    writeFileSync(join(root, "src", "model.ts"),
        HANDLER_MODEL.replace(/todo\.stamp/g, "todo.stamped"), "utf8");

    const result = revision({ cwd: root, mode: "check" });
    assert.equal(result.code, 1);
    const output = result.output.join("\n");
    assert.match(output, /names the handler 'todo\.stamp'/);
    assert.match(output, /model registers: todo\.stamped/);
    assert.match(output, /refuses to open/);
    // Said plainly: the diff itself is content.
    assert.doesNotMatch(output, /disagree on/);
});

test("--check fails on a handler of the wrong kind, and on a reference stating two things", () => {
    const wrongKind = project(HANDLER_MODEL.replace(
        'kind: "trigger",\n    run: (doc) => doc,',
        'kind: "job",\n    execute: async () => undefined,'
    ));
    // A job handler where a trigger is needed is as unusable as a missing one.
    const kindResult = revision({ cwd: wrongKind, mode: "check" });
    assert.equal(kindResult.code, 1);
    assert.match(kindResult.output.join("\n"), /needs a 'trigger' handler, but 'todo\.stamp' is declared as 'job'/);

    // Exactly one of handler/run/jobId: two is not a precedence question.
    const both = project(HANDLER_MODEL);
    revision({ cwd: both, mode: "autogenerate", message: "the Todo class" });
    const file = join(both, "src", "patches", "0.1.0.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace(
        'handler: "todo.stamp",',
        'handler: "todo.stamp",\n                    run: "return document;",'
    ), "utf8");
    const bothResult = revision({ cwd: both, mode: "check" });
    assert.equal(bothResult.code, 1);
    assert.match(bothResult.output.join("\n"), /exactly one of 'handler', 'run' or 'jobId'/);
});

test("--check fails on a patch job naming an unregistered handler", () => {
    const root = project(HANDLER_MODEL);
    revision({ cwd: root, mode: "autogenerate", message: "the Todo class" });

    // The shape the generator's own stub suggests, with the handler never declared.
    writeFileSync(join(root, "src", "patches", "0.2.0.ts"), [
        'const patch = {',
        '    _id: "todo-app-0.2.0",',
        '    "~class": "patch",',
        '    target: "todo-app",',
        '    version: "0.2.0",',
        '    changelog: "backfill",',
        '    docs: [],',
        '    preApply: { name: "backfill", handler: "todo.backfillPriority" },',
        '};',
        'export default patch;',
    ].join("\n"), "utf8");

    const result = revision({ cwd: root, mode: "check" });
    assert.equal(result.code, 1);
    assert.match(result.output.join("\n"), /preApply job of patch '0\.2\.0' names the handler 'todo\.backfillPriority'/);
});
