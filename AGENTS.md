# AGENTS.md

## Purpose

This document defines how **automated coding assistants** (e.g. ChatGPT, GitHub Copilot, Codex-like tools) should operate within the **DocStack** monorepo.

It covers:

* Where things live (packages and responsibilities)
* How to write and document code
* How to run tests and builds safely
* What *not* to do automatically (especially cross-package tests and release builds)

The goal is to keep automated changes **consistent, safe, and idiomatic** to the existing codebase.

---

## Monorepo Layout & Responsibilities

DocStack is a TypeScript monorepo built around [PouchDB](https://pouchdb.com/), providing a full stack for NoSQL data management.

Automated tools should assume the following package structure and responsibilities:

### `@docstack/shared`

**Purpose:**
Shared dependencies, utilities, and types used across the monorepo.

**Guidelines for tools:**

* Place **shared logic, types, helpers and constants** here when they are used by more than one package.
* Do **not** put cross-package tests here. Shared test utilities are fine, but **test suites should live in the consuming package**.
* When updating shared types, consider the impact on:

  * `@docstack/client`
  * `@docstack/server`
  * `@docstack/react`
  * `@docstack/ui`

---

### `@docstack/client`

**Purpose:**
The bridge to the data layer for both **browser** and **Node.js** contexts.

This package includes:

* A **browser client** that can run directly in a web page and talk to the DocStack server.
* A **client node** that runs in the browser using the **same underlying technology as the server**, not only as a thin communication layer.

**Guidelines for tools:**

* Keep APIs consistent across browser and node environments where possible.
* When adding features, consider whether they must:

  * Work in browser only
  * Work in Node only
  * Or be shared between both variants
* Use `@docstack/shared` for shared types/utilities between client and server.

---

### `@docstack/server`

**Purpose:**
The backend for database management, replication, schema, and security policies.

**Guidelines for tools:**

* When changing server request/response shapes, update related types in `@docstack/shared` and consumers in `@docstack/client`.
* Do not couple server internals directly to the React or UI packages; communicate via typed contracts.

---

### `@docstack/react`

**Purpose:**
A set of production-ready **React components** built on top of `@docstack/client`.

**Build:** Webpack

**Guidelines for tools:**

* Consume only the **public API** from `@docstack/client` and types from `@docstack/shared`.
* Avoid importing server internals here.
* Make sure components remain reusable and composable; keep DocStack-specific logic in hooks/utilities.

---

### `@docstack/ui`

**Purpose:**
A standalone graphical application: the “workbench” for exploring databases, schemas, and queries.

**Build:** Webpack

**Guidelines for tools:**

* Use `@docstack/react` components and `@docstack/client` as the integration points.
* Avoid introducing direct dependencies on `@docstack/server` internals.

---

## Language & Tooling Standards

All code in DocStack is written in **TypeScript**, built with:

* **Rollup** for most libraries
* **Webpack** for `@docstack/react` and `@docstack/ui`
* **Jest** for testing

Automated tools must respect the following:

### TypeScript & Types

* Prefer **strict, explicit types**.
* Shared types belong in `@docstack/shared` when used in multiple packages.
* **Important**: For TypeScript types, interfaces and their properties, **write comments on the line immediately before the property**, not inline, to ensure IDE highlighting:

```ts
interface User {
  /** Unique identifier of the user */
  id: string;

  /** Human-readable display name */
  name: string;
}
```

### JSDoc & Comments

* All **public methods, classes, and exported objects** should have JSDoc.
* Complex procedures must document **which pattern** they apply (e.g. Strategy, Factory, Adapter, Observer):

```ts
/**
 * Resolves and executes the appropriate sync strategy for the given context.
 *
 * Pattern: Strategy
 *
 * @param {SyncContext} context - Context describing the current sync state.
 * @returns {Promise<SyncResult>} Result of the executed sync strategy.
 */
async function runSyncStrategy(context) { /* ... */ }
```

### ES Comments for IDE Rich Highlights

Where types are imported via JSDoc ES comments (for JS files or special cases), use:

```ts
/** @type {import('@docstack/shared').DatabaseConnection} */
let connection;
```

Use these where needed to enhance IDE completion, especially in non-TS contexts.

---

## Testing Guidelines for Automated Tools

**Test runner:** Jest

Automated tools should follow these rules:

### What to Run by Default

When modifying code in a package:

* Prefer running **only the tests relevant to that package**, for example:

  * `@docstack/client` → run its Jest suite
  * `@docstack/server` → run its Jest suite

Do **not** assume that cross-package tests should be run automatically.

### Cross-Package Tests

Tests that exercise behavior across multiple packages (e.g. client + server + UI):

* **Must NOT be run automatically by tools** unless the user explicitly asks for it.
* Tools can:

  * Suggest running these tests
  * Outline which commands to run
  * But must not trigger them by default

### Test Expectations

When adding or changing behavior:

* Extend existing Jest test suites or add new tests for:

  * New functions
  * New branches or conditions
  * Bug fixes (regressions must get tests)
* Use realistic behavior where possible; over-mocking core libraries should be avoided.

---

## Build & Release Guidelines for Automated Tools

DocStack uses:

* **Rollup** for most library packages
* **Webpack** for `@docstack/react` and `@docstack/ui`

Automated tools must respect:

### Package Builds

* When changes are made, it’s acceptable to:

  * Adjust Rollup or Webpack configs (if required by the change)
  * Ensure that the configuration remains consistent with existing patterns

### Release & Production Builds

* **Do NOT automatically produce a full release or run production builds** unless explicitly instructed by the user.
* This includes:

  * Full monorepo build
  * Version bumping
  * Packaging/publishing processes
* Tools may:

  * Generate or update build scripts
  * Provide instructions on how to run release builds
  * But leave actual execution to the human unless asked.

---

## Behavioral Rules for Coding Assistants

When operating on this repository, automated tools should:

1. **Locate the right package first**

   * Changes to shared behavior → `@docstack/shared`
   * Client logic or browser/server communication gateway → `@docstack/client`
   * Backend node.js implementation logic → `@docstack/server`
   * Reusable React components → `@docstack/react`
   * End-user GUI/workbench → `@docstack/ui`

2. **Respect the architecture**

   * Do not introduce tight coupling across packages where contracts/types should be used instead.
   * Prefer sharing via `@docstack/shared`.

3. **Follow code standards by default**

   * TypeScript, JSDoc, line-above property comments, ES-type comments where needed.

4. **Be conservative with side effects**

   * Do not automatically:

     * Run cross-package tests
     * Run full production builds
     * Modify version numbers
   * Only do these when the user explicitly requests it.

5. **Keep changes localized and well-tested**

   * When you modify a function, add or update tests in the same package.
   * When you change a shared type, ensure all direct consumers compile and are updated.

---

This file is the source of truth for how automated coding tools should behave in the DocStack monorepo. If in doubt, prefer:

* **Local, focused changes**
* **Clear documentation**
* **Minimal unexpected automation**
