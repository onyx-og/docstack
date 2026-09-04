[![Live app](https://img.shields.io/badge/live-workbench-brightgreen)](https://onyx-og.github.io/docstack/app/index.html)
[![Docs](https://img.shields.io/badge/docs-onyx--og.github.io-blue)](https://onyx-og.github.io/docstack/)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](https://github.com/onyx-og/docstack/blob/main/LICENSE.md)

# @docstack/ui

**The DocStack workbench — browse a database, edit its schema, and run queries, in the browser.**

### 👉 [Open the live app](https://onyx-og.github.io/docstack/app/index.html)

No install, no server, no sign-up: the workbench opens a DocStack database in your own browser and everything stays there.

<!-- TODO: demo GIF goes here -->
<!-- ![The DocStack workbench](./docs/demo.gif) -->

---

## What it is

A standalone application for working *on* a DocStack database rather than through one. Because DocStack runs entirely in the browser, so does the workbench: it opens a local database, reads its schema out of the same `~Class` documents your application uses, and lets you inspect and change both the model and the data.

It doubles as the most complete reference consumer of [`@docstack/client`](https://github.com/onyx-og/docstack/blob/main/packages/client/README.md) and [`@docstack/react`](https://github.com/onyx-og/docstack/blob/main/packages/react/README.md) — if you want to see the hooks driving a real interface, this is the codebase to read.

## What you can do with it

* **Dashboard** — class and domain counts, and the classes carrying the most documents.
* **Browse the model** — the class list, and per class a **Model** panel (attributes, types, configuration) beside a **Documents** panel showing the records themselves.
* **Edit the schema** — forms for creating and modifying classes, attributes, domains and triggers. Trigger logic is authored in a Monaco editor, the same one VS Code uses.
* **See the relationships** — a generated entity-relation diagram (Mermaid) of classes and the domains connecting them.
* **Query** — run SQL against the open database and read the results.
* **Inspect documents** — a JSON viewer for the raw stored form, which is where encrypted attributes are visibly ciphertext.
* **Authenticate** — sign in against a stack's user documents to see the data as a given session sees it, policies and all.
* **Debug** — a status bar and debug panel reporting what the engine is doing.

## Running it locally

The workbench consumes `@docstack/client`, `@docstack/react` and `@docstack/shared` through `file:` links, so build those first:

```bash
# from the repository root
npm install

cd packages/shared && npm run build
cd ../client && npm run build
cd ../react && npm run build
```

Then start the dev server:

```bash
cd packages/ui
npm run develop     # webpack dev server
```

To produce a static build:

```bash
npm run build
```

## Not an npm package

`@docstack/ui` is an application, not a library — there is nothing to `npm install` and nothing to import. Use the [hosted build](https://onyx-og.github.io/docstack/app/index.html), or run it from source as above.

To build a *different* interface on the same engine, the packages you want are [`@docstack/client`](https://github.com/onyx-og/docstack/blob/main/packages/client/README.md) and [`@docstack/react`](https://github.com/onyx-og/docstack/blob/main/packages/react/README.md).

## 📖 Documentation

* [Full documentation](https://onyx-og.github.io/docstack/)
* [Architecture](https://onyx-og.github.io/docstack/docs/architecture/core-concepts)
* [Contributing](https://github.com/onyx-og/docstack/blob/main/CONTRIBUTING.md)

## License

[CC-BY-SA-4.0](https://github.com/onyx-og/docstack/blob/main/LICENSE.md) · © Onyx AC, LLC
