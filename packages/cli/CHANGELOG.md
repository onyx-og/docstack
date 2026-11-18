# Changelog

## Unreleased

### Added - `docstack revision` (DocStack 2.0, `../../2.0.md`)

First release of the command line tool. It owns paths, versions and files; every
decision about what a patch should *contain* belongs to `@docstack/shared`, which the
client uses too, so the tool and the engine cannot disagree (`proposal.md` §6).

- **`docstack revision --check`** exits non-zero when the declared model and the patch
  chain disagree, naming the classes. This is the CI guard for the failure ADR-0037
  describes: editing the model and forgetting the patch.
- **`docstack revision --autogenerate -m "<what changed>"`** writes the patch that
  closes the gap and regenerates the patch directory's index. A class the chain has
  never produced arrives whole; a class it already produces arrives as a delta carrying
  `_rev: "auto"`, the engine's own marker for a merge. A dropped attribute is emitted as
  `null`. Running it with nothing to do writes nothing rather than an empty patch.
- **Patch layout** is `<patches>/<semver>.ts`, one module per revision exporting a
  `Patch` as its default, plus a generated `index.ts` exporting the ordered array. The
  file name is the version, so the chain is readable in a diff and orderable without
  loading anything. This settles the open question in `proposal.md` §9.
- **Conventions, with flags to override**: the model is looked for at `src/model.ts`,
  `model.ts` and a few neighbours, patches at `src/patches` or `patches`, and the patch
  target defaults to the project's own package name. Nothing falls back silently: when a
  path cannot be found the error names every place that was tried, because generating
  against the wrong baseline is worse than refusing.
- **Generated files are reviewable**: bare keys where possible, one entry per line,
  trailing commas, deterministic order, and the one-shot job hooks offered as commented
  stubs rather than omitted (ADR-0044).
- **Generated files import `Patch` from `@docstack/client/model`**, not from
  `@docstack/shared`: shared is an internal package that an application does not depend
  on, so the emitted import would not have compiled in a project that installed the
  client and this tool. `--types-import <specifier>` overrides it for a project that
  depends on a different DocStack package.
- **A hand-written patch in the same directory is left alone.** The generator owns the
  files it wrote and the index; a patch that seeds content rather than schema sits beside
  them, is picked up by the index, and `--check` stays quiet about it because it carries
  no class documents. `examples/react-todo` has one of each.

### Fixed

- **The installed `docstack` bin did nothing and exited 0.** `npm` installs a bin as a
  symlink, so `process.argv[1]` is the link while `import.meta.url` is already the
  resolved target; the entry-point guard compared the two as URLs and therefore decided
  this file was never the entry point. Every installed invocation parsed nothing, ran
  nothing and printed nothing, with a success code - so `revision --check` in CI would
  have passed without checking anything, which is worse than a check that fails. Both
  sides are compared as real paths now. Found by running the example's
  `npm run revision:check` through the installed bin rather than by path, and covered by
  a test that invokes the built `lib/index.js` through a symlink the way `npm` does;
  reverting the guard fails that test and only that test.

### Added - `docstack init` and `docstack doctor`

- **`docstack init`** scaffolds the model-first workflow into an existing project: a
  starter `model.ts` with one class, its first generated patch, the `revision`,
  `revision:check` and `docstack:doctor` npm scripts, and the DocStack section in
  `AGENTS.md` (and `CLAUDE.md` / `GEMINI.md` where they exist), written between markers so
  a re-run replaces it rather than appending a second copy.

  **What it will not do, deliberately:** install packages, or edit your own source. The
  version to install belongs to the registry and your lockfile, and where a provider goes
  belongs to your component tree - a scaffolder guessing either produces a diff you have to
  undo. It prints the one install command and the one wiring snippet instead, chosen by
  whether it found React or plain Node.

  Nothing it has written is overwritten on a second run: the model is kept, and no patch is
  generated for a model it did not create - that decision is `revision`'s, run deliberately.
