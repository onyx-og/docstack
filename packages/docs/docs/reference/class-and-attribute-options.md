---
title: "Class & attribute options"
description: "Every field of a class document, every attribute type with its configuration keys, the class flags, and the parameters of Class.create and Domain.create."
sidebar_position: 1
sidebar_label: "Class & attribute options"
---

## The class document

```json
{
  "_id": "Task",
  "~class": "class",
  "name": "Task",
  "description": "A unit of work",
  "parentClass": "Item",
  "schema": { "title": { "name": "title", "type": "string", "config": { "mandatory": true } } },
  "triggers": [],
  "simple": false,
  "ephemeral": false,
  "tenants": ["workspace"]
}
```

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `_id` | string | The class id. `Class.create` uses the name. Replication filters and `internalDocs.extraDocIds` address the class by this id. |
| `~class` | `"class"` | The document type. `"~self"` is reserved for the bootstrap class model. |
| `name` | string | The class name used in SQL, selectors, hooks and `getClass`. |
| `description` | string, optional | For humans and the workbench. |
| `parentClass` | string, optional | The id of a parent class; the workbench and validation use it to relate classes. |
| `schema` | map of attribute models | Attribute name to `{ name, type, config, description? }`. |
| `triggers` | array | Trigger models; see [Trigger and job document models](./trigger-and-job-models.md). |
| `simple` | boolean, optional | Documents stored as given: no validation, triggers, relation checks or encryption. Cannot encrypt a field. |
| `ephemeral` | boolean, optional | Documents purged when the stack next opens; never replicated. |
| `tenants` | string[], optional | The tenant spaces this class belongs to. A tenant is a stack. Static on purpose, so replication scoping can be derived before any data exists. |
| `defaultScope` | string, optional | The access scope documents of this class seal under when they state no `~scope` of their own. See [Scope your data](../guides/access-scopes.md). |

## `Class.create`

```typescript
Class.create(stack, name, type, description?, schema?)
```

| Parameter | Type | Notes |
| :--- | :--- | :--- |
| `stack` | `ClientStack` | The stack the class lives in. |
| `name` | string | Becomes `name` and `_id`. |
| `type` | `"class"` | The document type. |
| `description` | string | Optional. |
| `schema` | map of attribute models | Optional; attributes can be added afterwards with `Attribute.create`. |

Related: `Class.fetch(stack, className, options?)` and `stack.getClass(name, fresh?)` load an existing class with a live subscription; `stack.getClassSnapshot(name)` loads it without one; `Class.buildFromModel(stack, model, { subscribe: false })` builds a detached class from a model.

## `Attribute.create`

```typescript
Attribute.create(classObj, name, type, description?, config?)
```

Writes the attribute into the class document and rebuilds the class's validator. The same shape, `{ name, type, config, description? }`, is what `schema` holds in a class document or a patch.

## Attribute types

| Type | Zod validator | Type-specific configuration |
| :--- | :--- | :--- |
| `string` | `z.string()` | `maxLength` |
| `integer` | `z.number()` | `min`, `max` |
| `decimal` | `z.number()` with a precision refinement | `min`, `max`, `precision` (maximum decimal places) |
| `boolean` | `z.boolean()` | |
| `date` | stored as given | `format`, `min`, `max` |
| `enum` | `z.enum(values)` | `values`: a non-empty array of `{ value }` |
| `object` | `z.object({})` | |
| `foreign_key` | `z.string()` with an async existence check | `targetClass`: the class the referenced document must belong to |
| `reference` | bound to a domain | `domain`: the domain name. Cannot be an array. |

Where a `reference` attribute may live follows from the domain's cardinality: on the target class of a `1:N` domain, on the source class of an `N:1` domain, on either side of a `1:1` domain, and nowhere for `N:N`. `Attribute.create` refuses the rest.

## Configuration keys every type accepts

| Key | Type | Effect |
| :--- | :--- | :--- |
| `mandatory` | boolean | A write without the attribute is refused. Otherwise the attribute is optional and may be `null`. |
| `defaultValue` | the attribute's type | Stamped when the attribute is absent from a write. Also stamped onto existing documents when the attribute is added to a class they belong to. |
| `isArray` | boolean | The attribute holds an array of the type. `foreign_key` arrays check every id. |
| `primaryKey` | boolean | Part of the class's natural key. `addOrUpdateCard(params)` and `getByPrimaryKeys(params)` look documents up by every primary-key attribute together, and `uniqueCheck` refuses a duplicate. |
| `encrypted` | boolean | Stored as an AES-GCM payload under the stack's document key; see [Encrypt fields](../guides/encrypt-fields.md). |

Validation runs asynchronously against the hydrated Zod schema (`classObj.schemaZOD`), because a `foreign_key` field's existence check reads the database. A non-mandatory attribute accepts `null` as well as absence: `undefined` does not survive JSON, so `null` is how a client clears a stored field.

## `Domain.create`

```typescript
Domain.create(stack, id, name, type, relation, sourceClass, targetClass, description?)
```

| Parameter | Type | Notes |
| :--- | :--- | :--- |
| `id` | string or `null` | `null` mints one. |
| `name` | string | The domain name used by `reference` attributes and `useDomain`. |
| `type` | `"domain"` | The document type. |
| `relation` | `"1:1"`, `"1:N"`, `"N:1"`, `"N:N"` | Cardinality, enforced on `addRelation`. |
| `sourceClass`, `targetClass` | `Class` | The two ends. |

A relation document carries `~domain` (the domain name) instead of `~class`, plus `sourceClass`, `targetClass`, `sourceId` and `targetId`. `domain.addRelation(document, referenceId)`, `getRelations(selector?, fields?, skip?, limit?)`, `deleteRelation(sourceId, targetId)` and `validateRelation(document, referenceId)` are the domain's methods.

## Document fields

Every document written through the pipeline carries:

| Field | Set by |
| :--- | :--- |
| `_id` | Random with a class prefix (`Task-x7f3k2m9q1w4`) unless you pass one to `stack.createDoc`. |
| `_rev` | PouchDB. |
| `~class` | The class name. |
| `~createTimestamp` | On creation. |
| `~updateTimestamp` | On update. |
| `active` | `true` on creation; `false` after `deleteCard` or `deleteDocument`. Reads honour it by default. |
| `~scope` | Optional, set by you. The access scope the document's encrypted attributes seal under; overrides the class's `defaultScope`. |

The generated [API reference](/docs/api/client/) lists every method of `Class`, `Attribute` and `Domain` with its signature.
