# Changelog

## Unreleased

### Added - engine sessions (ADR-0046)

- **`stack.forSession(session)`** returns a view of the stack as one principal sees
  it: reads open only the scopes the `StackSession` is entitled to and read `null`
  for the rest, whatever keys the stack holds; writes into any other scope refuse
  with `StackLockedError`; every write is attributed to the principal (`~createdBy`
  on creation, `~updatedBy` on every write, both reserved); `Class` instances built
  from the view route through it; the query engine and the live subscriptions run
  narrowed. Whole-stack members - keys, auth, sync, lifecycle, transactions - throw
  `StackSessionError` through a view. Built for a host serving many principals from
  one stack; a stack used without a session is unchanged.
- **Triggers and jobs receive the session.** A trigger body's fourth argument is
  `session` (`undefined` for a write with no session); `execute(stack, params, job,
  session)` for jobs, and `JobEngine.executeJob(id, args, triggerType, session)`
  hands it over. A trigger's `jobId` path forwards it.
- `StackSession` is exported from `@docstack/shared` and re-exported here with
  `SessionView`, `StackSessionError` and `createSessionView`.

### Added - remote stacks (ADR-0047, spec 03 §8)

- **`RemoteStack`**: a stack that lives on a DocStack server. The same contract the
  hooks and `Class` use - `getClass`, `getDomain`, `getClassNames`, `addClass`,
  `findDocuments`, `query`, `createDoc(s)`, `deleteDocument`, `subscribeClassDocs` -
  over the server's API surface and one server-sent-events feed per stack, so a
  `Class` built from it, `useQuerySQL` and `useClassDocs` work unchanged. Nothing is
  replicated; every read and write runs on the host under the caller's session, and
  the host's refusals come back as `StackLockedError`. Members only a local engine
  has (`db`, `sync`, keys, transactions) throw `RemoteStackError`.
- **`StackConfig.mode`**: `"remote"` makes `docstack.addStack` (and `StackProvider`)
  open a `RemoteStack` at `connection`, with `token`, `headers` and `fetch` as the
  transport options; `"local"` (default) is today's `ClientStack`. A remote stack
  joins the same list and never joins a sync.

### Added - the engine under Node (ADR-0047, spec 03)

- **Conditional exports.** `@docstack/client` resolves to a Node build under the
  `node` export condition, built on `pouchdb` (LevelDB, http, replication) instead
  of `pouchdb-browser`, which cannot load outside a browser. Same engine, same
  names; only the constructor differs. `@docstack/client/node` and
  `@docstack/client/browser` name each build explicitly. `pouchdb ^9` joins the
  peer dependencies; `pouchdb` and `pouchdb-browser` are both optional peers, one
  of them is needed.
- **`setPouchDB` / `getPouchDB`.** The constructor registry the entries use; a host
  that composes its own PouchDB (extra adapters, plugins) registers it before
  opening a stack.
- **`setDefaultLogLevel(level)`.** A process-wide floor for the module-level loggers a
  stack's own `logLevel` does not reach; `"silent"` hands a host its console back.
- The fossil Express block left in `DocStack`'s constructor from the server preview is
  gone.

### Fixed

- **A schema change persists before it is applied to the `Class`.**
  `addAttribute`, `modifyAttribute` and `removeAttribute` mutated the instance - its
  attribute map, its model and its Zod shape - and only then wrote the class document.
  Propagation runs inside that write, so any refusal (a locked stack on a class with
  encrypted attributes, a conflict, parent-class validation) aborted the write and left
  the instance describing a schema the database never accepted, while the method logged
  and returned the class as though nothing had happened. All three now write first and
  apply only what landed. `removeAttribute` is also awaited, so its failure can be
  observed at all rather than rejecting unhandled, and `modifyAttribute` is one write
  instead of a remove followed by an add, so a refusal no longer drops the old
  definition. A caller still gets the class back either way; the difference is that the
  class now tells the truth.
- **A remote stack is sent the schema being written.** `RemoteStack.updateClass`
  re-derived the model from the class instance, which is no longer the one being
  persisted, so a schema change against a host would have applied locally while the
  host was sent the unchanged model.
