---
title: "Upgrade to 2.0"
description: "What 2.0 changes for an application already running on 0.x or 1.x: the stored-data strictness, the API changes, what to run before you upgrade, and what is still coming."
sidebar_position: 2
---

2.0 makes the data model something TypeScript can see. Most of that is additive — you can adopt it a class at a time — but some of it is **stricter about data you already have**, and those are the parts worth reading before you install anything.

This page covers what changes and what to do about it. The reasoning behind each change is in [ADR-0048](https://github.com/onyx-og/docstack/blob/main/specs/adr/0048-the-data-model-is-declared-in-code.md) and the package changelogs.

## Before you upgrade: find out what would break

```bash
npx @docstack/cli doctor --patches src/patches
```

`doctor` reads your patch chain and lists every attribute whose **stored values 2.0 would newly reject**. You do not need a declared model for this, and you do not need to restructure anything: if your chain is an array in source — `export const PATCHES = [...]`, which is how it was written before 2.0 — point `--patches` straight at that file.

```bash
npx @docstack/cli doctor --patches src/data/schema.ts
```

If one module holds more than one chain, it will refuse to pick between them and tell you how to name one:

```bash
npx @docstack/cli doctor --patches 'src/data/schema.ts#WORKSPACE_PATCHES'
```

A real report looks like this:

```
note: [data] 8 attribute(s) are stricter in 2.0 than when existing documents were written.
  This process cannot read your data - it lives where the application runs - so check
  these where it does, before upgrading. A document that fails is still readable; it is
  the next WRITE that is refused.
    - Profile.createdTimestamp (integer: rejects a decimal, which it used to accept)
    - Settings.theme (enum: accepts only the declared string members; a numeric enum
      used to reject everything)
```

**It cannot check the data itself, and does not pretend to.** Your documents live in a browser's IndexedDB, a native store or a server volume — none of which a terminal can open. The list tells you *which attributes to look at*; running the check belongs in your app, where the database is.

Note what a failure means: a document that no longer validates is **still readable**. It is the next write to it that is refused. So the risk is a user editing an old record, not an app that will not start.

## What is stricter about stored data

Each of these was a case where the declaration did not mean what it read like.

| Attribute | Before | 2.0 |
| :--- | :--- | :--- |
| `integer` | accepted `1.5` — no integer check was applied at all | rejects a decimal |
| `enum` | config allowed numbers, and `z.enum` then rejected *every* value, so a numeric enum had never accepted one | string members only; a non-string raises a named error |
| `date` | threw `Unsupported schema type` when the class was built, so the type was unusable | an ISO-8601 string in UTC; `format: "date"` for date-only. Offsets are refused so lexicographic order matches chronological order |
| `defaultValue` | accepted on a write and **stored nothing** — `mandatory` with a default validated and persisted no value | written on a document's **first** write |
| `object` | stripped unknown keys while parsing | keeps them (`z.looseObject`) |

The first two are the ones to check your data against. `date` and `object` change nothing already stored, and `defaultValue` adds values rather than rejecting them.

**On defaults specifically:** documents written before 2.0 do not have the filled value. A read of such a document gives `undefined` where `InferDoc` promises a value. That is a migration concern rather than a typing one — a `postApply` job in your next patch is the place to backfill, and `doctor` lists the attributes that declare defaults so you know which.

## What changes in the API

- **`Class.get(id)` returns one document, not a one-element array.** The implementation took rest parameters, so its single-id branch could never run. If you wrote `(await cls.get(id))[0]`, drop the `[0]`. Several ids still return an array.
- **A write returns the document it wrote.** `addCard` and `updateCard` used to hand back a draft the pipeline had never touched — missing filled defaults and the `~createdBy` / `~updatedBy` attribution. They return the stored document now. If you re-read after writing just to get the real values, you can stop.
- **A failed write rejects instead of hanging.** `updateCard`, `addOrUpdateCard`, `Class.build` and `Domain.build` were written as `new Promise(async …)`, which never forwarded a rejection: the promise never settled. **Code that never handled a rejection from these will now see one** — most visibly a `conflict` when two writes race for one document. That is the one change here that can surface as a new error in working code, so it is worth a look at your error handling before you ship.
- **These four reject with `Error` objects** rather than bare strings.
- **`createRelationDoc` returns the relation at the revision it was written at**, so a relation that landed is distinguishable from one that did not.

## What changes in packaging

- **Every package goes to 2.0.0 together**, so you can pin `2.x` across `client`, `react`, `shared` and the adapters instead of tracking four version lines.
- **Zod is a peer dependency** of `@docstack/shared`. Install `zod@^4` yourself. This is what makes an application resolve **one** copy: two copies are two schema identities, and a schema built by one and parsed by the other fails in ways that read as a validation bug. `doctor` reports it if you have two.
- **`@docstack/client/model`** is a new entry point carrying the model builders with no engine behind them. Your model file imports from there, because the CLI loads it in Node and the main entry carries the storage layer.
- **If your `tsconfig` sets `compilerOptions.types`, add `"pouchdb"`.** Setting it at all turns off automatic `@types` inclusion, and DocStack's engine-facing types are declared through the ambient `PouchDB` namespace; without it they silently resolve to `any` and `skipLibCheck` hides why. The Vite React template sets it. `doctor` reports this too.

## Adopting the declared model

Nothing above requires it, and the untyped `Class` API is unchanged — runtime-created and `simple` classes still need it. When you are ready:

```bash
npx docstack init          # a starter model, its first patch, the scripts, an AGENTS.md section
```

[Declare your model in code](./guides/code-defined-model.md) is the guide. Two things to know when converting an existing app:

1. **Your existing patches stay.** Generate the next one from the model and leave history alone; `revision --autogenerate` diffs the model against what the chain already produces, so a converted model with matching patches generates nothing.
2. **Do not mix runtime class edits with a declared model on the same class.** `Class.create` and `addAttribute` stay supported and stay untyped, but a typed wrapper describes the class *as declared* — if a runtime edit has changed the stored class since, the types describe something the database no longer holds.

## Still coming

These are part of 2.0 as planned but are **not** in the model-track releases, so they do not affect an upgrade today:

- **An explicit `backend:` option**, selecting the built-in engine or a PouchDB instance, with PouchDB becoming an optional peer dependency.
- **The handler split**: runtime string triggers and jobs needing an optional plugin, with compiled `handler` references as the first-class form.

The embedded-JS port track (`docstack-headless`) is **dropped**, not deferred. A host without a WebView is served by the Rust core instead.