- **`docstack doctor`** reports on the setup as a whole, and exits non-zero only on an
  error. Four kinds of finding:

  - **The chain.** A patch whose file name and declared version differ (the generator
    orders files by name, the engine orders by the version inside them, so the two
    disagree about when it applies); a class restated without `_rev: "auto"`, which
    replaces the stored class instead of merging and loses every attribute an earlier
    patch added (ADR-0037); a chain that changes `target` mid-way, which the sync gate
    reads as two chains (ADR-0040); a document with no `_id`; and the model/chain
    disagreement that `revision --check` exists for.
  - **The model.** Shapes that are legal to write down and do not mean what they read
    like: an array with a `defaultValue`, which fills nothing because modifiers apply the
    default before `isArray`; an `integer` whose default is not one, which 2.0 refuses; a
    `decimal` default finer than its own `precision`; a non-string `enum` member, which
    the validator never accepted; a `foreign_key` pointing at a class the model does not
    declare; and a note for each `encrypted` attribute, whose class cannot be written to
    on a locked stack.
  - **The project.** Zod resolvable and on 4.x; the client and shared versions; and a
    `tsconfig` that sets `compilerOptions.types` without `"pouchdb"` - which silently
    resolves every type declared through the ambient PouchDB namespace to `any`, with
    `skipLibCheck` hiding the cause. Only the configuration that actually compiles the
    model is considered, so a Vite project's second config for its build tooling is not
    reported; one that cannot be parsed is reported rather than skipped, because silence
    would read as approval.
  - **Your data, by naming what it cannot check.** The 2.0 data-shape fixes are stricter
    than what stored documents were written under, so the report lists every `integer`,
    `enum` and `date` attribute at risk and says plainly that the scan has to run where
    the data lives - a browser's IndexedDB is not something this process can open. A
    document that fails is still readable; it is the next write that is refused.

- `--types-import` now also chooses where the starter model imports its builders from, not
  only where a generated patch imports `Patch`.

Four of `doctor`'s checks were corrected by running it against a real application that had
never seen it (`tokido`, 2026-11-18) - which is the only way this kind of defect shows up:

- **A missing model is no longer an error.** A project with neither a model nor a patch
  directory has not adopted the code-defined model, which is not a fault; it gets a note
  pointing at `init`, and the dependency and TypeScript checks still run. A project with
  **patches and no model** keeps its chain checked and only loses the comparison - that is
  the pre-2.0 way and still supported. A **model with no patch directory** is the case that
  really is broken, and stays an error. A diagnostic that exits non-zero because a feature
  is not adopted is useless as a gate in any repository that mixes the two.
- **The ambient-namespace check counted the wrong package.** It tested for
  `@types/pouchdb`, but `@types/pouchdb-core` is what carries
  `declare namespace PouchDB` - so an application depending on `pouchdb-browser` was told
  its types were weakened when they were fine. Either package satisfies it now.
- **A second copy of zod is reported**, which is what found a live two-identity hazard in
  that application: zod 3.25.76 nested under an older `@docstack/shared` while the app
  itself resolved 4.4.3. Graded by whether the majors differ - across majors the copies are
  not interchangeable at all and it is a warning; within one major they behave alike and it
  is a note, because otherwise every workspace monorepo would see a warning.
- **A failed model load no longer drags a second error behind it.** "No patch directory"
  was reported on top of "this file exports no model", burying the real one.

### Fixed - the conventions no longer guess between two models or two chains

A project with **two stacks** - a root database plus one per workspace, which a real
consumer runs - has two models and two chains. The conventions pick the first candidate
that exists, so a flagless `revision --check` checked that pair, reported agreement and
exited 0 **while the other pair's chain had drifted**: a green CI run over a broken schema.
The missing feature was not the problem; the false pass was.

Where the path was guessed rather than given, `revision` now refuses and names the other
candidates, for `--autogenerate` as well as `--check` - generating a patch into the wrong
chain is as wrong as checking the wrong one. `doctor`, being a report, says which pair it
covered and which it did not, and carries on. An explicit `--model` / `--patches` is the
author saying which pair they mean and behaves exactly as before, which is how a
multi-stack project runs this: once per pair.

The detection is a heuristic - the conventional locations, plus files named `model*` or
`*.model.*` beside the chosen one, plus sibling directories matching `patches`. A false
refusal is therefore possible, and costs one flag, which is also the fix; a missed second
model costs a false pass, which is worse. A single run that covers every pair wants a
`docstack.config.ts` declaring them, which is recorded as a nice-to-have in
`proposal.md` §9 rather than guessed at.

Not yet, and listed in `proposal.md` §12.2: `docs [topic]`. `create-docstack` waits on
nothing now that `init` exists, and the "Start here" line of §12.3 goes in whichever change
first publishes either package.
