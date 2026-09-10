---
title: "Installation"
description: "Install @docstack/client and its PouchDB peers, add the React bindings, and check what a browser needs to run DocStack."
sidebar_position: 1
---

DocStack ships as two packages on npm: the engine and the React bindings. Both are pre-1.0 and moving, and both are in production use.

## The engine

```bash
npm install @docstack/client pouchdb-browser pouchdb-find
```

`pouchdb-browser` and `pouchdb-find` are **peer dependencies** at `^9`. DocStack does not bundle the storage layer, so you control its version and it is never duplicated in your bundle.

[![@docstack/client on npm](https://img.shields.io/npm/v/@docstack/client?label=%40docstack%2Fclient)](https://www.npmjs.com/package/@docstack/client)

The badge is the current release, read from npm as you load this page. The [release notes](/blog) say what changed in each one, and the [changelog](https://github.com/onyx-og/docstack/blob/main/packages/client/CHANGELOG.md) goes back to 0.1.6.

## The React bindings

```bash
npm install @docstack/react @docstack/client pouchdb-browser pouchdb-find
```

React 19 is a peer dependency. `@docstack/react` wraps the client in a provider and a set of hooks that are live by default; see [React bindings](../guides/react.md).

[![@docstack/react on npm](https://img.shields.io/npm/v/@docstack/react?label=%40docstack%2Freact)](https://www.npmjs.com/package/@docstack/react)

## What the runtime needs

- **IndexedDB.** The default storage adapter is `pouchdb-browser`'s IndexedDB adapter. Any other PouchDB adapter passes through: everything in the options object that is not DocStack's own reaches the PouchDB constructor, so `adapter: 'memory'` with `plugins: [MemoryAdapter]` gives you an in-memory stack for tests.
- **Web Crypto.** Field-level encryption uses `crypto.subtle` for AES-GCM and PBKDF2. Every evergreen browser has it; so does Node 20 and later.
- **WebAssembly**, only if you use [cryptographic access scopes](../concepts/access-control/index.md). The CP-ABE primitive ships as `@docstack/abe`, a client dependency inlined into the bundle. Its ~180 KB (gzipped) WebAssembly module is embedded but instantiated **lazily** — a stack that never touches scopes compiles no WebAssembly and pays only the embedded bytes.
- **ES modules.** The package is `"type": "module"`. A UMD build is also shipped at `lib/index.umd.js` for script-tag use.
- **TypeScript types** resolve `@docstack/shared` at `^0.1.0`. The runtime bundle inlines it (and `@docstack/abe`); only the published `.d.ts` files import them.

### Bundler note

PouchDB's browser build touches Node built-ins. Vite projects need a polyfill plugin; the example app in the repository uses `vite-plugin-node-polyfills`:

```typescript title="vite.config.ts"
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({ include: ['fs', 'path', 'util', 'stream', 'buffer', 'process'] }),
    ],
});
```

Webpack 5 projects need the equivalent `resolve.fallback` entries for `buffer`, `stream`, `util` and `process`.

## Syncing to Google Drive

The Drive transport is a separate package, maintained in [its own repository](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive):

```bash
npm install @docstack/pouchdb-adapter-googledrive
```

Use 0.1.6 or later; earlier versions lose change-log references under concurrent writers. The [Google Drive guide](../guides/google-drive.md) covers registration, scopes and restore.

## The server

`@docstack/server` is a preview of the same engine deployed on a host. It is not published and there is nothing to install; the [server reference](../reference/server.md) describes what it is for and what its source exposes today.

## Next

The [Quickstart](./quickstart.md) opens a database, defines a class, writes a document and queries it back, first from plain TypeScript and then from React.
