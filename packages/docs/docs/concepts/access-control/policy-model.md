---
title: "Attribute policies"
description: "The formula language, scopes, and write-time labeling that decide who can open which content."
sidebar_position: 2
---

# Attribute policies

## The language

A policy is a **monotone boolean formula over attributes**:

```
"attribute"                     — satisfied when the key carries it
formula and formula             — both
formula or formula              — either
( formula )                     — grouping
```

Attributes are opaque strings; the convention is `kind:value` —
`role:manager`, `dept:sales`, `clearance:secret`, `tenant:acme`. The formula
is embedded in ciphertext when a scope's key is sealed, so the language is
exactly what ciphertext can enforce:

- **No negation.** "Everyone except interns" cannot be a formula — a
  ciphertext cannot verify the *absence* of an attribute. Model the positive
  set instead (`role:staff` that interns don't get).
- **No document inspection.** The formula cannot read fields; conditions over
  document state are [write-time labeling](#labeling) instead.
- **No code.** Nothing executes; the formula is satisfied by key material or
  it is not.

The framework normalizes formulas before sealing (canonical parenthesization
of `and`/`or` chains), so authors write them naturally.

## Attributes come from your identity model

The authority — tooling the application runs in an environment it controls —
issues each user's attribute key from the application's own identity data. A
user in groups `Group-Accounting` and `Group-Managers` naturally receives
`group:accounting` and `group:managers`; role, department, clearance, tenant
are whatever the application's user model already knows. One identity model,
expressed once, enforced cryptographically. See
[Scopes & keys](./crypto-access.md) for issuance and adoption.

## Scopes

A **scope** is the unit a policy protects: a named set of content whose
encrypted attributes share one content key, sealed under the scope's formula.
Scopes are documents (they replicate with the data), and a deployment
typically has a handful — `hr-sensitive`, `sales-management`, `tenant-acme` —
not one per document. Per-document policies are a recorded roadmap extension.

## Labeling {#labeling}

Documents join a scope by carrying a scope label; a class may declare a
default scope for its documents, and the document's own label wins. Labeling
is where conditional access lives:

- *"Published articles are public"* — the publish action moves the article to
  the public scope (or out of any scope, for plaintext-public content).
- *"Drafts are visible to their team"* — new drafts default to the team's
  scope via the class default.
- *"Escalated tickets become management-only"* — the escalation write
  relabels into the management scope.

The condition executes once, in the write path the application already owns;
from then on the ciphertext enforces the outcome on every device, forever.
Which *fields* seal is still the schema's choice (`encrypted: true` per
attribute): the schema says what encrypts, the scope says under which key —
and unsealed fields (ids, titles, timestamps) stay readable so lists and sync
keep working.