- **Schema propagation judges documents against the schema being written.** Removing a
  **mandatory** attribute from a class that holds documents could never persist:
  propagation strips the attribute from each document, and the stripped document was
  then validated against the class as still stored, which declares the attribute
  mandatory, so the whole class write was discarded. Propagation now carries the model
  it is propagating, which takes the precedence ADR-0043 already gives a class model
  riding its own batch - the model about to be committed outranks the store - across the
  call boundary, since the class document is written by the enclosing call and must not
  be written twice. The documents lose the attribute as well, which re-enables an
  assertion that had been commented out as "re-enable when attribute removal is fixed".
  Optional attributes and classes with no documents were unaffected and remain so.
- **Projected reads of scope-sealed attributes decrypt.** `findDocuments(selector,
  fields)`, `getCards(selector, fields)`, `findDocumentsIterator` with `fields` and
  the SQL engine's projection pushdown fetched only the requested fields, dropping
  the `~scope` label a scope-sealed payload authenticates against, so a projected
  read of such an attribute silently read `null` with the scope open. The label is
  now fetched alongside any projection and removed from the result when it was not
  asked for.
- **A `WHERE` predicate on an encrypted attribute matches.** The planner pushed
  every simple predicate into the Mango selector, encrypted attributes included, so
  the index compared a literal against the stored ciphertext payload and returned
  nothing; the in-memory re-check never saw the row. Predicates on attributes the
  class encrypts now stay out of the selector and are evaluated after decryption -
  which is what the query-engine docs already said happened. Under a session, a
  sealed value evaluates as `null`, so a predicate can never match plaintext the
  session may not see.
- **A bare table name followed by a clause parses.** `SELECT title FROM Task WHERE
  ...`, `FROM Task ORDER BY title`, `FROM Task LIMIT 5` and a bare alias
  (`FROM Task t WHERE t.done = FALSE`) all failed with `Unexpected token`: the
  alias detector tested the word *after* the candidate alias instead of the
  candidate, so a clause keyword became the alias and a real alias was refused.
  Every query in the suites wrote `AS t`; the quickstart's form did not work.

### Changed

- `deleteDocument` lets the pipeline's refusals through: `StackLockedError` and
  `StackScopeMismatchError` now propagate instead of being logged and answered
  with `false`, so a caller can tell a forbidden delete from a missing document.
  Storage failures keep the boolean contract.
- `createDoc`, `createDocs` and `deleteDocument` accept a trailing
  `{ session }` option; `findDocumentsIterator` accepts `session` in its options;
  `prepareChangeDocument` accepts a third `session` argument. All optional.

## 0.3.2 - 2026/09/10

### Removed - the `~Policy` class model, and the last references to it

- **`~sys-0.0.19` deactivates the `~Policy` class model.** 0.3.0 removed the
  rule engine and `~sys-0.0.18` deactivated the three seeded policy documents,
  but the class describing them stayed active and kept appearing in every class
  listing - a schema offered by a database for a language it no longer speaks.
  Deactivation rather than a tombstone, because that is the difference DocStack
  already draws: `getClassModels` (the workbench list, `useClassList`) reads
  through the `active` filter and stops offering the class, while
  `getClassModel` resolves by id without it, so a consumer's own legacy
  `~Policy` documents stay readable and writable rather than becoming documents
  of a class that cannot be resolved. The patches that created the class and
  seeded its documents are untouched: the system chain is cumulative and a
  fresh install replays it in order, so retiring is a patch on top, never a
  rewrite underneath.
- **`~Policy` leaves `DATA_MODEL_CLASSES`**, so a narrowed replication
  (`classes.include`) no longer carries legacy policy documents to keep a
  replica "readable" in a language nothing reads. Applications that deliberately
  replicate their own `~Policy` documents can name the class in `include`.
- The cache-invalidation subscriber that still watched `~Policy` class documents
  is gone - dead work on every change since 0.3.0. The deprecated `PolicyModel`
  type is kept for one more release.

### Changed

- **Dependency ranges.** `@docstack/abe` and `@docstack/shared` are now required
  at `^0.1.1`, the releases carrying the corrected `homepage` metadata. 0.3.1
  went out still asking for `^0.1.0`, which resolves and works but pins consumers
  to the older metadata; this supersedes it.

## 0.3.1 - 2026/09/10

### Changed

- **Documentation and package metadata only — no runtime change.** The README is
  rewritten for npm readers: user and developer stories, worked examples for
  migrations, sync, transactions and access scopes, the measured figures from
  ADR-0039 and ADR-0028, and a comparison against raw PouchDB and the
  offline-first field. `homepage` now points at
  https://onyx.ac/products/docstack, and documentation links resolve to
  https://onyx.ac/products/docstack/docs.

