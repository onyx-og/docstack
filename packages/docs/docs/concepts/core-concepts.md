---
title: "Core concepts"
description: "The ideas everything else rests on: everything is a document, the authoring pipeline, logic as data, access by scope, encryption under a key the application owns, migrations as patches, and sync as convergence."
sidebar_position: 1
---

DocStack treats **logic as data**. Where a typical stack separates the database from the code that validates and transforms what goes into it, DocStack stores both in the same place, and both replicate.

## 1. Everything is a document

- **Data is a document.** A task, a user, an invoice.
- **Schema is a document.** The definition of what a `Task` looks like is a `class` document: `{ _id: 'Task', '~class': 'class', schema: { … }, triggers: [ … ] }`.
- **Logic is a document.** Validation rules and triggers live on the class document; background jobs are `~Job` documents; migrations are `patch` documents; the scope a document belongs to is a label on the document and a scope document beside it.

Two things follow. You can change a validation rule or a business process by writing a document, with no redeploy. And your entire application, structure, logic and data, moves as one database: replicate it and the other side has all three.

## 2. The authoring pipeline

Every write through the class API or `stack.db` goes through the same sequence:

1. **Run `before` triggers** on the incoming document. They may derive fields or refuse the write.
2. **Validate** against the class's hydrated schema (Zod, built from the class document). Validation applies defaults for absent attributes and checks that foreign keys point at existing documents; relation documents are checked against their domain's cardinality.
3. **Encrypt** flagged attributes under the stack's document key.
4. **Store** the batch.
5. **Run `after` triggers** on the stored document, revision included.

The pipeline is what makes the guarantees real. It is also why replication writes bypass it by design: a document arriving from another device was validated and triggered where it was written, and re-running the pipeline would reject documents authored by a device one patch ahead. The write guard on `stack.db` makes sure application code cannot take the replication path by accident.

A class flagged `simple` skips the pipeline entirely, on purpose.

## 3. Class-based modelling

A class document is a blueprint. Documents "belong" to a class through their `~class` field and inherit its validation rules, defaults, triggers, encrypted-field selection and default scope. Classes relate through **domains**, named relationships with a cardinality whose relation documents are judged by their endpoints.

The workbench reads the same class documents your application uses, which is why it can show any DocStack database's model and data without configuration.

## 4. Logic injection: triggers and jobs

- **Triggers** are small pieces of JavaScript attached to a class. They run before or after a document is saved, synchronously in the pipeline. "Before saving an invoice, compute the total." "After creating an order, start the confirmation job."
- **Jobs** are background tasks defined in `~Job` documents. They run when asked, from a trigger, or unattended under a scheduler that the application explicitly starts with an allow-list. "Every day, sweep orders due for a review request."

Both are hydrated at runtime with `new Function`. That is not a sandbox: trigger and job code runs with the application's authority, and it replicates with the class or job document. DocStack treats write access to those documents as administrative access, and so should you.

## 5. Access is a property of the ciphertext

Security is not an afterthought, and it is not a rule that runs. Access is a property of the ciphertext: content belongs to a **scope**, the scope's key is sealed under a monotone **attribute policy** (`("role:manager" and "dept:sales") or "clearance:secret"`), and a session's attribute key either satisfies the formula mathematically or the data stays sealed.

- **Enforced by decryption**: denial is the math failing. There is no client-side check to bypass, and the guarantee holds against the device owner too.
- **Conditions are labelling**: "published means public" is the write path choosing the document's scope, once; the ciphertext enforces it after.

See [Access control](./access-control/index.md) for the full model.

## 6. Field-level encryption under a key the application owns

Mark an attribute `encrypted: true` and it is AES-GCM ciphertext before it reaches storage, and on every remote it replicates to. The document key is supplied by the application, from its own server, a cloud grant or a passphrase-derived vault; DocStack never invents it, because a key generated per session could not outlive it and a second device would generate a different one. A stack opened without its key is **locked**: readable where no key is needed, refusing writes to encrypted classes, deferring migrations that need the key, and honest at the sync gate about the schema it has not installed.

The schema says *which fields* encrypt; a scope says *under which key*. See [Crypto engine](./crypto-engine.md).

## 7. Evolution by patches

Schema changes are declarative patch documents with a semver ledger. A chain of patches applies on open, in order, exactly once per device, through a single internal transaction, so a chain is all-or-nothing and a refused patch names the class and attribute at fault. A patch can carry class models, seed data, massages of existing documents and one-shot migration jobs. The sync layer compares patch versions on both sides before replicating, so a device that trails cannot pull documents its schema cannot describe. See [Patches and migrations](./patches.md).

## 8. The local database is the database

Sync is convergence between two databases, not fetching from one. Every stack is complete on its own; when a remote is reachable, the two replicate with PouchDB's protocol and converge on the same winning revisions. That is why offline is the normal operating mode rather than a degraded one, and why the remote can be anything from a CouchDB endpoint to a folder in the user's own Google Drive. See [Offline-first and the sync model](./offline-first-and-sync.md).
