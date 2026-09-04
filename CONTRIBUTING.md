# Contributing to DocStack

Contributions are welcome. Before opening a PR, please make sure your change builds cleanly and the relevant package's test suite passes.

See [AGENTS.md](AGENTS.md) for the full policy on repository layout, code style, and when cross-package integration tests are expected.

## Why tests matter here

Because DocStack packages share types and runtime behavior across a monorepo (`shared` → `client`/`server` → `react`/`ui`), a change that looks safe in isolation can silently break a consumer. The test suites are what catch that — and in practice they catch more than just regressions: they're also the first thing to notice broken build pipelines, misconfigured plugins, or data seeded by a system patch that no longer matches its own schema. A PR that "looks right" but skips tests is not considered reviewable — **tests are a required part of the contribution, not an optional follow-up.**

Concretely:

* **New functions, branches, or conditions** should ship with tests that exercise them.
* **Bug fixes must include a regression test** — a test that fails on `main` and passes with your fix. This is how a fix stays fixed.
* **Don't weaken a test to make it pass.** If a test's expectation seems wrong, that's worth raising explicitly (in the PR description, or as a question) rather than quietly loosening an assertion — tests exist to enforce real behavior, and a validation check that's disabled "to unblock CI" defeats the point of having it.

## Running tests per package

Each package runs its own suite from its own directory (`cd packages/<name>` first):

| Package | Runner | Command |
|---|---|---|
| `@docstack/client` | Playwright (real browser) | `npm run test` |
| `@docstack/server` | Jest | `npm run test` |
| `@docstack/ui` | Jest | `npm run test` |

Cross-package/integration tests exist for scenarios spanning multiple packages (e.g. client + server). These are heavier and are **not** run automatically as part of a normal package change — see [AGENTS.md](AGENTS.md) for the full policy on when to run them.

## `@docstack/client`'s Playwright suite — what to know

This package's tests run in a real Chromium instance loading the actual compiled library, so a few things are worth knowing before you run it:

* `npm run test` first rebuilds the package (`pretest` runs `npm run build && npm run build:vendor`) — the library bundle and its browser vendor bundle must be current, since the tests load them directly via a static test page (`test/index.html`), not the TypeScript source.
* Playwright needs its browser binaries installed once per machine: `npx playwright install chromium` (add `--with-deps` the first time to pull in required OS libraries, e.g. via `npx playwright install-deps chromium`, if you're on a fresh Linux box).
* If you're on a very recent Linux distro that Playwright doesn't yet recognize, browser install/launch may fail with an "OS not supported" error. Set `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=<closest supported platform>` (e.g. `ubuntu24.04-x64`) to work around it — this is a Playwright limitation, not a DocStack one.
* `playwright.config.ts` reuses an already-running dev server on port 3000 outside of CI (`reuseExistingServer`), so a stale server from a previous run won't necessarily reflect your latest build — if results look stale, kill anything listening on port 3000 and rerun.
* Tests run in parallel by default locally. If a failure looks timing-related (e.g. only reproduces intermittently), rerun with `npx playwright test --workers=1` to rule out cross-test resource contention before assuming it's a real bug.

### Benchmarks

The client's performance suite is skipped unless explicitly enabled:

```bash
cd packages/client
BENCH=1 npx playwright test zz-bench --reporter=list
```

It reports timings and backend query counts for the hot paths (writes, `findDocuments`, SQL planning and pushdown, joins, top-K, streaming, transactions), and also gates correctness assertions on those paths. The figures quoted in the READMEs come from this suite and are recorded in the relevant ADR under `specs/adr/`.

## Architecture decisions

Non-trivial changes are recorded as ADRs in [`specs/adr/`](specs/adr/). If your change alters an invariant one of them states, update or supersede that ADR in the same PR — the ADRs are the reason the code looks the way it does, and a silent divergence costs more than the write-up.