## 0.3.0 - 2026/09/07

Breaking: the `~Policy` rule engine is removed and `@docstack/abe` becomes a
dependency (installed automatically, loaded lazily when a stack declares scopes).

### Added (2026/09/06) — cryptographic access control (ADR-0045)

- **Access is now cryptographic, not a rule that runs.** Content belongs to an
  `~AccessScope` whose content key is ABE-sealed (CP-ABE / AC17) under a monotone
  attribute policy - `("role:manager" and "dept:sales") or "clearance:secret"`.
  A session supplies its attribute key through the new `accessKeys` option
  (adopt-then-store, consumer-held, like `documentKey`); `stack.unlockScopes(key)`
  attempts each scope, admitting only CEKs that pass a per-scope canary. A
  document labels itself with `~scope` (or inherits a class `defaultScope`); the
  scope decides *under which key* its `encrypted: true` fields seal, the schema
  still decides *what*. A key that does not satisfy a scope's policy reads its
  fields as `null` - denial is decryption failure, binding the device owner too.
  New package `@docstack/abe` carries the WASM primitive and the authority
  helpers (`setup`/`keygen`/`wrapCek`), which run where the application controls
  them, never in the client's public surface. The keyring generalizes the single
  document key (dispatch by `kid`, per-scope read-write/read-only modes, partial
  locks). Label integrity: `~scope`/`kid` is bound into every sealed payload as
  GCM additional data, and a write whose label disagrees with its ciphertext's
  key is refused (`StackScopeMismatchError`) rather than re-sealed - the
  induced-downgrade guard. `StackLockedError` now carries the sealed `scopeId`.
  Pinned by `src-test/access-scopes.test.ts`.

### Removed (2026/09/06) — the JS-rule policy engine (ADR-0045)

- **The `~Policy` JavaScript-rule engine is deleted.** Client-side rule
  evaluation could never bind the holder of the device (IndexedDB inspector,
  console) - it was a facade, and one access-control language replaces it. The
  five enforcement call sites, the per-class default-policy seeder, and the
  pre-auth "not authenticated for policy evaluation" throw are gone;
  `~sys-0.0.18` deactivates the three seeded policies, and `~Policy` the class
  stays inert for legacy data. Losing read access now SEALS encrypted fields to
  `null` (the ADR-0020 locked-read convention) instead of throwing - the crypto
  and query-auth suites assert the seal where they once asserted the throw.
  Behavioral/UI rules move to application code; conditional access
  ("published ⇒ public") is write-time scope labeling.

## 0.2.0 - 2026/09/03

### Changed (2026/09/04) — every consumer patch chain is transactional

- **Mixed and data-only patch chains apply through the ADR-0042 internal
  transaction** - the class-only scope and its sequential fallback are gone. The
  extension landed by deletion: the sweep already judges data docs by staged
  models (ADR-0044) and the pipeline resolves batch-mates regardless of order
  (ADR-0043), so the dispatcher fork was removed. Consequences: a chain is
  all-or-nothing (a later patch's failure persists and arms NOTHING, including
  earlier valid patches - previously they committed one by one); a patch can
  carry class models, `_rev: "auto"` data massages, seeds, and one-shot jobs at
  once (the ADR-0044 "class-model-only" job guard is lifted); consumer patch
  docs now meet the sweep's refusals (`_local/`, `_design/`, nested patch docs -
  previously stored silently). `applyPatch` and system patches are untouched.

### Added (2026/09/04) — one-shot jobs in patches

- **A patch can carry una-tantum migration jobs** (ADR-0044): `preApply` massages
  data through the chain transaction's facade - staged, so massage and model land
  in ONE commit or not at all, making refused migrations (tightening, type
  conversion, the honest rename, foreign-key backfill) actionable for the first
  time; `postApply` backfills after the models land, in a second staged
  transaction; the ledger arms only after both. Jobs follow the `~Job` content
  convention (`execute(stack, params, job)`), are never persisted as `~Job`, and
  leave `~JobRun` receipts without a `jobId` (`~sys-0.0.17` makes the foreign key
  optional; patch identity rides `runtimeArgs`) win or lose - a failed
  migration's trail survives the discard.
  Undeclared jobs defer while locked; `requiresKey: false` opts into locked
  execution behind two nets: locked reads of encrypting classes throw, and a
  locked refusal converts the patch to a deferral instead of failing the open.
  Patch machinery reads system-level (policy-free, decrypt-when-keyed) - a
  policy-filtered migration or propagation would silently transform only a
  session's subset.

