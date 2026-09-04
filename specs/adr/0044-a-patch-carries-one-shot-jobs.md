# ADR-0044 — A patch carries one-shot jobs: staged massage before, backfill after

Status: accepted, implemented · Date: 2026-09-04

**Implementation notes** (what building it taught, beyond the protocol):

- **Receipts are `~JobRun` documents with no `jobId`** - `~sys-0.0.17` makes the
  foreign key optional (a one-attribute ADR-0038 merge fragment), because patch
  jobs are deliberately never persisted as `~Job` and so have no row to point at.
  The patch identity (version, target, phase, job name) rides `runtimeArgs`. A
  first cut introduced a dedicated `~PatchRun` class; redacted by ruling - one
  receipt class, one relaxed constraint, no parallel vocabulary. Scheduler runs
  still write their `jobId`, and the foreign key still validates when present.
- **The facade and the sweep are policy-FREE for internal handles**
  (`skipPolicy`), and the plugin's propagation reads raw (with decrypt-when-keyed)
  instead of through `getCards`: patch machinery runs during `create()`, before
  any session exists, and a policy-filtered migration or propagation would
  silently transform only a session's visible subset - a partial migration is
  corruption wearing a success face. This grants nothing new: client-side
  policies never guarded `stack.db` writes or raw reads, and `applyPatch` was
  always public and policy-free. Encryption gates are untouched.
- **Class resolution for the internal path is stage-first** (`classFromStage`,
  the ADR-0043 batch-outranks-store rule applied to staging): a job can create
  documents of a class an earlier patch in the same chain staged, judged by that
  staged model - built detached, `Class.get` + `setModel`, never the writing
  `buildFromModel`.

Pinned by `src-test/patch-jobs.test.ts`: the tightening massage landing model and
data in one commit; the post-apply backfill arming only after; a failing pre-job
persisting nothing but its FAILURE receipt; undeclared jobs deferring while locked
with `requiresKey: false` running and unlock arming the rest; the wrong-`false`
degrading to deferral (open succeeds, locked attempt on record); the mixed
composition - class, seeded doc, and job in one patch - landing since the scope
guard lifted with ADR-0042's mixed extension; and `applyPatch` still refusing
jobs.

Propagation (ADR-0038) is mechanical - add fills, delete removes, change validates.
It reshapes documents but cannot **transform** them, so a patch whose data does not
satisfy its new model is refused by the chain's dry-run (ADR-0042) - honestly,
permanently (dormant ledger, retried on every open, never able to succeed). The
fault taxonomy names it "patch fault", but there is no sanctioned vehicle to fix
the data: patches apply during `create()`, before any application code runs. Only
something inside the patch system can run before the model change. That is the
una-tantum job.

## Use stories

1. **Tightening** - make an attribute mandatory over documents that lack it; the
   job backfills, then the same patch applies. The ADR-0042 dead end, made
   actionable.
2. **Type/format conversion** - `duration: "1h30m"` → minutes as integer; the
   change-branch validation refuses stored values until a job converts them.
3. **The honest rename** - ADR-0038 refused drop+add-of-same-name as "a rename
   with no data movement"; the job is the movement: copy `name` →
   `firstName`/`lastName`, then the patch drops and adds. One versioned unit.
4. **Foreign-key backfill** - introduce a mandatory `boardId`; the job creates the
   default board and assigns every task.
5. **Encrypted-data migrations** - a massage touching encrypted attributes rides
   the deferral barrier (ADR-0040) and runs at unlock replay, with the key.
6. **Una-tantum operational fixes** - de-duplication, orphan cleanup, recomputing
   a derived field after a bug: ledger-governed, once per device, instead of "run
   this snippet in a console everywhere".

The advantages are inherited, not invented: the ledger (ADR-0041) gives
exactly-once-per-device with honest retry; the consumer gate (ADR-0040) keeps
un-migrated devices from replicating skew meanwhile; the job machinery already
exists, so no second executable-content shape enters the system.

## Decisions (maintainer rulings)

1. **Job writes are STAGED.** The job receives a transaction-scoped facade of the
   ADR-0042 chain transaction - reads see overlay ∪ committed, writes stage - so
   the zero-persisted-on-refusal promise extends over the data transformation:
   massage and model land in **one commit**, or nothing does.
2. **Both phases.** `preApply` massages data so the new model can validate;
   `postApply` backfills what needs the model landed first (a new attribute filled
   from computed values). Pre runs in the chain transaction before its patch's
   class docs stage; post runs in a second internal transaction opened after the
   chain commit, jobs in patch order, one commit of its own.
3. **Declared as patch fields**, `preApply` / `postApply`, carrying one-shot job
   definitions (name + run content, optional params). Not documents in `docs`:
   they must run at their phase, not land with the batch - and they are never
   persisted as `~Job`, deliberately: replicable executable content keeps its one
   existing surface, and a migration is not a schedulable job.
