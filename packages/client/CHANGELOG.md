# Changelog

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
