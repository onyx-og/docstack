# Under the hood

This section dives into the technical choices and architectural patterns that power DocStack. We've chosen a stack that prioritizes reliability, type safety, and offline-first capabilities, leveraging modern browser standards where possible.

## Tech Stack

### PouchDB
**Role:** Core Database Engine
**Why:** PouchDB is the industry standard for offline-first JavaScript databases. It provides a robust implementation of the CouchDB protocol, enabling seamless synchronization between the client (browser) and server. Its ecosystem allows us to build a sophisticated document store with revision tracking, conflict detection, and change listeners—features that are essential for our reactive architecture.

### Zod
**Role:** Schema Validation & Type Inference
**Why:** Zod allows us to define schemas that serve as both runtime validators and static type definitions. In DocStack, the "hydrated" schema for a class is a Zod object. This ensures that data entering the system is strictly validated against the user's defined model. Its composability makes it easy to map complex DocStack configurations (like `mandatory`, `maxLength`, `foreign_key`) into a cohesive validation chain.

### jsondiffpatch
**Role:** Schema Evolution & Delta Calculation
**Why:** When a data model changes, we need to understand exactly *what* changed to propagate those updates to existing documents. `jsondiffpatch` provides a precise delta between two JSON objects. This allows our schema propagation workers to efficiently apply only the necessary updates to thousands of documents without rewriting unchanged data.

### Web Crypto API
**Role:** Security & Encryption
**Why:** We rely on the native browser `crypto.subtle` API for all cryptographic operations.
*   **Performance:** Native implementations are significantly faster than JavaScript libraries for heavy operations like PBKDF2 (key derivation) and AES-GCM (encryption).
*   **Security:** Using standard, vetted browser APIs reduces the surface area for implementation errors compared to rolling custom crypto or using unmaintained libraries.

### Playwright
**Role:** End-to-End & Integration Testing
**Why:** DocStack is designed to run in the browser. Playwright allows us to run our integration tests in a real browser environment (headless or headed), ensuring that our PouchDB adapters, crypto calls, and worker threads behave exactly as they would for the end user. We use a custom fixture to inject the compiled library into the test page, bridging the gap between Node.js test runners and the browser context.

## Architectural Patterns

### Object-Oriented Design (OOP) with ES Classes
DocStack is built using modern ES Classes to encapsulate logic and state.
*   **`ClientStack`**: The main entry point, managing the database connection and sub-engines.
*   **`Class`**: Represents a data model, handling schema hydration and document operations.
*   **`JobEngine` / `CryptoEngine`**: Specialized service classes that encapsulate complex domains.

This approach provides a clear, discoverable API for developers and allows for strong typing throughout the codebase.

### Dynamic Function Hydration
A unique feature of DocStack is its ability to store logic (Triggers, Jobs, Policies) as data.
*   **Pattern:** We use the `new Function()` constructor to hydrate stringified code into executable functions at runtime.
*   **Sandboxing:** Unlike `eval()`, this creates a function with a restricted scope. We explicitly inject dependencies (like `stack`, `document`, `session`) as arguments. This allows users to define custom business logic that is stored in the database, versioned, and synchronized just like any other data.

### Event-Driven Architecture
The system is highly reactive, relying on PouchDB's `changes` feed and internal event emitters.
*   **Triggers:** Database writes fire `before` and `after` hooks.
*   **Schema Propagation:** Changes to `~Class` documents trigger background workers to update instances.
*   **Patch System:** The system watches for new `~Patch` documents to automatically apply schema migrations.

### Worker Offloading
To keep the main thread responsive, heavy tasks are offloaded to Web Workers.
*   **Schema Propagation:** When a class definition changes, a worker queries all related documents, calculates the diffs, and performs bulk updates in the background. This prevents UI freezes during large migrations.