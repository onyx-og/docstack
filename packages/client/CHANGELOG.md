# Changelog

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
