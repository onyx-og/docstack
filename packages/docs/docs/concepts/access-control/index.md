---
title: "Access control"
description: "DocStack has one access-control language, a monotone attribute formula sealing a scope of content, and it is enforced by cryptography rather than by checks."
sidebar_position: 1
sidebar_label: "Overview"
---

# Access Control

DocStack has **one access-control language**, and it is enforced by
cryptography, not by checks: a monotone formula over attributes, attached to a
**scope** of content, satisfied (or not) by the attribute key a session holds.

```
("role:manager" and "dept:sales") or "clearance:secret"
```

- Content belongs to a **scope**; a scope's key is encrypted under its policy
  formula (CP-ABE).
- Each user holds one **attribute secret key** — attributes like
  `role:manager` embedded in the key material itself, issued by an authority
  the application controls.
- Opening the stack *attempts* each scope: the mathematics either yields the
  scope's key or it does not. **Denial is decryption failure** — there is no
  gate to ask, nothing to bypass, nothing an inspector or console script can
  route around. A device whose key satisfies nothing replicates ciphertext
  faithfully and reads none of it.

Because the formula is enforced by ciphertext, it is deliberately small: `and`,
`or`, parentheses, quoted attributes. No negation, no code, no peeking at the
document. Two consequences follow, and they are features:

- **Conditions over document state are write-time labeling.** "Published
  articles are public" is not a rule that runs on every read — it is the write
  path putting the document into the public scope when it is published. The
  condition runs once; the ciphertext enforces the outcome forever after.
- **Behavioral rules are application code.** What a session's UI shows, which
  buttons exist, what an intern's screen offers — that is the application's
  logic, in the application, where it can be as expressive as it likes. The
  framework does not pretend a client-side rule is enforcement; only the math
  is.

## Pages in this section

- [Attribute policies](./policy-model.md) — the formula language, scopes, and
  labeling.
- [Scopes & keys](./crypto-access.md) — the mechanics: scope keys, the
  keyring, unlock, key management, revocation.
- [Secure architectures](./architectures.md) — the consumer stories this
  enables: team workspaces, untrusted-storage sync, multi-tenant, vendor-blind
  deployments, field fleets.
- [Threat model](./threat-model.md) — what is guaranteed, to whom, stated
  plainly.
- [Recipes](./recipes.md) — common access patterns.

Specification: `specs/02-crypto-access.md` (ADR-0045, implemented). The CP-ABE
primitive ships as `@docstack/abe`; the client surface is `accessKeys` at open,
`stack.unlockScopes(key)` at runtime, and a `~scope` label on documents.

> **Migration note.** Earlier versions documented a JavaScript-rule policy
> engine (`~Policy` documents). It has been **removed**: client-side rule
> evaluation cannot bind the holder of the device, and DocStack no longer
> presents it as access control. `~Policy` documents are inert legacy data —
> nothing evaluates them. Their jobs moved to the three places above: formulas
> (who may know), labeling (conditional access), and application code
> (behavior). Losing read access now seals encrypted fields to `null` rather
> than throwing.
