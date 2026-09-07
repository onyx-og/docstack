---
title: "Examples & workbench"
description: "The hosted workbench, the runnable example app in the repository, and the test suite that doubles as executable documentation."
sidebar_position: 3
sidebar_label: "Examples & workbench"
---

## The workbench

The DocStack workbench is a standalone application for working *on* a database rather than through one. Because DocStack runs entirely in the browser, so does the workbench: it opens a local database, reads the schema out of the same class documents your application uses, and lets you inspect and change both the model and the data.

**[Open the workbench](pathname:///app/index.html)**. No install, no server, no sign-up; everything stays in your browser.

What you can do with it:

- **Dashboard.** Class and domain counts, and the classes carrying the most documents.
- **Browse the model.** The class list, and per class a Model panel (attributes, types, configuration) beside a Documents panel showing the records themselves.
- **Edit the schema.** Forms for creating and modifying classes, attributes, domains and triggers. Trigger logic is authored in a Monaco editor, the same one VS Code uses.
- **See the relationships.** A generated entity-relation diagram of classes and the domains connecting them.
- **Query.** Run SQL against the open database and read the results.
- **Inspect documents.** A JSON viewer for the raw stored form, which is where encrypted attributes are visibly ciphertext.
- **Authenticate.** Sign in against a stack's user documents to see the data as a given session sees it.

The workbench is also the most complete reference consumer of `@docstack/client` and `@docstack/react`. Its source is `packages/ui` in the repository; the hosted build is what `packages/docs/static/app` carries.

## The example app

`packages/examples/react-todo` is a Vite 7 + React 19 + TypeScript project that wires `@docstack/client` and `@docstack/react` together for a small checklist: a two-patch chain (the `Todo` class at `1.0.0`, three seed documents at `1.0.1`), `useClass` for writes, `useClassDocs` for the live list, `updateCard` to toggle completion. It is the code the [Quickstart](./quickstart.md) walks through.

It consumes the packages through `file:` links, so build them first:

```bash
# from the repository root
npm install
npm run build:shared
npm run build:client
npm run build:react

cd packages/examples/react-todo
npm install
npm run dev
```

`packages/examples/react-init` is a single `App.tsx` showing the smallest possible consumer: `useDocStack()` to reach the instance, `getStack(name)` and `getDbInfo()` to print what the database reports. It is a starting point to copy from, not a runnable project on its own.

## The test suite as documentation

`packages/client/src-test/` holds the client's Playwright suite: forty-odd files that run the compiled library in a real Chromium against IndexedDB. Each file pins one behaviour end to end, which makes it the most precise description of what the engine does: `transactions.test.ts` and `transaction-overlay.test.ts` for staging and overlay reads, `patch-chain.test.ts` and `patch-jobs.test.ts` for migrations, `locked-sync.test.ts` for what a stack does without its key, `query-subqueries.test.ts` for the SQL engine, `late-stack-sync.test.ts` for stacks that join a running replication.

The benchmark file is opt-in:

```bash
cd packages/client
BENCH=1 npx playwright test zz-bench --reporter=list
```

It reports timings and backend query counts for the hot paths. The figures quoted in these docs come from it. [Monorepo and builds](../contributing/monorepo-and-builds.md) explains how to run the suites.
