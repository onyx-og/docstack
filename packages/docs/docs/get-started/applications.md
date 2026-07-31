# Applications

DocStack's building blocks — class-based schemas, triggers, jobs, policies, encryption, and a SQL-like query engine — combine into full applications rather than staying separate concerns. This page sketches the kinds of applications those combinations are well suited for, and points to the reference apps shipped in this repository.

## Application archetypes

**Line-of-business admin tools.** Class-based modeling plus the Policy Engine's role-based access control map directly onto internal tools: customer records, HR data, inventory. Encrypted attributes protect the sensitive fields (salaries, PII) without special-casing them in application code — see [Core concepts](../architecture/core-concepts.md) and [Access Control (Policies)](../architecture/data-model-policies.md).

**Multi-tenant SaaS products.** Because policies are documents scoped by `groupId`/`userId`, a single DocStack instance can serve multiple tenants while guaranteeing one tenant's users never see another's data — without per-tenant application code.

**Offline-first field and mobile apps.** Since `@docstack/client` runs entirely embedded (PouchDB in the browser, no server round-trip required for validation or business logic), it fits applications that must keep working without connectivity — data collection in the field, point-of-sale, note-taking — and reconcile later. See [Communication](../architecture/communication.md) for how embedded vs. networked deployments differ.

**Content and e-commerce platforms.** Triggers and jobs let you express "when this happens, do that" declaratively: recalculating an invoice total before save, sending an order confirmation after checkout, re-indexing a blog post after publish. These patterns are covered in [Triggers & Jobs](../architecture/core-triggers-and-jobs.md) and [The Job Engine](../architecture/core-jobs.md).

**Regulated data / privacy-sensitive apps.** Healthcare notes, financial records, legal case files, and journaling apps benefit from the Crypto Engine's zero-knowledge, field-level encryption — the server and database operators never see plaintext for flagged fields. See [Field-Level Encryption](../architecture/core-crypto.md).

**Internal analytics and reporting.** The SQL-like [Query Engine](../architecture/core-query-engine.md) lets non-engineers (analysts, support staff) query joined, filtered data directly, without a bespoke reporting API.

## Reference applications in this repository

* **`@docstack/ui`** — a standalone workbench application for exploring a DocStack database, running queries, and managing schema through a graphical interface. It's the most complete example of a full application built on the client engine, and its live build is linked from this site's navbar ("Live").
* **`packages/examples/react-todo`** — a minimal Vite + React app demonstrating `@docstack/client` and `@docstack/react` wired together for a small, self-contained CRUD workflow.
* **`packages/examples/react-init`** — a bare-bones starting point for a new React application built on DocStack.

These examples intentionally stay small; for the architectural reasoning behind the patterns they use, see the [Architecture](../architecture/core-concepts.md) section.
