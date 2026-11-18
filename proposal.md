# Proposal — a code-defined, statically typed data model for DocStack

Status: proposed · Date: 2026-11-15 · Part of **DocStack 2.0** (`2.0.md`) · Scope:
`@docstack/shared`, `@docstack/client`, `@docstack/react`, new tooling (CLI)

This is the authoring track of 2.0 and the whole of 2.0.0's consumer-visible surface
(`2.0.md` §6). It ships on today's TypeScript engine and must survive the engine swap
(`ports.md` §10 phase 4) without a further breaking change. `2.0.md` owns the release:
version policy, the full breaking-change inventory, and the decision to drop the
embedded-JS port track.

**For the IDE agent.** Read `2.0.md` and `AGENTS.md` first and follow them (package responsibilities, no
cross-package tests in `shared`, no release builds). Every claim about current behaviour
below was checked against the source on `main` at the date above; file references are
given so you can re-verify before changing anything. Where something still needs
checking, it is marked **VERIFY**.

---

## 1. The problem

Applications cannot get static types for their documents. The data model is real and
enforced at runtime, but the types it implies are invisible to TypeScript:

- A consumer's model is written as **untyped JSON inside patches** (see
  `packages/examples/react-todo/src/App.tsx`, `PATCHES`).
- The Zod schema is **built at runtime** from the stored `AttributeModel`s
  (`packages/client/src/core/attribute.ts`, `Attribute.setField`) and assembled per class
  (`Class.schemaZOD`). Nothing is known about it at compile time.
- So the public surface is untyped: `Class.addCard(params: {[key: string]: any})`,
  `getCards(...)` → `Document[]`, `useClassDocs(stack, className)` → `Document[]`.

The goal is to give developers `Todo`, not `Document`, **before build**, without giving up
anything DocStack already guarantees.

## 2. What already exists (and must not be re-invented)

The proposal is an authoring/typing layer over machinery that is already correct. Do not
replace any of it.

| Existing mechanism | Where | Relevance |
|---|---|---|
| Consumer patches: semver-ordered chain supplied by the app (`StackOptions.patches`) | `shared/src/types.ts` (`Patch`), `client/src/core/stack.ts` (`applyConsumerPatches`) | The emission target of this proposal. |
| Patch ledger is device-local; patch-seeded docs (class models) are rebuilt from code on each device and never replicated | ADR-0040 ("schema travels in the app, never in the database"), `client/src/core/sync/internal-docs.ts` | The schema is **already source-level**. We only type it. |
| A class patch **merges** into the stored model; `schema: { attr: null }` drops an attribute | ADR-0037, ADR-0038 | Generated patches are deltas, not restatements. |
| Eager propagation: a model change runs `applySchemaDelta` over existing docs; `add` fills only docs lacking the key | ADR-0036, ADR-0038 | No per-document version stamps or lazy upcasting needed. |
| Sync gate compares system **and consumer** patch versions; a trailing device refuses (`SyncSchemaMismatchError { scope: "consumer" }`) | ADR-0040 | Covers offline/stale devices. |
| A chain applies through one internal transaction | ADR-0042 | Generated multi-patch chains keep atomicity. |
| `preApply` / `postApply` one-shot jobs on a patch (data migrations) | ADR-0044, `Patch.preApply/postApply` | The "Alembic `op.execute`" equivalent already exists. |
| Patch deferral when a patch writes encrypted attributes on a locked stack | ADR-0041, `stack.ts` `deferredPatches` | Must keep working for generated patches. |
| `simple` and `ephemeral` classes | ADR-0028, `ClassModel` | Escape hatches; see §7. |
| Runtime model changes: `Class.create`, `addAttribute`, `modifyAttribute`, `removeAttribute` | `client/src/core/class.ts` | Stay public, stay untyped (§7). |

