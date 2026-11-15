# ADR-0048 — The data model is declared in code, and the patch chain is generated from it

Status: accepted · Date: 2026-11-15 · Proposal: `proposal.md` · Release: `2.0.md`

## Context

An application's data model was real and enforced, and invisible to TypeScript. A
consumer wrote it as untyped JSON inside patches; the Zod validator was assembled at
runtime from the stored `AttributeModel`s; and the public surface was therefore
`addCard(params: {[key: string]: any})` returning `Document`. Nothing was wrong at
runtime. Everything above the runtime was guesswork, and the guess that matters is the
one a reviewer cannot see: a model edited without a patch, or a patch that no longer
matches the model the code expects, reaches a device as data the app cannot describe
(ADR-0037 names this failure).

Three things already existed and are not replaced by this record: the consumer patch
chain and its ledger (ADR-0040, ADR-0041), the per-attribute merge that makes a class
patch a delta rather than a restatement (ADR-0037, ADR-0038), and eager propagation over
existing documents (ADR-0036, ADR-0038). This is an authoring and typing layer over
machinery that was already correct.

Reading the engine to build it surfaced defects that made the declaration mean less than
it read like. Those are recorded here too, because fixing them changed stored behaviour.

## Decision

1. **A class is declared in code**, with `defineClass` and the `a.*` attribute builders
   in `@docstack/shared`. One declaration yields the inferred TypeScript types *and*
   `toClassModel()`, the class document the engine already consumes. The declaration is
   the single source of truth, so the types and the validator cannot disagree.
2. **No codegen step.** Types are inferred from the declaration's literal config, which
   the builders capture rather than widen. A generated types file can be stale; an
   inferred type cannot.
3. **One mapping from an attribute to a validator**, `attributeSpecToZod`, in
   `@docstack/shared`. The client's `Attribute.setField` delegates to it. Only what needs
   a live stack stays in the client: the foreign-key existence check and the field cache.
4. **The patch chain is generated, not hand-written.** `foldPatchChain` replays a chain
   into the model it produces, purely, and `diffModel` reports what a patch must carry.
   `docstack revision --autogenerate` writes it; `docstack revision --check` fails CI when
   the model and the chain disagree. The fold applies the engine's own rules, including the
   per-attribute merge, which moved to `@docstack/shared` as `mergePatchSchema` rather
   than being reimplemented.
5. **`_rev: "auto"` is what makes a patch document merge.** Both apply paths merge only
   for that marker and treat any other document as a fresh insert that replaces, so a
   generated delta carries it. This was undocumented and is load-bearing.
6. **Patch files are `<patches>/<semver>.ts` plus a generated index.** The file name is
   the version, so the chain is readable in a diff and orderable without loading
   anything, and a revision is a new file rather than an edit to a shared array that a
   generator would have to parse and rewrite.
7. **Typed surfaces are additive.** `typed(stack, model)` and the `useClassDocs(stack,
   Todo)` overload are new paths; the untyped `Class` API and the name-based hook are
   unchanged, because runtime-created and `simple` classes need them.
8. **A read and a write are typed by different rules.** A write must carry an attribute
   when it is `mandatory` and the engine will not fill it; a read is guaranteed it when
   the attribute is `mandatory` or carries a default the engine writes. An array's
   `defaultValue` is a *member* default, because modifiers apply it before `isArray`, so
   nothing is filled and the key may be absent.
9. **The canonical model hash** is SHA-256 over semantic fields with sorted keys and
   descriptions excluded. Exposed per class and per model; nothing gates on it yet. This
   answers difficulties (2) and (3) of the datamodel-hash gate in `ROADMAP.md`.

### Engine behaviour this changed

Each of these was a case where the declaration did not mean what it read like. All are
breaking for data already stored, which is why they land in a major release (`2.0.md` §3).

- **A declared `defaultValue` is written on create.** It was not: validation accepted the
  omission, because Zod applies the default while parsing and `Class.validate` reads only
  `.success` and discards the output. `mandatory` with a default therefore validated and
  stored nothing. Filled on a document's first write only, so an update cannot resurrect a
  cleared value, and only for attributes that declare one.
- **An `integer` attribute rejects a decimal.** It applied no integer check, so the
  declared type was enforced by nothing and reported by nothing.
- **`enum` values are strings.** `z.enum` accepts nothing else: handed numbers it built
  without complaint and then rejected *every* input, so a numeric enum had never accepted
  a value. The config is narrowed to what the validator always enforced.
- **`date` attributes work**, as ISO-8601 strings in UTC, where they previously threw
  `Unsupported schema type`. A `Date` object cannot be the stored shape: a document body
  round-trips through JSON, so it reads back as a string that `z.date()` rejects, which
  would fail a read-modify-write on the document's own data. Offsets are refused so
  lexicographic order matches chronological order.
- **`object` keeps unknown keys**, through `z.looseObject({})`. `z.object({})` strips
  every key on parse, which is harmless only while the parse output is discarded.

## Consequences

- An application's model lives in its own source, versioned with its code, and the patch
  that installs it is generated from the diff. Reviewing a schema change is reviewing one
  file and one generated patch.
- `@docstack/shared` gains the model builders, the mapping, the fold and the diff, and
  takes `semver` as a dependency so the fold orders a chain exactly as the engine does.
  Zod becomes a **peer** dependency, so an application resolves one copy and therefore one
  schema identity.
- `@docstack/cli` is a new package. It owns paths, versions and files and nothing else;
  every decision about what a patch contains comes from `@docstack/shared`, which the
  client uses too.
- **The typed surface re-reads after a write**, because `createDoc` returns the
  pre-pipeline draft with the real `_id` and `_rev` stamped on it rather than the document
  the pipeline wrote. Filled defaults, the `~createdBy` / `~updatedBy` attribution and
  encryption are all absent from that draft. The untyped API has always returned it;
  typing it made the gap a lie. Having the write path return what it wrote is open, and
  would remove the extra read.
- Mixing runtime class edits with a declared model is unsound by construction, and the
  model hash is the only thing that could detect it. Runtime edits stay supported and stay
  untyped.
- Still open, and recorded in `proposal.md` §9: branded ids for `foreign_key`, typing
  Mango selector keys, whether `StackOptions.model` eventually replaces `patches`, and
  whether the write path should return what it wrote.

## Alternatives rejected

- **Generating a types file from the stored model.** It can go stale between a schema
  change and a regeneration, which is the drift this record exists to remove.
- **Typing the runtime API instead of adding a surface.** `Class.create` and
  `addAttribute` take values decided at runtime; there is nothing for a type to be
  inferred from. Typing them would be a cast dressed as a guarantee.
- **A second merge implementation inside the fold.** Two implementations of the
  per-attribute merge means two sets of schema semantics, one of which is wrong and
  neither of which is obviously so. The existing merge was pure and was extracted instead.
- **`z.date()` for date attributes**, which was the commented-out original intent. It
  rejects the ISO string a document round-trips to, so read-modify-write fails on data the
  engine itself wrote.
