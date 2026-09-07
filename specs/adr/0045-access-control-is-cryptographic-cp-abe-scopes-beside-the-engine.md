# ADR-0045 — Access control is cryptographic: CP-ABE scopes beside the engine

Status: accepted, implemented · Date: 2026-09-04 (implemented 2026-09-06)

**Implementation note (2026-09-06).** Landed as `@docstack/abe` (rabe AC17
compiled to WASM, base64-embedded, lazily instantiated; the policy normalizer's
AND-chain balancer ships with it), the crypto-engine keyring (scope CEKs
dispatched by `kid`, per-scope canary admission, scope-AAD binding the label
into every sealed payload), `~AccessScope` documents + `~sys-0.0.18` (which also
deactivates the three seeded `~Policy` docs), the `accessKeys` consumer contract
with `unlockScopes`, per-scope partial locks across every §5 checklist site, and
the induced-downgrade guard (`StackScopeMismatchError`). The `~Policy` JS-rule
engine is deleted - its five call sites, the default-policy seeder, and the
pre-auth throw are gone; `~Policy` the class stays inert for legacy data. Pinned
by `src-test/access-scopes.test.ts` (satisfying vs non-satisfying key, sealed
write refusal, the relabel/downgrade refusal, policy normalization); the crypto
and query suites now assert seal-to-null where they once asserted a policy throw.

**Spike verdict** (`spikes/abe`, full matrix in `specs/02-crypto-access.md` §10):
both vehicles WORK in browser and node — CP-ABE on the client is feasible today.
rabe→WASM: 178 KB gz, decrypt ~24 ms flat in policy size, but BN254 (~100-bit
margin), a panicky policy parser (unparenthesized AND-chains ≥ 3 abort), and a
Rust build step. TS-FAME over @noble BLS12-381: 26 KB gz, 83–148 ms per
decapsulation (paid per scope at unlock — a handful of scopes opens in well
under a second), every policy shape, stronger curve, fully owned.

