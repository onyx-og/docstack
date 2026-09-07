---
title: "Secure architectures"
description: "Deployment stories the cryptographic access model enables: team workspaces, untrusted storage, multi-tenant products, vendor-blind deployments, field fleets."
sidebar_position: 4
---

# Secure architectures

What the scope engine makes *buildable*: application architectures whose
security claims survive hostile conditions — an untrusted sync host, a lost
device, a departed employee, a vendor who must not be able to look. Each story
names the setup, what the mathematics guarantees, and what remains the
application's job, because an architecture that hides its own responsibilities
is a facade with better marketing.

Every story shares one skeleton: an **authority** the application controls
issues attribute keys from its identity model; the client **adopts** its key
before first unlock and stores it locally (boots work offline from then on);
**scopes** seal content under attribute policies; ciphertext and scope
documents **replicate freely** because replication never needs plaintext.

## The team workspace

*A line-of-business app — projects, tasks, HR records — with managers,
staff, and an HR office.*

The application's backend runs the authority. On signup or role change it
issues the user's attribute key (`role:staff`, `dept:sales`,
`role:hr-manager`…) and the client adopts it. Classes carry default scopes:
tasks unsealed, salary and review fields in `hr-sensitive`
(`"role:hr-manager" or "clearance:executive"`), management notes in
`management`.

**Guaranteed**: a staff member's device — including its IndexedDB, its
console, its exported database — holds HR ciphertext it cannot open. Sync
distributes everything; knowledge follows keys, not replicas.
**Application's job**: the backend that issues keys is the trust root; protect
it like one. Role-appropriate UI is app code, as always.

## Untrusted storage as the sync fabric

*Replication through storage the user does not fully trust — a cloud drive
folder, a rented CouchDB, someone else's server.*

No architecture change is needed, and that is the story: the remote holds what
it always held — stored-form documents — but sealed fields are ciphertext and
the scope documents beside them are ABE ciphertext. Compromise of the host is
a *metadata* event (ids, classes, labels, update rhythms — see the
[threat model](./threat-model.md)), not a data breach. Sharing over the same
folder is granting the attribute key out-of-band; revoking a member is
rotating the scopes their key satisfied — *keys move with grants, or the grant
is fiction*.

**Guaranteed**: the storage provider, or anyone who seizes the folder, learns
shape, not content.
**Application's job**: the out-of-band key hand-over is the security event;
treat it accordingly.

## Multi-tenant, one deployment

*A SaaS product where tenants must never read each other, but infrastructure
is shared.*

One scope per tenant, sealed under the tenant attribute; the authority issues
`tenant:acme` only to Acme's users. Devices, relays, and backups may hold
mixed ciphertext — replication topology becomes an operational choice, not a
security decision, because tenant separation does not depend on it.

**Guaranteed**: cross-tenant reads fail mathematically, on every device and
every backup, with no per-tenant application code in the read path.
**Application's job**: tenant-aware routing and admin tooling; and the
authority's issuance discipline IS the tenant boundary — audit it.

## The vendor-blind deployment

*Self-hosted or privacy-mandated installations, where the vendor operating
the software must be unable to read the customer's data.*

The authority runs inside the customer's perimeter (their server, or an admin
ceremony on a customer-held machine); attribute keys derive their protection
from customer-held secrets (a passphrase-unlocked vault). The vendor's cloud —
if any — relays and stores ciphertext only. This is the architecture DocStack's
own consumer apps sketched before the engine existed ("a passphrase-derived
key for self-hosted parties, where the vendor genuinely must not be able to
read the data") — the scope engine is what makes it plural: many scopes, many
roles, one perimeter.

**Guaranteed**: the vendor can operate, update, and back up the system without
ever being *able* to read sealed content — "we cannot" instead of "we
promise not to".
**Application's job**: the customer now owns key ceremony and recovery;
losing the authority's material without escrow loses the data. Design the
recovery story before the first real record.

## The field fleet

*Offline-first devices in the field — inspections, health visits, incident
response — with clearance tiers, where devices get lost.*

Full replicas everywhere for offline autonomy; sealed fields tiered by
clearance scopes. A lost or stolen device exposes exactly the scopes its
user's key satisfied — the blast radius of a loss is the key's attribute set,
decided at issuance, not the replica's contents. Offboarding a field worker is
rotating the scopes their key reached; devices re-encrypt lazily as they sync.

**Guaranteed**: device loss is bounded disclosure, pre-decided per user; a
seized replica without its key is the untrusted-storage story again.
**Application's job**: issue narrowly (the blast radius argument cuts both
ways), and treat on-device key storage with platform-appropriate care —
the key beside the ciphertext rebuilds the facade.

---

Common to every story: the authority is the trust root and lives where the
application controls it; adoption-then-local-storage keeps offline-first
intact; revocation is re-keying and protects the future, not the past; and
behavioral logic stays application code. The formulas and labeling that
implement these stories are in [Recipes](./recipes.md); the mechanics in
[Scopes & keys](./crypto-access.md).
