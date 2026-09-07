---
title: "Threat model"
description: "What the cryptographic access model guarantees, to whom, what the mathematics does not do, and the residues named plainly."
sidebar_position: 5
---

# Threat model

What is guaranteed, and to whom. This page is deliberately blunt: an
access-control story that overclaims is worse than none.

## The one claim, and why it holds

**A session whose attribute key does not satisfy a scope's policy cannot
produce that scope's plaintext — on any device, through any code path,
including the device's own inspector and console.** The claim holds because
nothing checks it: the sealed fields are ciphertext, and the scope key needed
to open them is itself ciphertext under the policy formula. There is no
client-side gate whose absence would void the guarantee.

This is why DocStack maintains exactly one access-control language. A
JavaScript rule evaluated on the client binds only the code that runs it — the
device owner is never that code. Presenting such rules as access control is a
facade, and DocStack has stopped doing it; the retired rule engine's jobs went
to formulas (who may know), write-time labeling (conditional access), and
application code (behavior).

## What the math does NOT do

- **It does not bind the application.** Code holding the stack reads whatever
  the session's key opens. What the application does with an open scope — UI
  filtering, role-appropriate screens, tenant routing — is its own logic and
  its own responsibility. There is deliberately no framework "behavior policy"
  layer to mistake for enforcement.
- **It does not protect unsealed fields.** Ids, `~class`, timestamps, and any
  attribute not marked `encrypted: true` are plaintext at rest and in sync —
  necessarily, so lists, queries, and replication work. Model sensitive data
  as sealed fields.
- **It does not un-read the past.** Revocation is re-keying: it protects what
  is written after the rotation. What a member could already have copied is
  theirs.
- **It does not verify absence.** Formulas are monotone — no negation. Model
  positive grants.
- **It does not authenticate writers.** Anyone with write access can vandalize
  — relabel a document's scope, overwrite, delete. What the design guarantees
  is that vandalism never becomes *disclosure*: the ciphertext is bound to its
  sealing key (and the label authenticated into it), so an edited label opens
  nothing, relabeling requires the original scope open, and a label that
  disagrees with its ciphertext is quarantined — never "repaired" by
  re-encrypting under the weaker key, which is precisely the downgrade a
  tamperer wants. Integrity against hostile writers is a different primitive
  (revision signatures), on the roadmap as writer authentication.

## The residues, named

- **Key handling is the application's half of the contract.** An application
  that stores attribute keys beside the ciphertext has rebuilt the facade this
  design exists to escape. Adopt keys from controlled infrastructure; store
  them like the secrets they are.
- **Triggers and jobs are replicated executable content** running with the
  framework's capabilities on every device. Treat write access to them as
  administrative access.
- **Metadata leaks shape.** Scope labels, document counts, ids, and update
  rhythms are visible even when every sealed field holds. If the existence of
  a record is itself sensitive, that is a modeling problem this layer does not
  solve.
- **Experimental cryptography.** The scheme (AC17 CP-ABE) is implemented by an
  institutional library on the BN254 curve (~100-bit modern margin), wrapped
  unmodified, and behaviorally cross-checked against an independent
  implementation — but none of it is audited. An audit gates any production
  claim; until then, scopes are a design to build against, not a certified
  seal.
