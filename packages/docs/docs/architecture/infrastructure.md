# Infrastructure

DocStack ships as a monorepo of independently publishable packages rather than a single deployable service. This page covers how the pieces are built, configured, and run.

## Monorepo Layout

The repository is managed with npm workspaces (`packages/*`):

| Package | Role |
| :------ | :--- |
| `@docstack/shared` | Types and utilities shared by every other package (document/class models, patch definitions). |
| `@docstack/client` | The offline-first engine: `ClientStack`, schema/validation, triggers, jobs, policies, crypto — runnable in the browser or Node.js. |
| `@docstack/server` | An Express-based host for `@docstack/client`'s engine, adding JWT authentication, session cookies, and a REST layer for schema/administrative operations. |
| `@docstack/react` | Hooks and components that bind React UI to a `ClientStack` instance. |
| `@docstack/ui` | A standalone workbench application (built with Webpack) for browsing and administering a DocStack database without writing code. |
| `docs` | This documentation site (Docusaurus). |
| `examples` | Minimal reference apps (Vite/React) demonstrating library usage. |

Each package builds independently:

* `@docstack/client` and `@docstack/server` compile with **Rollup** + `@rollup/plugin-typescript` down to UMD bundles under `lib/`.
* `@docstack/ui` builds with **Webpack**, producing the static bundle served under `docs/static/app` and linked from the docs site's "Live" navbar entry.
* `@docstack/docs` builds with **Docusaurus**, additionally running `docusaurus-plugin-typedoc` against the `client` and `server` TypeScript sources to auto-generate the API reference sidebars.

Root-level `npm run build:*` scripts (`build:client`, `build:server`, `build:react`, `build:docs`, `build:ui`) orchestrate these per-package builds from the repository root.

## Storage Backends (Adapters)

DocStack's data layer is built on PouchDB, chosen specifically for its adapter model:

* **Browser**: `pouchdb-browser`, persisting to IndexedDB — this is what makes `@docstack/client` usable directly inside a web app with no backend.
* **Node.js**: `pouchdb-node`, persisting via LevelDB by default, with `pouchdb-adapter-memory` available for ephemeral/test databases.
* **Querying**: `pouchdb-find` is registered on every instance to provide Mango-style selectors (`$eq`, `$in`, `$elemMatch`, …) used throughout the query engine and policy checks.

Because the storage engine is swapped via a PouchDB adapter rather than a rewrite of DocStack's own code, adding support for additional backends (MongoDB, Firebase Firestore — see [Goals & roadmap](../get-started/goals.md)) is a matter of adapter integration rather than a new data layer.

## Configuration

`@docstack/server` is configured entirely through environment variables, loaded via `dotenv`. The `.env` file location can be overridden with the `ENVFILE` environment variable (defaults to a shared `.env` next to the `shared` package). Notable variables:

| Variable | Purpose |
| :------- | :------ |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Bootstrap credentials for the initial admin `User` document, created automatically on first boot. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RSA key pair used to sign and verify session JWTs. Generated automatically on first run if absent. |
| `PSW_PRIVATE_KEY` / `PSW_PUBLIC_KEY` | RSA key pair used to encrypt stored user credentials server-side. Also auto-generated on first run. |
| `ENCRYPTION_PASSPHRASE` | Passphrase protecting the above private keys at rest. |
| `NODE_ENV` | When set to `development`, relaxes CORS (`http://localhost:8080`) and cookie flags to ease local frontend development. |

Because key material and admin credentials are generated/bootstrapped on first run rather than committed to the repository, a fresh environment only needs the passphrase and admin credentials supplied — everything else self-configures.

## Deployment Shapes

DocStack doesn't prescribe a single deployment topology; the packages compose into a few common shapes:

1. **Fully embedded** — a browser or Electron-style app depends only on `@docstack/client` (optionally with `@docstack/react`), with no server process at all. This is how `@docstack/ui` and the example apps run today.
2. **Centralized server** — `@docstack/server` runs as a long-lived Node.js process behind a reverse proxy, exposing the REST layer described in [Communication](./communication.md) for multi-user or cross-device scenarios.
3. **Static docs/app hosting** — the documentation site and the `@docstack/ui` static bundle are designed for static hosting (the site is configured for GitHub Pages via `docusaurus.config.ts`'s `deploy` script).

There is currently no bundled containerization (Docker) or orchestration tooling in the repository; processes are run directly with Node.js (`node ./server/lib/index.js` in production, `ts-node` in development).
