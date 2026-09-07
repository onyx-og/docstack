---
title: "Recipes"
description: "Common access patterns expressed in the one language: role-gated records, public when published, departments, multi-tenant separation, departures, admin access."
sidebar_position: 6
---

# Recipes

Access patterns in the one language: formulas decide who can know, labeling
decides which scope a document is in, application code decides behavior.

## Role-gated records

Salaries, diagnoses, credentials — fields where "the app filtered it" is not
enough. Mark the attributes `encrypted: true`, give the class a default scope,
seal the scope under the roles that may know:

```
scope hr-sensitive:   "role:hr-manager" or "clearance:executive"
```

Sessions failing the formula hold ciphertext — in their own console, on their
own disk, forever.

## Public when published

Publishing is a *label change*, not a rule:

- Drafts default (via the class) to the team scope:
  `scope editorial-drafts: "team:editorial"`.
- The publish action relabels the article out of the draft scope (public
  content typically carries no sealed fields at all).

The condition ran once, in the write path; no reader ever re-evaluates it.

## Departments and need-to-know

```
scope sales-management:  "role:manager" and "dept:sales"
scope finance-reports:   "dept:finance" or ("role:manager" and "dept:sales")
```

`and` composes need-to-know; `or` grants alternative routes in. No negation
exists — "everyone but contractors" is modeled as the positive attribute
(`staff:permanent`) contractors are not issued.

## Multi-tenant separation

One scope per tenant, the tenant attribute issued only to that tenant's users:

```
scope tenant-acme:    "tenant:acme"
scope tenant-globex:  "tenant:globex"
```

This separates tenants *against the devices themselves*: a Globex user's
database may replicate Acme ciphertext, and it stays ciphertext. Routing,
tenant-aware UI, and cross-tenant admin screens remain application code.

## Suspension and departure

Rotate the scopes the departed key satisfied — the authority seals fresh CEKs
under formulas that key no longer meets, and writers re-encrypt lazily
(revocation is re-keying; it protects everything written from then on).
Disable the account in application code for immediate behavioral effect.

## Admin access

Admins are not special-cased anywhere: they are sessions whose key carries a
broad attribute, granted a route into each formula by construction —

```
"clearance:admin" or ( ...the scope's own formula... )
```

— which keeps "who can know everything" a visible, auditable line in every
policy rather than a bypass in code.