### Fixed (2026/09/04)

- **A patch can introduce a class and seed its first document in one batch**
  (ADR-0043). `bulkDocs` resolved class models from cache and store only, so the
  composition every `applyPatch` produces - a class model and a document of it in
  one `docs` array - failed with "Class not found", permanently under the truthful
  ledger (correctly dormant, retried on every unlock, never able to succeed). Class
  resolution now checks the batch being written first: a model riding the batch is
  the newest statement of the schema. Built detached - the naive
  `Class.buildFromModel` route writes rev-less models and would have made the
  batch conflict with itself.

### Added (2026/09/04)

- **Class-model patch chains apply through one internal transaction** (ADR-0042).
  The pending chain stages through a transaction's overlay - patch N+1 hydrates
  against the classes patch N staged, so the ADR-0038 merge composes in memory -
  propagation is validated dry with nothing kept, and one commit lands every class
  doc as a single batch through the unchanged pipeline; the patch ledger
  (ADR-0041) arms only after. A refusal before commit persists nothing, records
  nothing, and names the patch, class and attribute at fault; a chain over a fresh
  class now stores its composed schema as one revision. (Shipped class-model-only
  with a sequential fallback; the mixed extension above removed the fork the same
  day.) System patches are untouched.

### Security

- **Replication no longer pushes encrypted attributes in plaintext.** PouchDB
  hard-binds its instance methods, so the pristine `bulkGet` the sync layer reads
  through re-entered the plugin's decrypting `get` per revision (its shim and the
  `open_revs` branch both dispatch through `this.get`) - every push since the
  decrypt-on-read restoration (0.1.8) delivered plaintext to the remote under the
  local revision id, while the local database stayed ciphertext. The `get` override
  now serves the stored form for any revision-addressed read (`{rev}`/`{open_revs}`);
  winning-revision reads still decrypt. **Remotes written by 0.1.8 should be treated
  as having held plaintext** and re-created or purged. Pinned by a test asserting
  remote ciphertext with zero plaintext in the serialized document. (ADR-0040)

### Added

- **Named write transactions** (`transactions: true` per stack). A handle from
  `stack.beginTransaction()` stages validated writes in memory - a write that fails
  validation, policy, or the locked-stack check stages nothing, and a batch with one
  bad document unwinds entirely - while reads through the handle
  (`t.db.get/bulkGet/find`, `t.findDocuments`, `t.query` incl. JOINs) see the staged
  state overlaid on committed state. Plain reads, other handles, live subscriptions
  and replication see committed state only. `stack.commit(t)` flushes the journal as
  ONE batch through the full authoring pipeline (triggers, relations, encryption);
  a refusal - validation, or a document changed underneath (direct write, another
  transaction, replication) - persists nothing and leaves the transaction open.
  `stack.discardTransaction(t)` drops it; so do `close()` and reload - uncommitted
  is not real. Class models, patches, `_design/` and `_local/` docs are refused in
  transactions. The commit report states the storage adapter's honest guarantee:
  `atomicBatch: true` on tauri-sqlite (one `BEGIN IMMEDIATE…COMMIT`), per-document
  elsewhere, mitigated by a revision pre-flight. Measured (browser, 100 docs):
  staging 0.43 ms/doc with zero backend queries; commit at parity with the
  non-transactional batch write; empty-stage overlay reads at parity with plain
  reads; refused commits ~1 ms. (ADR-0039)

### Fixed

- **Sync while locked, three junctions closed** (ADR-0040): the schema gate now
  publishes and compares the highest applied **consumer** patch version alongside
  the system version, so a device whose application patches trail the remote
  (deferred behind the document key, or an older build) refuses with
  `SyncSchemaMismatchError { scope: "consumer" }` instead of pulling documents its
  schema cannot describe - and passes after unlock replays the deferral. Class-model
  patches over a class with encrypted attributes now **defer while locked** like the
  data patches they propagate onto (propagation decrypts and re-encrypts every
  document of the class); a class that does not exist yet still applies locked.
  Propagation's re-encryption of untouched encrypted attributes is now pinned by a
  test.