4. **Locked stacks defer job-carrying patches by default; the author may opt a
   job into locked execution with `requiresKey: false`.** The barrier's judgment
   is "might applying need the key?"; arbitrary code makes the answer unknowable,
   and the flag lets the author answer it. The default falls out of the failure
   asymmetry, evaluated case by case: declaring key-free wrongly produces
   *silent, armed, permanent* corruption - a locked read hands the job `null` for
   encrypted values (a derive-from-encrypted massage computes garbage and
   commits), a selector over an encrypted attribute matches ciphertext and
   massages nothing, a raw read can migrate a `__enc` payload into a plain
   attribute where nothing will ever decrypt it again - while declaring
   key-required wrongly merely runs the migration at unlock instead of
   immediately. Latency versus corruption: the default is `requiresKey: true`.

   Two runtime nets back the opt-in, because a wrong `false` must fail safe too:
   while locked, the facade's class-aware reads of an encrypting class **throw**
   rather than serve the null convention (a migration wants the refusal - this
   closes the silent classes structurally), and a `StackLockedError` surfacing
   from the chain while locked **converts to deferral of the remainder** instead
   of failing `create()` - without it, a mis-declared patch does not defer
   gracefully but bricks every locked open, since a patch failure aborts stack
   creation. The residue: raw reads (`t.db.find`) bypass the class-aware path by
   design and stay an author responsibility, documented - do not raw-read
   encrypting classes in a locked-capable job.

## Mechanics

**The chain (ADR-0042), extended per patch:** deferral barrier (now also: carries
a job → defer while locked) → run `preApply` against the transaction facade →
stage the patch's class docs → dry-run → … one commit → run `postApply` phase in
its own transaction → commit it → arm the ledger.

**The facade** is the transaction surface wearing the stack's read/write document
API: `findDocuments`/`query`/`db.get/bulkGet/find` at the overlay,
`createDoc(s)`/`deleteDocument`/`db.put/post/remove/bulkDocs` staged. Class and
domain creation, `_local`/`_design` writes, and sync are refused by the existing
sweep - a migration transforms documents, it does not grow new machinery.

**Two batch-awareness mechanics make the staged design sound**, both continuations
of ADR-0043:

- *Validation*: massaged documents and the new class model ride the same commit
  batch; the ADR-0043 rule already validates a data doc against its batch-mate
  class model - the massaged data is judged by the model it was massaged FOR.
- *Propagation*: the plugin's class branch propagates over committed documents,
  which still hold pre-massage values at commit time - it would refuse (or
  re-stamp) exactly what the massage fixed. Propagation therefore **skips a
  committed document superseded by a batch-mate**: the mate is the post-massage
  version, already validated by the document branch against the new model. Not a
  silent skip - a delegation to the batch.
- *Dry-run*: `validateChainPropagation` reads committed documents with staged
  versions substituted (and staged deletes masked), so it rehearses what commit
  will actually judge.

**Run receipts write directly, not staged.** A `~JobRun`-style receipt (synthetic
job id `~patch-<target>-<version>-<phase>`) lands win or lose: a failed
migration's receipt is the troubleshooting trail (the ADR-0040 lesson - repeated
unlock failure must be attributable), and it must survive the discard that
protects everything else.

**Failure semantics.** Pre-job or dry-run failure → chain discarded, nothing
persisted, nothing armed; patch fault, named. Chain commit failure → environment
fault, retry next open. Post-job failure → the model has landed (its commit
already resolved) but the ledger does NOT arm; the next open re-stages (merging
to the same model, empty diff, trivial commit), re-runs post, and arms. **Jobs
must therefore be idempotent** - the retry loop exists at every phase, and a
massage re-run over already-massaged data must no-op. This is a stated
requirement on authors, not an aspiration.

**Scope guard.** *(Lifted 2026-09-04: the ADR-0042 mixed extension landed, so a
job-carrying patch may seed data docs beside its class models - one patch can
carry model, seeds, and jobs at once, all through the same one commit. The
`applyPatch` guard stands: the direct path has no transaction to stage a job
through. One inherent limit worth stating: a `preApply` job runs before its own
patch stages, so it cannot use the class that patch introduces - seeds and
`postApply` jobs can.)* As originally ruled: a job-carrying patch had to be
class-model-only in its `docs`, refused at load, loudly, until the mixed
extension landed.

## Consequences

- The ADR-0042 taxonomy gains its third arm: *patch fault → attach a massage job*.
- Memory bounds the massage: staged writes live in memory until commit (ADR-0039's
  guidance - size transactions like batches). A migration over very large classes
  should transform in place-preserving steps or wait for a streaming extension.
- Independent double-migration across devices is expected, not an error: the
  consumer gate makes a trailing device migrate on its own rather than pull the
  migrated documents, so two devices can produce equal-content revisions of the
  same document under different rev ids - benign conflicts, minimized by the
  idempotency requirement (skip-if-done writes nothing).
- `~sys` patches are untouched; the system path carries no jobs.
