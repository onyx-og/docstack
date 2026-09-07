---
title: "Schema engine"
description: "How a class document becomes a validator, how attribute types map to Zod, and how a schema change propagates to the documents that already exist."
sidebar_position: 3
---

A schema is the blueprint for a class of documents. The engine keeps it in two forms.

## Raw and hydrated

The **raw schema** is the class document's `schema` map: attribute name to `{ name, type, config, description? }`. It is the single source of truth, stored in the database, replicated with the data, and edited by `Attribute.create`, `modifyAttribute`, `removeAttribute`, or a patch.

The **hydrated schema** is a Zod object built from the raw one when a `Class` is constructed. Each attribute becomes a Zod field: `string` maps to `z.string()` with `.max()` for `maxLength`; `integer` and `decimal` to `z.number()` with `.min()`/`.max()`, and a refinement for `precision`; `boolean` to `z.boolean()`; `enum` to `z.enum(values)`; `object` to `z.object({})`; `foreign_key` to `z.string()` with an asynchronous refinement that checks every referenced id exists in the target class. Non-mandatory fields become optional and nullable; `isArray` wraps the field in an array. Fields are cached by `(type, config)` because the same handful of shapes recur across every class build.

Validation runs the hydrated object asynchronously (`safeParseAsync`), because a `foreign_key` field's existence check reads the database. Defaults are part of the validator: a `defaultValue` becomes a Zod `.default()`, applied as the document is parsed. A class's `before` triggers run ahead of validation, on the raw document, so a derived field can satisfy a constraint.

## Propagation

A class is a schema *for documents that already exist*, so a change to it has to reach them. This happens inside the write of the class document itself, in the plugin that wraps `bulkDocs`:

1. The stored version of the class document is fetched. Its absence is what "just created" means; a class at its first revision that already has documents propagates like any other.
2. The old and new `schema` maps are diffed with `jsondiffpatch`.
3. Every document of the class is read at system level (not through a session's filtered view, so a filtered read cannot rewrite only a subset), decrypted when the class encrypts and the stack holds the key.
4. Every delta entry is applied to every document: an added attribute stamps its default where the key is absent (held values survive); an attribute edited in place is validated against the **full new model**; a removed attribute is deleted from the document.
5. The updated documents are written back in one batch. A per-document failure fails the class write, so a schema change documents cannot satisfy is refused rather than half-applied.

While a propagation is in flight, a `~lock-propagation-<class>` document marks the class busy and further model changes to it are held off. The lock is device-local and never replicates.

In a patch chain the same propagation is first run **dry** against the staged models, so an invalid patch is refused before anything is written, then run for real when the chain commits.

## Merge, not replace

A patch states only the attributes it changes. The stored schema and the patch's schema merge attribute by attribute; an attribute set to `null` in the patch is dropped from the model and, by propagation, from every document. A historical patch that omitted an attribute no longer drops it on a fresh replay. See [Schema patches](../guides/patches.md).

## Type safety in application code

The hydrated schema is the class's `schemaZOD` property, a Zod object, so `z.infer<typeof taskClass.schemaZOD>` gives the TypeScript type of a valid document. It is derived from the raw schema at runtime, which means it is exact for the database you opened rather than for the model your code assumed.

The internals, including the code paths and why the propagation runs where it does, are in [Schema propagation internals](../contributing/schema-propagation-internals.md).