- **Reopening a stack no longer re-applies consumer patches, and the ledger arms on
  `active`** (ADR-0041): a ledger entry is written with `active: true` at the moment
  of *successful* application only - the old flow recorded even failed applications
  as applied, so a refused patch never retried and the device's schema trailed
  permanently. A patch deferred behind the document key persists as a dormant entry
  (`active: false`) that the unlock replay arms in place; dormant entries neither
  satisfy the open-time dedupe nor count toward the sync gate's consumer version.
  Flagless legacy entries are treated as applied.
- **A relation written in the same batch as its endpoint no longer fails the
  endpoint check** - the plugin resolves batch-mates before declaring an endpoint
  missing. Surfaced by transaction commits, but a fix for plain mixed batches too.
- **`logLevel` no longer leaks into the PouchDB constructor** (missing from
  `DOCSTACK_OPTION_KEYS`).

## 0.1.8 - 2026/09/01

### Changed

- **Schema propagation is real, and class patches merge.** `applySchemaDelta`
  returned from inside its loop, so a class-model change propagated to at most one
  attribute per document - usually zero - and an attribute edited in place (a nested
  jsondiffpatch delta) never applied at all. Every delta entry now applies: adds
  stamp documents that lack the key (held values survive), in-place edits validate
  documents against the full new model, and a change documents cannot satisfy
  refuses the patch. Alongside it, a patch's `schema` now **merges attribute by
  attribute** instead of replacing the stored schema wholesale: an absent attribute
  stays as stored, and an explicit `"attr": null` drops it - from the model and,
  through propagation, from every document. A historical patch that dropped an
  attribute by omission no longer drops it on a fresh replay; restate a deliberate
  drop as `null`. All system patches are cumulative restatements and are
  unaffected. (ADR-0036/0037/0038)

### Fixed

- **Single-document reads decrypt again.** The plugin's `get` override was commented
  out in late 2025 inside an unrelated commit - a UMD prototype-capture break was
  silenced instead of fixed, and no record was made - so `stack.db.get` and
  `getDocument` returned `{__enc: ...}` payloads while `query` returned plaintext
  for the same document, and read-merge-write flows re-encrypted ciphertext into the
  next revision. The override is restored via the pristine-capture pattern
  (ADR-0019); the replication handle restores the pristine `get` so ciphertext still
  travels; a class that encrypts nothing pays only a cache lookup. (ADR-0032)

- **A stack added after `sync()` now joins the running replication.** An un-scoped
  `sync()` used to bind the stacks that existed at the moment of the call and
  nothing later: a workspace database mounted a second afterwards sat outside
  replication for the lifetime of the handle, with every status surface reporting
  healthy - it simply had no entry, and a missing key reads as "nothing to say".
  Found in a consumer as a workspace that replicated nothing for two days.
  `addStack` now binds new stacks to the live handle before announcing them; an
  explicit `stacks: [...]` list keeps its meaning; `cancelSync()` stops the
  auto-binding; `removeStack` drops the stack from the handle. (ADR-0033/0034)

### Added

- **`DocStack.getSyncCoverage()`** - `{ bound, unbound }` against the open stacks,
  and **`DocStackSyncHandle.names`** - what a sync covers. An idle stack and an
  unbound one are opposite problems, and `getStatus()` could not tell them apart.

### Confirmed as design

- **A `~Policy` enforces only while `active: true`.** Raised as a fail-open finding,
  ruled intended: `active` is the document-wide visibility flag `findDocuments`
  injects everywhere, and policies are not special. Now stated in the policy loader
  and pinned by a test proving both directions - a dormant deny-all does not apply,
  arming it flips the next write. Authors writing policies raw must set
  `active: true`; the authoring path and system patches already do. (ADR-0032)

## 0.1.7

### Added

- **`JobScheduler` — jobs that run with nobody watching** (`stack.jobScheduler`). `JobModel`
  has carried `schedule` and `nextRunTimestamp`, and `JobTriggerType` has allowed
  `"scheduled"`, since the job engine was written; nothing read or produced any of them.
  The scheduler does, under the constraints a client imposes rather than the ones cron was
  designed for: **missed occurrences collapse into one run** instead of replaying a
  fortnight of them, the grammar (`@every 6h`, `@daily@09:00`) refuses cron because a
  client cannot promise to be awake at a named occurrence, and schedule state lives in
  `_local/docstack-job-schedule` rather than on the replicating `~Job` document, whose
  `content` field is executable code a conflict would fork.

  It is created with the stack and **not started by it**: `start({ jobs: [...] })` is an
  allow-list with no "all", because job content replicates and `new Function` is not a
  sandbox. Duplicate work across devices is answered by the jobs themselves, which must
  write deterministic ids. (ADR-0031)

