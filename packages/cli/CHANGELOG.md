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

Not yet, and listed in `proposal.md` §12.2: `init`, `doctor` and `docs`. `doctor` is
where the report for documents predating the integer and default-value changes belongs.
`create-docstack` waits on `init`, and the "Start here" line of §12.3 goes in whichever
change first publishes either package.
