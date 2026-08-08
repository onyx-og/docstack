# DocStack

DocStack is a versatile framework for managing NoSQL databases. It provides a full suite of tools, from a powerful backend to a user-friendly graphical interface, making it easier than ever to interact with and manage your data. It's built around [PouchDB](https://pouchdb.com/).

### What's Inside? Our Monorepo Explained

We've organized DocStack into a single repository to ensure tight integration and a consistent developer experience. Each package plays a critical role in the framework:

* **`docstack/client`**: The bridge to your data. This package provides a simple yet powerful API for any application to connect to the DocStack server and perform read/write operations. Its unique ability to be **run directly in a web browser** makes it easy to build powerful, client-side data management tools.
* **`docstack/server`**: The robust foundation. This backend is engineered to handle all your database needs, providing a secure and scalable way to manage your data.
* **`docstack/react`**: The front-end toolkit. We've built a set of production-ready React components that directly consume the client, allowing you to build beautiful and interactive data interfaces in minutes, not hours.
* **`docstack/ui`**: The visual companion. This is a standalone graphical application that serves as a complete workbench. Explore your database, run queries, and manage your schema with a clean, intuitive interface—all without touching the command line.

## Contributing

Contributions are welcome. Before opening a PR, please make sure your change builds cleanly and the relevant package's test suite passes.

### Why tests matter here

Because DocStack packages share types and runtime behavior across a monorepo (`shared` → `client`/`server` → `react`/`ui`), a change that looks safe in isolation can silently break a consumer. The test suites are what catch that — and in practice they catch more than just regressions: they're also the first thing to notice broken build pipelines, misconfigured plugins, or data seeded by a system patch that no longer matches its own schema. A PR that "looks right" but skips tests is not considered reviewable — **tests are a required part of the contribution, not an optional follow-up.**

Concretely:

* **New functions, branches, or conditions** should ship with tests that exercise them.
* **Bug fixes must include a regression test** — a test that fails on `main` and passes with your fix. This is how a fix stays fixed.
* **Don't weaken a test to make it pass.** If a test's expectation seems wrong, that's worth raising explicitly (in the PR description, or as a question) rather than quietly loosening an assertion — tests exist to enforce real behavior, and a validation check that's disabled "to unblock CI" defeats the point of having it.

### Running tests per package

Each package runs its own suite from its own directory (`cd packages/<name>` first):

| Package | Runner | Command |
|---|---|---|
| `@docstack/client` | Playwright (real browser) | `npm run test` |
| `@docstack/server` | Jest | `npm run test` |
| `@docstack/ui` | Jest | `npm run test` |

Cross-package/integration tests exist for scenarios spanning multiple packages (e.g. client + server). These are heavier and are **not** run automatically as part of a normal package change — see `AGENTS.md` for the full policy on when to run them.

### `@docstack/client`'s Playwright suite — what to know

This package's tests run in a real Chromium instance loading the actual compiled library, so a few things are worth knowing before you run it:

* `npm run test` first rebuilds the package (`pretest` runs `npm run build && npm run build:vendor`) — the library bundle and its browser vendor bundle must be current, since the tests load them directly via a static test page (`test/index.html`), not the TypeScript source.
* Playwright needs its browser binaries installed once per machine: `npx playwright install chromium` (add `--with-deps` the first time to pull in required OS libraries, e.g. via `npx playwright install-deps chromium`, if you're on a fresh Linux box).
* If you're on a very recent Linux distro that Playwright doesn't yet recognize, browser install/launch may fail with an "OS not supported" error. Set `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=<closest supported platform>` (e.g. `ubuntu24.04-x64`) to work around it — this is a Playwright limitation, not a DocStack one.
* `playwright.config.ts` reuses an already-running dev server on port 3000 outside of CI (`reuseExistingServer`), so a stale server from a previous run won't necessarily reflect your latest build — if results look stale, kill anything listening on port 3000 and rerun.
* Tests run in parallel by default locally. If a failure looks timing-related (e.g. only reproduces intermittently), rerun with `npx playwright test --workers=1` to rule out cross-test resource contention before assuming it's a real bug.