- **Abandoned runs are reaped.** Every tick moves `~JobRun` documents left `RUNNING` past a
  ceiling to `CANCELED`. Status only ever changed inside `Job.execute`'s `try`/`catch`, so a
  tab closed mid-run left one `RUNNING` for ever — and `hasRunningInstance` then skipped
  that singleton job on that device permanently.

## 0.1.6 — 2026-08-27

Seven months of work since 0.1.5 (2026-01-14). The headline is a data-loss fix: document
ids are now random, because sequential ids silently destroyed writes the moment
replication was involved. Everything below the fixes is feature work.

The reasoning lives in the repository's `specs/adr/` (0019–0024), not in this package.

### Fixed — data loss and replication correctness

- **Document ids are random, not sequential** (`Paper-x7f3k2m9q1w4`, not `Paper-2`).
  Ids were minted from `lastDocId + 1`, a counter only *local* writes advance —
  documents arriving by replication bypass it by design. One pulled document was
  enough: the next local `add()` minted an id the database already held, PouchDB
  resolved the two as revisions of one document, and the new write vanished with no
  error. Two devices did it to each other from their very first document, both
  starting at 1. No counter repair fixes a sequence derived from local state; the
  class prefix stays, so an id still says what it is. (ADR-0023 #1, ADR-0024)

- **`Class.add` can no longer report success for a write that did not land.** It used
  to return a document-shaped value with no `_rev`.

- **The client's own log records no longer replicate.** They carried no `~class`, so
  the internal-document filter passed them through — of 134 documents on one real
  remote, 111 were log records. They are now `~log-`-prefixed and filtered.
  (ADR-0023 #2)

- **Internal documents stay on the device.** Sessions, jobs, policies, groups and the
  auth module reached the remote despite `internalDocs` documenting the opposite —
  including instances like `Group-Admin` that carry no `~` prefix and dodged the
  prefix-keyed filter. The filter now knows what binds two instances and what is
  per-device state. (ADR-0023 #3, ADR-0024)

- **One changes feed per stack.** Every `Class` built used to open its own
  `db.changes({ live: true })`; building classes per document crossed Node's
  ten-listener ceiling on roughly the second render. Subscriptions now demultiplex
  one shared feed, and building a class for its schema no longer subscribes it —
  `Class.get`/`buildFromModel`/`fetch` accept `{ subscribe: false }`,
  `getClassSnapshot` reads a schema without a live view. (ADR-0021)

- **Change events decrypt before delivery.** Live views received ciphertext and
  rendered `[object Object]`. (ADR-0020)

- **`StackPlugin` captures the adapter correctly** — it read
  `pouch.prototype.bulkDocs` off the wrong object and broke pristine capture.
  (ADR-0019)

- Concurrency issues in the write path, id allocation for classes and domains,
  auth lifecycle, listener leaks, change-listener bypass, patch handling, and
  optional attributes accepting `null`.

### Added

- **Query engine**: parser, planner, evaluator, executor, accumulators.
- **Content transfer and data streaming** for large payloads.
- **Ephemeral and simple classes.**
- **Sync lifecycle** management and class-based replication filtering.
- **Benchmark-driven performance work** (P0, P1).

### Changed

- **`@docstack/shared` dependency raised to `^0.1.0`.** The old `^0.0.6` range could
  never resolve to the 0.1.0 the code and types are written against (`^` does not
  cross 0.0.x patch boundaries). The runtime bundle inlines shared, so this matters
  to TypeScript consumers: the published `.d.ts` files import from it.
- Reduced dependency footprint.

### Compatibility

- **Existing databases keep their sequential ids.** Random ids apply to new
  documents; nothing is renamed and old ids remain valid. The collision risk exists
  only while pre-0.1.6 clients keep writing — upgrade every device that shares a
  remote.
- **Remotes polluted by log records or internal documents are not cleaned up
  automatically.** New syncs stop pushing them; documents already replicated stay
  until removed by hand.
- Pair with `@docstack/pouchdb-adapter-googledrive@0.1.6` when syncing via Drive —
  its 0.1.5 loses change-log references under concurrent writers.

## 0.1.5 — 2026-01-14 and earlier

Not recorded. See `git log`.
