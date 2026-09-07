---
title: "Monorepo & builds"
description: "How the repository is laid out, how each package is built and tested, what the root scripts do, and the conventions a contribution is expected to follow."
sidebar_position: 1
sidebar_label: "Monorepo & builds"
---

DocStack is an npm-workspaces monorepo (`packages/*`) of independently publishable packages plus this site and the example apps. Contributions are welcome; the repository's [CONTRIBUTING.md](https://github.com/onyx-og/docstack/blob/main/CONTRIBUTING.md) is the policy, this page is the map.

## Layout

| Path | Package | Role | Published |
| :--- | :--- | :--- | :--- |
| `packages/shared` | `@docstack/shared` | Types and abstract bases shared by every package: document, class, domain, trigger and patch models, `StackOptions`, the `Stack` and `Class` abstractions. | 0.1.0 |
| `packages/client` | `@docstack/client` | The engine. | 0.2.0 |
| `packages/react` | `@docstack/react` | Provider and hooks. | 0.1.1 |
| `packages/ui` | `@docstack/ui` | The workbench application. Built with Webpack; its bundle is copied into `packages/docs/static/app` and hosted from this site. | Not a library; hosted |
| `packages/server` | `@docstack/server` | The server preview. | No |
| `packages/docs` | `@docstack/docs` | This site (Docusaurus). Builds into the repository's root `docs/` folder, which GitHub Pages serves. | Site |
| `packages/examples/react-todo` | | The runnable example app (Vite). | |
| `packages/examples/react-init` | | A single-file starting point. | |
| `packages/pouchdb-adapter-channel`, `packages/pouchdb-adapter-tauri-sqlite`, `packages/pouchdb-adapter-native` | | In-repo storage and transport adapters, the latter two as git submodules. Unpublished and not documented on this site. | No |
| `specs/` | | Numbered specs and `specs/adr/`, the decision records. | |
| `spikes/` | | Experiments kept outside the workspace glob on purpose, so nothing in the packages can depend on them. | |

The published Google Drive adapter lives in [its own repository](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive).

## Building

Each package builds on its own; the root `package.json` orchestrates:

```bash
npm install                 # once, at the root; links the workspaces
npm run build:shared
npm run build:client        # clean, tsc for types, rollup for lib/ (ESM + lib/index.umd.js)
npm run build:react         # tsc
npm run build:ui            # webpack, production
npm run build:docs          # docusaurus build --out-dir ../../docs
npm run start:docs          # docusaurus start, with polling for WSL and network drives
```

`shared` must build before `client`, and `client` before `react`: the type declarations are consumed across the `references` in each `tsconfig.json`. The client's Rollup build owns every `.js` under `lib/`; `tsc` emits declarations only, so the two do not overwrite each other.

The site's API reference is generated at build time by TypeDoc from `packages/client/src/index.ts`, `packages/react/src/index.ts` and `packages/server/src/index.ts` into `packages/docs/docs/api/`, which is gitignored. Nothing under any package's `lib/` is read or edited by hand.

## Testing

| Package | Runner | Command |
| :--- | :--- | :--- |
| `@docstack/client` | Playwright, in a real Chromium against IndexedDB | `cd packages/client && npm run test` |
| `@docstack/server` | Jest | `cd packages/server && npm run test` |

Tests are a required part of a contribution, not an optional follow-up: new functions, branches or conditions ship with tests that exercise them; a bug fix includes a regression test that fails on `main` and passes with the fix; and a test is never weakened to make it pass. If an expectation seems wrong, raise it in the PR rather than loosening the assertion.

The client suite has a few things worth knowing:

- `npm run test` first rebuilds the package (`pretest` runs the build and the browser vendor bundle), because the tests load the compiled library through a static page (`test/index.html`), not the TypeScript source.
- Playwright needs its browser once per machine: `npx playwright install chromium`, with `--with-deps` on a fresh Linux box.
- On a very recent Linux distribution Playwright may not recognise the platform; `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` works around it.
- Outside CI the config reuses a dev server already listening on port 3000, so a stale one will not reflect your latest build; kill it and rerun if results look stale.
- Tests run in parallel. Rerun with `npx playwright test --workers=1` before assuming a timing-related failure is real.
- The benchmark file is opt-in: `BENCH=1 npx playwright test zz-bench --reporter=list`. The figures quoted on this site come from it.

Cross-package integration tests exist for scenarios spanning packages and are not run as part of a normal package change.

## Submodules

Two adapter directories and the three Android projects under `android/` are git submodules. Clone with `--recurse-submodules`, or run `git submodule update --init --recursive` afterwards; `npm install` at the root expects every workspace directory to carry a `package.json`.

## Decision records

Non-trivial changes are recorded as ADRs in `specs/adr/`. If a change alters an invariant one of them states, update or supersede that ADR in the same PR. The ADRs are the reason the code looks the way it does, and a silent divergence costs more than the write-up. The index is on [Decision records](./decision-records.md).

## Code conventions

`AGENTS.md` at the repository root sets the standards automated tools and contributors follow: strict, explicit TypeScript types; JSDoc on public methods, classes and exports; type-property comments on the line above, never inline; complex procedures name the pattern they apply; nothing under `lib/` is read or modified; no version bumps or publishes without an explicit request.