**Gate ruling (maintainer, 2026-09-04): rabe integrates.** The security
judgment: an institutionally implemented scheme on a legacy-margin curve is a
smaller risk than a hand-built scheme layer on a stronger one — implementation
risk outranks curve margin pre-audit. The matrix's numbers stand as recorded
(BN254's ~100-bit margin included, honestly); the TS-FAME implementation stays
in the spike as the behavioral cross-validation reference (same AC17 scheme,
independent implementation — ciphertexts don't interop across curves, behavior
must agree). Integration must carry the AND-chain-balancing policy
preprocessor that files down rabe's parser panic.

**Single-vocabulary ruling (maintainer, same date): drop the facades — one
access-control language.** The `~Policy` JavaScript-rule engine is not
maintained as a parallel access-control vocabulary: the ONE language is the
monotone attribute formula the ciphertext enforces (`("role:manager" and
"dept:sales") or "clearance:secret"` — rabe's policy format). What the JS rules
expressed beyond it is reassigned, not lost: data-dependent conditions
(`status === 'published'`) become **write-time scope labeling** (the condition
runs once at write, the ciphertext enforces it thereafter); behavioral/UI
rules are the application's own code, where they always truly lived; the
monotone targeting subset (user/group scoping) is the attribute vocabulary
directly. The policy engine is scheduled for retirement in the integration
cycle (see the spec §5 checklist); per-document policy strings remain on the
roadmap.

## Findings: the policy engine is advisory, and no client gate can be otherwise

A full review of the client policy engine (333 LOC, `core/policy-engine/index.ts`)
and every surface that should answer to it established the advisory reality:

- **Enforcement is five call sites.** Reads: `processFoundDocuments`
  (stack.ts:3119, `isReadableDocument` per row) — which covers `findDocuments`,
  its iterator/view/single variants, SQL (the query engine fetches only through
  `Class.getCards`), and `exportContent`. Writes: `createDoc` (:3864),
  `createDocs` (:3967), `deleteDocument` (:4210), and the transaction sweep
  (sweep.ts:94/:148). Nothing else asks.
- **Everything else is raw**: `stack.db.*` (the guarded handle blocks
  `new_edits:false` and adapter privates — authorization was never its subject),
  `getDocument`, `dump()` (full-database dump), `createRelationDoc(s)` (relations
  have no policy concept at all), `importContent` (its export twin IS filtered —
  asymmetric), `applyPatch`, the plugin's whole `bulkDocs` pipeline, and the live
  changes feeds — `packages/react/src/hooks/class.ts:393-424` splices unfiltered
  change documents into lists the read path had filtered.
- **The engine has no operation concept**: `authorize(target, operation, doc)`
  uses `operation` only in error text — one rule governs read and write
  identically; no read-only grants exist. No field-level concept either.
- **`Policy-Admin` is vacuous**: every class it targets except `~Group` is in the
  `SYSTEM_CLASSES` bypass, so there is no admin escalation for application
  classes — "admin" exists only as the seeded `system` user's group and a
  hard-coded `username === 'system'` clause in one rule string.
- **Privilege is one assignment away**: `setAuthSession` and the `authSession`
  field are public; the test suite's own idiom is to hand-roll a Group-Admin
  session. `~Job` documents — which replicate — execute via `new Function`
  against the *real* stack (job-engine/index.ts:172), the loudest un-sanctioned
  privileged path in the codebase.
- **Small defects**: `deleteDocument` swallows a policy denial into `false`
  (stack.ts:4213 — denial indistinguishable from not-found); a class installed by
  a patch gets no default policy while one from `addClass` does.

An enforcement design (opt-in flag, policy-aware public handle, identity-based
admin, operation field) was planned to make the documentation's claims true — and
then set aside, for the reason the threat model already stated: **every
client-side gate is a facade against the device owner.** A user with the
IndexedDB inspector or a console reads the store below any wrapper. Client-side
"enforcement" can bind application code paths, never the person holding the
device. The only thing that binds the device holder is mathematics.

## Decision

**End-user access control becomes cryptographic.** The enforcement claim worth
making is: *a session that does not satisfy a document's access policy cannot
produce its plaintext, because the decryption fails.* The target construction is
**CP-ABE (ciphertext-policy attribute-based encryption)**:

- The user's credential unlocks their **attribute secret key** — a single key
  with attributes embedded (`role:manager`, `dept:sales`).
- Content is encrypted under **policy strings** — monotone boolean formulas over
  attributes: `(manager AND sales) OR clearance:secret`.
- Decryption succeeds exactly when the key's attributes satisfy the ciphertext's
  policy. Denial is not an API refusal; it is the math failing.

### Architecture: a side service beside the crypto engine, per-scope CEKs

ABE is expensive pairing cryptography; it never encrypts bulk data. The hybrid:

1. **`~AccessScope` documents** (they replicate with the data) carry
   `{scopeId, policyString, abeWrappedCek, kid, version, encryptedMarker}` — the
   ABE ciphertext wraps a 32-byte AES **content encryption key**, and the marker
   is that scope's canary (the ADR-0018 admission test, per scope).
2. **The existing engine does the bulk work, unchanged in kind**: per-attribute
   AES-GCM, generalized from one document key to a **keyring** dispatched by
   `kid`. The read seam already exists (`kid` stamping, `retiredKeys`,
   `resolveKeyFor` — pinned by `src-test/key-rotation.test.ts`); what integration
   adds is a write-side key selector (which scope key encrypts this document) and
   per-key admission. Scope labels are **data-driven** (a reserved field, with
   optional class-level defaults) — deliberately not the schema `encrypted`
   flags: this is a side service that composes with them.
3. **Unlock is an attempt, per scope**: session start → the keyring supplies the
   user's ABE secret key → each `~AccessScope`'s CEK is attempted → success
   unlocks that scope (CEK joins the keyring, canary verified), failure leaves it
   locked. Today's binary `isLocked()` generalizes to **partial locks**; the
   locked-stack discipline (reads null, writes refuse, patches defer — ADR-0018,
   ADR-0040) applies per scope. `StackLockedError` is already thrown per class:
   the one seam that admits this granularity.
4. **Key management is consumer-controlled.** DocStack never runs the authority.
   The precedent is already deployed practice: the tokido consumer mints/adopts
   its document key from its own infrastructure (a Drive grant; Firebase) before
   first unlock, and DocStack only receives material and refuses rather than
   degrades. The contract generalizes `StackOptions.documentKey`: the consumer
   supplies attribute-key material from wherever it chooses; adoption before
   first unlock; stored consumer-side so later boots are offline. ADR-0018
   already states the doctrine: *transport is the application's responsibility.*
5. **Authority tooling ships separately** — setup and attribute-key issuance run
   in an environment the consumer controls (their server, an admin ceremony,
   eventually the docstack-server package as the parallel lib). Never in the
   client bundle. The Fraunhofer rabe/rabe-keyserver split mirrors this shape.
6. **Revocation is re-keying** (ADR-0030 §8: "keys move with grants or the grant
   is fiction"): rotate a scope's CEK, lazily re-encrypt its documents; departed
   members keep only what they could already have copied. ABE attribute-level
   revocation is recorded honestly as the scheme's weak point (attribute
   versioning) and stays on the roadmap.
7. **Sync fits as-is**: ciphertext and `~AccessScope` docs replicate in stored
   form (ADR-0020); a device without satisfying attributes holds opaque blobs;
   the ADR-0040 junction machinery is the template for per-scope deferral.

### Why ABE and not symmetric key-splitting

A key hierarchy (per-scope keys wrapped per user, secret-shared for AND) is
buildable on today's engine — but granting a user access requires simultaneously
holding the scope key *and* that user's key-encryption key, and the codebase has
no per-user public material (the only KEK is the PBKDF2-derived key; verified:
no wrapKey/keypair anywhere in the client). Every membership change is an
interactive ceremony. ABE dissolves exactly that wall: encrypt-under-policy is
non-interactive and binds users who do not exist yet. Key-splitting remains the
recorded fallback if both spike vehicles fail.

### Vehicle: decided by evidence, not preference

No audited, maintained, production CP-ABE library exists for the browser. Two
spikes run side by side in `packages/abe-spike` (private, never a client
dependency), and a bench matrix picks:

- **rabe → WASM**: Fraunhofer AISEC's Rust library (AC17/FAME among six CP-ABE
  schemes) over the pure-Rust `rabe-bn` BN254 backend, wrapped with
  wasm-bindgen. Institutional and API-complete; the backend is an unaudited fork
  of an old zcash crate, and the wasm path is unproven until the spike proves it.
- **TS-FAME**: AC17/FAME implemented in TypeScript over `@noble/curves`
  pairings. No toolchain, fully owned and auditable, matches the client's
  zero-crypto-deps stance (WebCrypto only today) — at the price of owning
  scheme-level correctness of academic cryptography.

**Stated plainly: the spike measures feasibility and performance, not security.
Both vehicles are experimental; an audit gates any production use.**

## Deferred and dropped (recorded, not lost)

- **The enforcement plan is DROPPED, not parked** (single-vocabulary ruling):
  `enforcePolicies` flag, policy-aware public handle, identity-based privilege
  (wildcard `Policy-Admin` with a separate override bucket — a naive wildcard
  is poisoned by the targeted-bucket switch at policy-engine/index.ts:214-222;
  `withSystemSession`; system-authoring policy), `operations` field. The design
  work stays recorded here because its findings are real and its analysis
  (the wildcard-bucket poisoning above all) documents the engine being
  retired. A server-side access story, when the server package grows one,
  speaks the attribute vocabulary — not a revived JS-rule engine.
- **Policy-engine retirement** happens in the integration cycle, not this one:
  the five enforcement call sites, the default-policy seeder, the pre-auth
  throw, and the `~Policy`-as-access-control reading go together; the spec §5
  checklist carries the items. Until then the engine keeps behaving as today —
  retirement is a planned change, not a silent one.
- Per-document policy strings (per-doc CEK) — the expressiveness ceiling,
  after scope machinery is proven (maintainer: roadmap, confirmed at the gate).
- Filtered live subscriptions (the react splice leak, named above) — for
  sealed scopes ciphertext is ciphertext on every path, which removes the
  *knowledge* half of that leak; the behavioral half moves to app code with
  everything else.
- Job sandboxing (`~Job` content vs the real stack).
- **Writer authentication** (revision signatures): the scheme is
  confidentiality-only; label tampering and vandalism are integrity problems,
  contained — never disclosed — by the spec §2.3 rules (relabel requires the
  open scope, label↔kid mismatch refuses, AAD binds the label into the
  ciphertext), but not prevented without signatures.
- ABE attribute revocation; security audit.

## Consequences

- The Docusaurus access-control topic documents the **single model**: one
  attribute-policy language, enforced by encryption; behavioral rules are
  application code; data-dependent access is write-time labeling. One honest
  caveat survives every design: only the mathematics binds the device owner —
  and now nothing else claims to.
- The integration checklist (every site that assumes one key / one lock bit)
  lives in `specs/02-crypto-access.md` and is the next cycle's work-item list.
- `specs/02-crypto-access.md` is the architecture's full statement; this ADR is
  the decision record.