Comparison with Alembic, for orientation: the revision chain, autogenerate and reviewed
migration files carry over. Alembic's "diff against the live database" does **not** —
here the model is rebuilt from code, so the baseline is the **fold of the patch chain**
(closer to Django's migration state).

## 3. Goals and non-goals

**Goals**
1. A declarative, code-level model definition from which TypeScript types are inferred
   with **no codegen step** (types can never be stale).
2. The same definition **emits the `ClassModel` documents** DocStack already consumes, so
   the runtime and the type system cannot diverge.
3. An `autogenerate` command that diffs the code model against the folded patch chain
   and writes a **delta patch** (ADR-0038 semantics).
4. Typed read/write surfaces in `@docstack/client` and `@docstack/react`.
5. A deterministic **canonical model hash**, computed from the definition, usable by the
   datamodel-hash gate under evaluation in `ROADMAP.md`.
6. Be the 2.0 authoring surface: typed authoring is the documented path from 2.0.0 on,
   and the same surface keeps working unchanged once the Rust core replaces the engine
   beneath it (`2.0.md` §2).

**Non-goals**
- Replacing patches, the ledger, propagation, or the sync gate.
- Typing runtime-created classes or `simple` classes.
- A query-builder ORM. Mango selectors / the SQL query engine stay as they are; only
  selector *field names* may get typed later (§9, open question).
- Rollbacks (`down`). In a replicated store a rollback cannot be applied everywhere;
  removals stay two-phase (deprecate, then drop with `null`).

## 4. Authoring API (sketch)

Placement: definition builders, type mapping, and the pure fold/diff/hash functions in
`@docstack/shared` (runtime-safe, used by client, react and the CLI). Typed wrappers in
`@docstack/client` / `@docstack/react`. Commands, file I/O and prompts in the separate
`@docstack/cli` package (§12) — no CLI code or Node-only dependency enters `shared`.

```ts
import { defineClass, a } from "@docstack/shared/model";

export const Todo = defineClass("Todo", {
  description: "A task to be completed",
  attributes: {
    title:     a.string({ mandatory: true, maxLength: 200 }),
    completed: a.boolean({ defaultValue: false }),
    priority:  a.enum(["low", "mid", "high"] as const),
    tags:      a.string({ isArray: true }),
    owner:     a.foreignKey({ targetClass: "User" }),
    estimate:  a.decimal({ precision: 2, min: 0 }),
  },
});

export type TodoDoc = InferDoc<typeof Todo>;      // stored / read shape
export type TodoInput = InferInput<typeof Todo>;  // addCard / create shape

export const model = defineModel({ classes: [Todo /*, User, ... */] /*, domains: [...] */ });
```

`defineClass` returns a frozen object carrying:
- `name`, `description`, flags (`parentClass`, `ephemeral`; not `simple`, see §7),
- the attribute specs with their literal config preserved at the type level,
- `toClassModel(): ClassModel` — the exact document shape `applyPatch` expects
  (`_id`, `"~class": "class"`, `name`, `schema: {[name]: AttributeModel}`, `triggers`).

Domains (`DomainModel`, relations `1:1 | 1:N | N:1 | N:N`) get a `defineDomain` with the
same pattern; lower priority than classes.

## 5. Type mapping — must mirror `Attribute.setField` exactly

The runtime validator is built in `attribute.ts` `setField`. The static mapping must
produce the same accepted shapes. Current runtime behaviour:

| `type` | Runtime Zod (today) | Static TS type |
|---|---|---|
| `string` | `z.string()` (+`.max(maxLength)`) | `string` |
| `integer` | `z.number().int()` (+min/max) | `number` (TypeScript has no integer type) |
| `decimal` | `z.number()` (+min/max, precision refine) | `number` |
| `boolean` | `z.boolean()` | `boolean` |
| `object` | `z.object({})` | `Record<string, unknown>` |
| `enum` | `z.enum(values.map(v => v.value))` | union of the literal values |
| `foreign_key` | `z.string()` + async existence refine | `string` (doc id; optionally branded `Id<"User">`) |
| `reference` | `z.string().min(1)` | `string` |
| `date` | **no case — throws `Unsupported schema type`** (case is commented out) | see §8 |

Modifiers, applied in this order in `setField`:
1. `defaultValue` → `.default(v)`
2. `isArray` → `z.array(field)` → static `T[]`
3. not `mandatory` → `.nullable().optional()` → static `T | null | undefined` (optional key)

Two derived types:
- **`InferDoc`** (what reads return): base `Document` fields + each attribute; optional
  attributes may be absent or `null`. Note `Class.validate` only checks
  `safeParseAsync(...).success` and **discards the parse output**, so Zod defaults are not
  what fills stored values — type reads by the stored shape, not `z.output`.
- **`InferInput`** (what `addCard` accepts): an attribute is required only when it is
  `mandatory` **and** carries no `defaultValue`.

**Answered 2026-11-15, and then fixed.** The question was where defaults are filled.
Measured: nowhere. `Attribute.getEmpty` had exactly one caller, `applySchemaDelta`
(`client/src/utils/index.ts` ~L23), which is propagation, so a `mandatory` attribute
carrying a `defaultValue` validated (Zod applies the default while parsing, and
`Class.validate` reads only `.success`) and stored no key at all - the declaration was
decorative.

**The engine now writes a declared default on a document's first write**, so the
inference splits into two rules rather than one:

| Declared | Required on a write | Present on a read |
|---|---|---|
| `mandatory`, no default | yes | yes |
| `mandatory` + default | **no** - the omission validates | **yes** - the engine fills it |
| default, not mandatory | no | **yes** - the engine fills it |
| `mandatory` + default + `isArray` | **yes** | yes |
| default + `isArray`, not mandatory | no | **no** |
| neither | no | no |

The `isArray` rows are not an inconsistency. Modifiers apply `defaultValue` **before**
`isArray`, so `z.array(field.default(v))` defaults the *members* and never the array;
verified directly against Zod. There is no sound document-level value to write, so the
engine fills nothing, and a mandatory array with a default still rejects `undefined` and
stays required.

What a read promises is what the current engine creates. A document written before
defaults were applied on create may lack the key; that is a migration concern, and
`docstack doctor` (§12.2) is where it should be reported.

**Single source of truth.** Implement the mapping once as a pure function
`attributeSpecToZod(spec)` in `shared` and make `Attribute.setField` delegate to it
(keeping the `foreign_key` refine and the `fieldCache` in client, since the refine closes
over the class/stack). Add a type-level test (`expectTypeOf` / `tsd`) per row of the
table and a runtime test asserting that the zod built from `toClassModel()` accepts and
rejects the same fixtures as the static type.

## 6. Patch emission and `autogenerate`

### 6.1 Baseline = folded chain
Fold the app's existing patch chain in version order, applying ADR-0038 merge semantics
per class doc (`schema` merged per key, `null` deletes). The result is "the model the
last patch produces". This is a pure function over patch JSON — no database. Reuse the
client's own merge logic if it can be extracted from `applyPatch`; do **not** write a
second, divergent merge.

**Implemented 2026-11-15** as `foldPatchChain`. The merge *was* extractable: it was
`ClientStack.mergePatchSchema`, already pure and already shared by `applyPatch` and the
ADR-0042 chain staging, so it moved to shared and the client now delegates to it.

Two rules the sketch above does not state, both taken from the engine rather than
invented:

- **`_rev: "auto"` is what makes a patch document merge.** Both `applyPatch` and
  `stagePatch` merge only for that marker; any other document is written as authored,
  the fresh-insert case, which *replaces*. The fold reproduces both, and a generated
  delta therefore has to carry the marker or it would conflict instead of merging.
- **Order is semver, through the same comparator the engine sorts with** (`semver`,
  now a dependency of shared). String ordering would put `0.10.0` before `0.9.0` and
  fold a different baseline. A version `semver` cannot parse is refused rather than
  guessed at.

### 6.2 Diff and emit
`docstack revision --autogenerate -m "add priority"`:
1. Load the code model (`defineModel` export) and the patch chain (a module exporting
   `Patch[]`, or a `patches/` directory, one file per version).
2. Diff (`jsondiffpatch` is already a client dependency) per class:
   - new class → full `ClassModel` doc
   - added/changed attribute → `schema: { attr: AttributeModel }`
   - removed attribute → `schema: { attr: null }`
   - removed class → **do not auto-emit**; print a warning (class removal semantics are
     not defined by an ADR yet)
3. Write `patches/<version>.ts` exporting a `Patch` with `"~class": "patch"`, bumped
   semver (minor by default, flag to override), `changelog` from `-m`, only the delta
   docs, and commented `preApply`/`postApply` stubs.
4. `docstack revision --check` exits non-zero if code model ≠ folded chain (CI guard;
   catches "edited the model, forgot the patch" — the failure mode ADR-0037 describes).

Generated patches must be readable and reviewable: deterministic key order, one
attribute per line where possible.

### 6.3 Encrypted attributes
A generated patch that adds/changes an `encrypted: true` attribute is subject to
deferral on a locked stack (ADR-0041). The generator needs no special handling, but the
test suite must cover one generated patch with an encrypted attribute through the
locked → unlock → replay path (reuse `locked-sync.test.ts` patterns).

### 6.4 Data-migration jobs
`PatchJob.content` is today a **string** evaluated as a `~Job`-style body
(`execute(stack, params, job)`). **Decided:** generated patches reference jobs **by
handler name** (§13), resolved from compiled handlers registered with the model. The
generator never serializes functions with `fn.toString()` (closures and imports would
silently break). String `content` remains valid as a runtime handler when the optional
runtime plugin is installed (`ports.md` §5).

## 7. Typed runtime surface

Additive only; existing untyped APIs stay.

- `@docstack/client`: `stack.typed(model)` (or `TypedClass<C>` wrapper over `Class`)
  exposing `addCard(input: InferInput<C>)`, `getCards(...): Promise<InferDoc<C>[]>`,
  `get(id)`, `updateCard(id, patch: Partial<InferInput<C>>)`.
- `@docstack/react`: generic overloads, e.g.
  `useClassDocs(stack, Todo)` → `InferDoc<typeof Todo>[]`, keeping the
  `(stack, className: string)` signature returning `Document[]`.
- `StackOptions` may accept `model` in addition to `patches`; if present, at open the
  client can assert the folded chain matches `model` (dev-mode warning, not an error).

Escape hatches, deliberately untyped:
- runtime `Class.create` / `addAttribute` / `modifyAttribute` / `removeAttribute`;
- `simple` classes (no schema by definition, ADR-0028);
- any class not present in the code model.

A typed wrapper over a class whose stored model has drifted from the code model (by
runtime edits) is unsound. Mitigation: §8 hash check in dev mode.

**The wrapper reads back after a write, and should not have to.** `createDoc` returns the
pre-pipeline draft with the real `_id` and `_rev` stamped on it, not the document the
pipeline wrote: PouchDB hands the pipeline its own copy, so a declared `defaultValue`, the
`~createdBy` / `~updatedBy` attribution and encryption are all absent from the value the
caller receives. The untyped API has always returned that draft; typing it made the gap a
lie, since `InferDoc` promises the stored shape. `typedClass` therefore re-reads by id
after `addCard` and `updateCard`, at the cost of one extra read per typed write.

**Open:** have the write path return what it wrote, after which the re-read goes away. It
is a change in the core write path with a cost on every create, so it is recorded rather
than taken.

**Verified 2026-11-15, open behaviour question: the runtime path has no encryption
precondition, and its failure handling hides that.** `addAttribute` mutates the live
object first — `this.attributes[name]`, `this.model.schema`, `this.schemaZOD` — and only
then persists through `stack.updateClass` (`client/src/core/class.ts` ~L537). On a locked
stack, a refusal is reachable: propagation's writes re-enter the pipeline as ordinary
document writes (`stack.db.bulkDocs` in `plugins/pouchdb.ts` ~L373) and the lock refusal
sits on that path (~L522, which exempts patch writes only). Whether it fires depends on
which class the pipeline resolves for those propagated documents — it reads the *stored*
class, which does not carry the new attribute yet, so the refusal may come from the
mutated live instance being served out of the class cache rather than from the schema
being written. **Read from the source, not yet observed end to end.** Either way the
caller cannot tell: `addAttribute` logs and returns `this`, so on any refusal the caller
holds a `Class` whose schema claims an attribute the database does not have, with no
error raised.

Two consequences for the escape hatch, whichever way the behaviour question is decided:

- **The ordering and the swallowed error are the defect, not just the missing check.** Any
  refusal (a conflict, parent-class validation, the lock) leaves the in-memory class lying.
  A precondition added inside a method that returns `this` on refusal would be invisible.
- **Deferral is not available here.** ADR-0041 deferral is safe only because the app
  re-supplies the same patch list at every open, so a held-back patch is re-offered
  (`applyConsumerPatches`' own doc comment: "no persisted state to drift"). An imperative
  call is never re-offered, so the only coherent remedy is refusing before anything
  mutates. The predicate already exists — `patchBlockedByLock` / `patchNeedsDocumentKey`
  in `core/stack.ts` ~L1915 answer "would this schema need a key this device lacks".
- **Do not move the check down to the shared seam.** The chain converts a
  `StackLockedError` into a deferral around *staging* only (`core/stack.ts` ~L1743);
  faults at commit are rejected as-is by design. A precondition relocated to the
  class-model branch of the write interception would therefore turn patch deferral into a
  hard failure.

## 8. Canonical model hash and known defects found while reading

**Hash.** `model.hash()` and per-class `Todo.hash()`: SHA-256 over a canonical
serialization (sorted keys) of semantic fields only — attribute names, types, configs —
excluding `_rev`, timestamps, `description`s. This directly answers difficulty (2)
"canonicalization" of the datamodel-hash gate in `ROADMAP.md`, and per-class hashes match
its difficulty (3). Wiring it into the sync marker is **out of scope** here; just expose it.

**2.0 is the window.** Defects 2 and 3 change what validation accepts, so both are breaking
for data already on disk; defect 1 cannot break data (a `date` attribute throws today) but
does change a declared type. All three belong in a major release rather than bolted onto a
minor with a migration story (`2.0.md` §3). A recommendation is given per defect; the call
is the maintainer's, and `docstack doctor` (§12.2) is the natural place to report existing
violations before an app upgrades.

**Defects / inconsistencies to resolve before or alongside this work.** 1, 2, 4 and 5 are
resolved in phase 1 (`c8373d3`); 3 is open. The recommendations are kept as the record of
why each went the way it did.
1. `date` attribute type is declared in `shared/src/types.ts` (`AttribruteTypeDate`, note
   the typo) but `setField` has no `date` case → building a class with a `date` attribute
   throws. Decide the stored representation (ISO string vs epoch number; config allows
   `string | number`) before exposing `a.date()`. *Recommended:* an ISO-8601 string, which
   sorts correctly under the byte-ordered key semantics the stores already require (android
   ADR-0001) and round-trips through JSON without a parse step; rename the type in the same
   pass, since 2.0 is the only cheap window for it. If `date` slips past 2.0.0, remove the
   declaration rather than ship a type that throws.
   *Measured on zod 4.4.3, 2026-11-15:* the commented-out case was `z.date()`, and that is
   not a viable way to finish it. A `Date` passes `z.date()`, but a document body
   JSON-round-trips, so the stored and re-read value is the ISO string
   `"2026-11-15T14:10:03.567Z"`, which `z.date()` **rejects**. Uncommenting it would make
   read-modify-write fail on every date attribute: `get` then `updateCard` with the
   unmodified document throws. `z.iso.datetime()` accepts that same string, so the ISO
   representation is the one that closes the loop.
2. `enum` config allows `value: string | number | object`, but runtime uses `z.enum`,
   which only accepts strings. Either restrict the type to strings or switch to
   `z.union(literals)`; the static mapping must follow whichever is chosen. *Recommended:*
   restrict the config to `string` and keep `z.enum` — the narrower contract is the one the
   runtime has actually enforced all along, so no stored value changes meaning. Switch to
   `z.union` only if numeric enums have a real consumer.
   *Measured on zod 4.4.3, 2026-11-15:* a numeric enum is not merely unspecified, it is
   dead. `z.enum([1, 2, 3])` constructs without complaint and then rejects **every** input,
   `1` and `"1"` alike, so an attribute declared that way today accepts nothing and no app
   can be relying on it. Narrowing the config to `string` therefore changes no stored data,
   and `z.union([z.literal(1), ...])` is the only shape that would make numeric enums work
   at all. Note the config also carries a nested `type` field naming the member type
   (`AttributeTypeEnum` in `shared/src/types.ts`), which is evidence the original intent was
   typed members; whichever option is chosen, that field should either drive the mapping or
   be dropped.
3. ~~`integer` does not use `.int()`; decimals pass validation.~~ — **fixed 2026-11-15**,
   on the shipping line as well as in the extracted mapping. A document already holding a
   decimal in an integer attribute fails validation on its next write. The static type
   stays `number`, TypeScript having no integer type, which is exactly why leaving the
   runtime loose was the worse option: the type promised nothing and the validator
   enforced nothing. `docstack doctor` reporting the rows that would newly fail (§12.2) is
   still worth building for apps upgrading.
4. `object` uses `z.object({})`, which in Zod 4 strips unknown keys on parse. Harmless
   today because parse output is discarded (§5), but `attributeSpecToZod` must use
   `z.record(z.string(), z.unknown())` or `z.looseObject({})` if output is ever used.
5. ~~Zod version skew~~ — **fixed 2026-11-15**: `shared` declares Zod as a **peer
   dependency** (`^4.1.5`, the client's own floor) and keeps it as a dev dependency so
   the workspace still builds. One copy of Zod in an application's graph, so there is one
   schema identity.

## 9. Open questions (maintainer decides)

1. ~~Package placement~~ — **decided**: builders and pure model logic in
   `@docstack/shared`; CLI in a separate `@docstack/cli`, fronted by `create-docstack`
   (§12).
2. ~~Patch file layout~~ — **decided 2026-11-15**: `patches/<semver>.ts`, one module per
   revision exporting a `Patch` as its default, plus a generated `index.ts` exporting the
   ordered array. The file name carries the version, so the chain is readable in a diff
   and orderable without loading anything, and a new revision is a new file rather than
   an edit to a shared array - which the generator would otherwise have to parse and
   rewrite.
3. ~~Job authoring~~ — **decided**: compiled handlers by name, runtime strings via the
   optional plugin (§6.4, §13).
4. Branded ids for `foreign_key` (`Id<"User">`) — nicer, but every id from untyped paths
   needs a cast.
5. Typed selectors: type Mango selector keys against `InferDoc` now, or later.
6. Should `StackOptions.model` replace `patches` eventually (patches generated at build
   time), or always remain alongside them?
7. ~~Should the engine fill declared defaults on create?~~ — **decided and done**
   2026-11-15, on the shipping line. A declared default lands on a document's first
   write, which is what let `InferDoc` promise the value (§5). Still worth building:
   the `doctor` report for documents written before it.
8. ~~Do all the §8 data-shape fixes land in 2.0.0, or does `date` slip?~~ — **decided**:
   `date` landed in phase 1 as an ISO-8601 UTC string (`format: "date"` for date-only).
   `integer` is fixed too, on the shipping line, so none of the three is open.
9. Should a typed **read** reject an undeclared field? `InferDoc` intersects `Document`,
   which carries `[key: string]: any`, so `doc.titel` is `any` rather than an error. The
   index signature is there because documents really do hold fields no class declares -
   `~createTimestamp`, trigger output, another client's attributes. Omitting it from
   `InferDoc` alone would catch typos and would also make `InferDoc` describe less than
   the engine stores; both halves of that trade are real.

## 10. Implementation plan (phased; each phase mergeable alone)

1. ~~**Mapping extraction**~~ — **landed 2026-11-15** (`c8373d3` on `feat/2.0`).
   `attributeSpecToZod` in shared, `setField` delegates, keeping the foreign-key refine
   and the field cache in the client. Defects 1, 2, 4 and 5 resolved; defect 3 left open
   on purpose. The client suite passes unchanged, plus three new tests for the date round
   trip, instant-compared bounds, and the enum refusal.
2. ~~**Builders + inference**~~ — **landed 2026-11-15**. `defineClass`, `a.*`,
   `InferDoc`, `InferInput`, `toClassModel`, `canonical`, `hash`, plus `defineModel`
   with per-class hashes. Type-level tests cover every mapping row and modifier
   (`packages/client/tsconfig.types-test.json`, `npm run test:types`); the round-trip
   test drives `defineClass → toClassModel → Class.buildFromModel → validate` over
   accept and reject fixtures and checks the hash ignores descriptions. Deferred within
   this phase: `defineHandler` and the `handler?: string` schema change (§13), and
   `defineDomain`.
3. ~~**Fold + diff library**~~ — **landed 2026-11-15**. `foldPatchChain(patches)` and
   `diffModel(folded, model)` in shared, with the ADR-0038 merge extracted from the
   client as `mergePatchSchema` so the engine and the fold cannot diverge. Tested
   against hand-written chains, including ADR-0037's "lost attributes" scenario, `null`
   drops, `_deleted`, semver ordering (`0.10.0` after `0.9.0`), the refusal on an
   unparseable version, a new class emitted whole, an added/changed attribute, a dropped
   one emitted as `null`, a removed class warned about, and the no-op case `--check`
   relies on.
4. ~~**CLI**~~ — **landed 2026-11-15** for `revision`. `@docstack/cli` (bin `docstack`)
   with `revision --autogenerate` and `revision --check`, 11 tests through `node:test`
   driving the real command against throwaway projects, including the generated files'
   contents. `init`, `doctor` and `docs` are not built, so `create-docstack` and the
   "Start here" line still wait on `init` (§12.2, §12.3).
5. ~~**Typed client/react surface**~~ — **landed 2026-11-15**. `typed(stack, model)` gives
   one `TypedClass` per declared class keyed by name, `typedClass(stack, Todo)` wraps one,
   and `useClassDocs(stack, Todo)` types its documents while `(stack, "Todo")` is
   unchanged. Type-level tests include six calls the compiler must reject, so they fail the
   build if they ever stop erroring.

   `examples/react-todo` is ported, and doing it found three things the wrappers alone
   could not (§7.1). Two were defects in what the packages ship rather than in the design:

   1. **A model module could not be loaded in Node.** The guide said to import the
      builders from `@docstack/client`, whose main entry carries the engine and PouchDB
      with it - so `docstack revision`, which loads the model in Node, failed on the
      storage layer resolving rather than on anything about the model. Fixed with
      `@docstack/client/model`: the same names, declarations only, 28 KB, importing
      nothing but `zod` and `semver`. The main entry still re-exports them for code that
      already has the engine.
   2. **A generated patch imported an internal package.** `@docstack/shared` is not a
      dependency an application has, so the emitted `import type { Patch }` would not
      compile in a project that installed only the client and the CLI. The emitter now
      targets `@docstack/client/model`, with `--types-import` for a project that depends
      on a different DocStack package.
   3. **The typed surface was `any` in a consumer that restricts `compilerOptions.types`.**
      `Document` was declared through the ambient `PouchDB` namespace, which comes from
      `@types/pouchdb` and is only in a program that includes it - and the Vite React
      template sets `"types": ["vite/client"]`, as does any project listing its own. In
      such a program `Document` resolved to `any`, `skipLibCheck` hid the cause, and
      `InferDoc` - an intersection with `Document` - was `any` too: every call typechecked
      and nothing was checked. Verified at the value level, not by `Equal<>`, which cannot
      see `any`. `Document`, `RelationDocument` and `Patch.docs` are now self-contained
      (structurally identical: `PouchDB.Core.Document<T>` is `T & { _id: string }`), and
      `@types/pouchdb` became a real dependency of `@docstack/shared` so the
      engine-facing signatures still resolve where they are used. This is the one worth
      remembering: a typed layer that silently degrades to `any` is worse than no typed
      layer, because it reads as a guarantee.
6. ~~**Docs**~~ — **landed 2026-11-15**. [Declare your model in code]
   (`packages/docs/docs/guides/code-defined-model.md`) as the guide, and
   `specs/adr/0048-the-data-model-is-declared-in-code.md` recording the decisions here and
   the engine behaviour they changed. Pages the behaviour changes made wrong were
   corrected in the same pass: the attribute reference's type table, the schema engine's
   mapping and its claim about defaults, and the modelling guide's type list.

All six phases are 2.0.0 (`2.0.md` §6); each is still mergeable on its own, and nothing here
waits on the Rust core.

Tests go in the consuming package (per `AGENTS.md`). Do not run cross-package or release
builds automatically.

## 11. Acceptance criteria

- ~~`examples/react-todo` defines its model with `defineClass`, its patches are generated,
  and `useClassDocs(DB, Todo)` returns typed docs with no `any` in app code.~~ — **met
  2026-11-15.** `src/model.ts` declares `Todo` with four attributes covering the three
  behaviours this release fixed (a filled default, an enum, a date); `src/patches/1.0.0.ts`
  is generated and `1.0.1.ts` is a hand-written data patch in the same chain; `App.tsx`
  reads through `useClassDocs(DB_NAME, Todo)` and writes through `typedClass`, with no
  `any` in its source and the priority picker built from
  `Todo.attributes.priority.config.values`. `tsc -b` is clean. Note that reading an
  *undeclared* field still gives `any`, because `Document` carries
  `[key: string]: any` - documents legitimately hold fields no class declares. Narrowing
  that on the typed read path is open (§9.9).
- Changing an attribute in the model without regenerating fails `revision --check`.
- A generated patch adding an attribute behaves identically to a hand-written ADR-0038
  delta patch, including on a locked stack with deferral and replay.
- The Zod schema built at runtime from `toClassModel()` and the static type agree on a
  shared fixture set for every attribute type and modifier combination.
- The 1.x → 2.0 migration guide (`2.0.md` §5) covers every §8 defect actually fixed, with
  the `docstack doctor` check an app runs before upgrading.
- ~~`docstack revision --check` runs in CI for `examples/react-todo`, so the guard is
  demonstrated and not just documented.~~ — **met 2026-11-18.**
  `.github/workflows/tests.yml` is the repository's first test workflow: the `shared`,
  `client`, `react` and `cli` builds, the client's type-level tests under
  `compilerOptions.types: []`, the CLI suite, the client's Playwright suite, and the
  example's `tsc -b` and `revision:check`, on every pull request and every push to `main`
  and `develop`. The workflow header says what is *not* in it - the server, which does not
  compile; the workbench smoke test; abe; the adapter submodules; and linting, which
  ESLint 9 refuses because the packages' `lint` scripts predate it - and what each would
  need. Rehearsed end to end on ext4 before being written: `npm ci`, the builds, 166
  client tests in 3.4 minutes under CI settings, 14 CLI tests, the example installed from
  scratch and both of its checks.

  Writing it was worth more than the badge, twice over. The root lockfile turned out not
  to know about `@docstack/cli` at all, and still carried shared's pre-2.0 `zod`
  dependency, so `npm ci` failed on this branch before running anything - regenerated and
  committed with it. And running `revision:check` through the *installed bin* rather than
  by path found that the bin did nothing and exited 0: `npm` installs a bin as a symlink,
  so `process.argv[1]` is the link while `import.meta.url` is the resolved target, and the
  entry-point guard comparing them as URLs never matched. The check would have passed in
  CI without checking anything. Both sides are real paths now, and a test invokes the
  built entry through a symlink the way `npm` does.

## 12. Tooling packages, naming and agent discoverability

### 12.1 Package layout (decided)

| Package | Role | Depends on |
|---|---|---|
| `@docstack/shared` | Builders, type mapping, fold/diff/hash. Pure, runtime-safe, browser-safe. **No `bin`, no Node-only deps.** | zod |
| `@docstack/cli` | The real tool. `bin: { "docstack": ... }`. Commands, file I/O, prompts, TS model loading (jiti or tsx). No model logic of its own — it calls `shared`. | `@docstack/shared` |
| `create-docstack` | Entry point for `npm create docstack@latest`. A few lines: forwards argv to `@docstack/cli init`. | `@docstack/cli` |

Why `shared` must not host the CLI: it is installed in every app (browser included), so CLI
dependencies would ride along in every dependency graph and risk entering a bundle; CLI
fixes would force `shared` releases cascading to every runtime package; and a `bin` inside a
library is hard for humans and agents to discover.

### 12.2 Command surface (planned; this proposal only implements `revision`)

- `docstack init` — detect target (client app: React/Vite, Tauri, Android WebView via
  Permetic; or server: Node, Strapi), install the right `@docstack/*` packages, scaffold
  `model.ts`, `patches/`, and the `StackProvider` / server wiring. Writes the agent section
  (§12.4).
- `docstack revision --autogenerate | --check` — §6. **Implemented.** Conventions for
  the model and patch paths with flags to override, the patch target defaulting to the
  project's package name, `--bump` and `--version` for the next version, and no silent
  fallback: an unresolvable path names every location tried.
- `docstack doctor` — model vs folded chain, Zod version alignment, adapters present, and
  the pre-upgrade scan for documents the §8 data-shape fixes would newly reject.
- `docstack docs [topic]` — print the relevant section of `llms.txt` / point to docs.

### 12.3 Naming and discoverability — the goal is that an agent's *first* install is ours

Constraint: the unscoped npm name `docstack` is **taken by an unrelated package** (a
markdown-stub CLI, v0.2.0, published 2026-06-04, different maintainer). Agents asked to "add
DocStack" commonly guess `npm install docstack` and would install it.

Measures, in priority order:

1. **Use the `create-*` convention.** `npm create docstack@latest` mirrors
   `npm create vite` / `create-next-app`, which agents have seen extensively — it is the
   command they reach for when asked to "set up X".
   **VERIFY availability before anything else:** `npm view create-docstack` (and
   `@docstack/create`, `create-docstack-app`). If free, publish `create-docstack` and
   reserve the two aliases as forwarders. A registry lookup during drafting returned an
   error rather than a clear 404, so availability is not confirmed.
2. **One identical "Start here" line at the top of every entry point**, because agents
   often read only the first lines:

   > **Start here:** `npm create docstack@latest` — do not install the unscoped
   > `docstack` package; it is unrelated.

   Places: GitHub README (top), `docs/llms.txt` and `docs/llms-full.txt` (first lines),
   README and `description` of every published `@docstack/*` package. Add the `docstack`
   keyword and a `homepage` to every `package.json` so npm search leads back here.
3. **Runtime nudge.** In dev mode, `@docstack/client` / `@docstack/react` opened with no
   model and no patches log once: `No DocStack model found. Run: npx @docstack/cli init`.
   Agents read console/test output more reliably than docs.
4. **Try to acquire `docstack`.** Ask the current owner about a transfer. npm has a
   package-name dispute process, but it rarely forces a transfer from an active owner —
   do not plan around it. If acquired, publish it as a thin alias of `@docstack/cli` so
   the wrong guess becomes the right one.

### 12.4 Agent instructions written by `init`

`docstack init` appends (idempotently, between marker comments) a short DocStack section to
the app's `AGENTS.md` (and `CLAUDE.md` / `GEMINI.md` if present): where the model lives, that
patches are **generated** (`docstack revision --autogenerate`, never hand-edited), that CI
runs `docstack revision --check`, and the docs/`llms.txt` link. This keeps any later agent on
the model-first workflow.

## 13. Handlers declared with the model (compiled layer)

Triggers and patch jobs get a **compiled** layer alongside the existing runtime one. The
full two-layer design (resolution order, optional runtime plugin, fail-closed rule,
untrusted-input rules) is in `ports.md` §5; this section covers only what the model API
adds.

```ts
import { defineHandler, defineClass, a } from "@docstack/shared/model";

export const stampCompletion = defineHandler("todo.stampCompletion", {
  kind: "trigger",
  run: async (doc: TodoDoc, ctx) => (doc.completed ? { ...doc, completedAt: ctx.now() } : doc),
});

export const Todo = defineClass("Todo", {
  attributes: { /* ... */ },
  triggers: [{ name: "stamp", order: "before", handler: stampCompletion }],
});

export const backfillPriority = defineHandler("todo.backfillPriority", {
  kind: "job",
  requiresKey: false,
  execute: async (stack, params) => { /* data migration */ },
});
```

- `defineHandler` returns `{ name, kind, fn }` typed against the class it targets
  (`InferDoc<C>` in and out for triggers).
- `toClassModel()` emits `TriggerModel` entries with a **`handler` name reference**
  instead of `run` source. `run` strings remain accepted and are treated as runtime
  handlers. **Schema change:** add optional `handler?: string` to `TriggerModel` and
  `PatchJob` in `shared/src/types.ts`; exactly one of `handler` / `run` (trigger) or
  `handler` / `content` (job) must be set — validate at patch apply.
- `defineModel({ classes, handlers })` collects handlers; `StackOptions` receives the
  handler registry (`handlers: model.handlers`). The client resolves compiled handlers
  first; an unresolved name with no runtime plugin is an error at open (fail closed), not
  at first write.
- `docstack revision --autogenerate` emits `preApply` / `postApply` as handler references
  and `--check` fails if a referenced handler is not registered in the model.
- Handler names are stable identifiers (namespaced, e.g. `todo.stampCompletion`) and are
  part of the canonical model hash (§8); handler *bodies* are not (they are code, versioned
  by the app build).

Implementation goes in phase 2 (builders) and phase 5 (client resolution) of §10; the
runtime extraction itself is tracked in `ports.md` (spike S9).
