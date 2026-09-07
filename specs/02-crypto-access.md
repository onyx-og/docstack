# 02 — Cryptographic access: CP-ABE scopes, the keyring, and partial locks

Companion to ADR-0045 (the decision record). This document is the architecture in
full and the integration checklist for the cycle that builds it. Status:
implemented (2026-09-06) — `@docstack/abe` + the crypto-engine keyring, the
`~AccessScope` model and `~sys-0.0.18`, the `accessKeys` contract with
`unlockScopes`, per-scope partial locks, and the §2.3 label-integrity guards.
The §5 checklist rows are done except where marked deferred (per-document
policies §8, attribute revocation §7). Pinned by `src-test/access-scopes.test.ts`.

## 1. The model in one paragraph

Access to content is a **scope**. A scope owns a symmetric content-encryption key
(CEK); documents labeled with the scope are encrypted (per-attribute AES-GCM, the
existing engine) under that CEK; the CEK itself travels ABE-encrypted under the
scope's **policy string** — a monotone boolean formula over attributes. A session
holds one **attribute secret key**, supplied by the consumer's own key
infrastructure. Opening the stack attempts each scope's CEK: the math either
yields the key (scope unlocked) or fails (scope locked). There is no gate to ask;
denial is decryption failure.

**One vocabulary (maintainer ruling, 2026-09-04).** The attribute formula is
DocStack's ONLY access-control language — the `~Policy` JS-rule engine is not
maintained beside it and retires in the integration cycle (§5). The format is
rabe's monotone policy language: quoted attributes, `and`/`or`, parentheses —
`("role:manager" and "dept:sales") or "clearance:secret"`. No negation, and no
data-dependence in the formula: a condition over document state
(`status === 'published'`) is expressed as **write-time labeling** — the write
path picks the scope, the ciphertext enforces the choice from then on.
Behavioral/UI rules are application code. **Integration must ship an AND-chain
balancing preprocessor**: rabe's converter panics on unparenthesized AND-chains
of length ≥ 3 (`spikes/abe/bench/rabe-probe.ts`), so the framework normalizes
formulas before they reach it.

## 2. Scope model

### 2.1 `~AccessScope` documents (replicate with the data)

```jsonc
{
  "_id": "~scope-<scopeId>",
  "~class": "~AccessScope",
  "scopeId": "sales-management",
  "policyString": "(\"role:manager\" and \"dept:sales\") or \"clearance:secret\"",
  "abeWrappedCek": "<serialized ABE ciphertext of the 32-byte CEK>",
  "kid": "<16-hex key id: first 8 bytes of SHA-256(CEK bytes)>",
  "version": 1,
  "encryptedMarker": { "__enc": true, "iv": "...", "data": "...", "kid": "..." },
  "active": true
}
```

- `kid` follows the engine's existing derivation (`utils.ts:97`) so the keyring
  and payload stamping compose without a second id scheme.
- `encryptedMarker` is the **per-scope canary**: AES-GCM over a random nonce
  under the CEK, the ADR-0018 admission test applied per scope. A CEK that ABE
  decryption yields is verified against it before joining the keyring — a
  corrupted or rotated-away ciphertext is an error at unlock, not garbage later.
- `version` increments on rotation (§7). Old versions may coexist during lazy
  re-encryption; their CEKs enter the keyring as decrypt-only (the `retiredKeys`
  discipline, `crypto-engine/index.ts:55`).
- The scope doc is NOT itself scope-encrypted (it must be readable to be
  attempted). `policyString` is public by design — CP-ABE ciphertext policies
  are visible; hiding policies is a different scheme (not pursued).

### 2.2 Labeling documents

A document opts into a scope with a reserved field:

```jsonc
{ "_id": "task-1", "~class": "Task", "~scope": "sales-management", ... }
```

- `~scope` is data, not schema: the side-service ruling. A class MAY declare a
  default (`classModel.defaultScope`) applied at write time when the document
  does not state one; the document's own value wins.
- Scope selection happens at the plugin's single encrypt site
  (`plugins/pouchdb.ts:525-543`): resolve `~scope` → the keyring must hold that
  scope's CEK *for writing* → encrypt the class's encrypted attributes under it,
  stamping the CEK's `kid`. No `~scope` → the legacy document key path,
  unchanged.
- Which attributes encrypt still comes from the schema (`encrypted: true`) — the
  scope decides *under which key*, the schema decides *what*. A later extension
  may add whole-payload scope encryption; v1 composes with the existing
  granularity.

### 2.3 Label integrity (pinned 2026-09-05: "what prevents editing `~scope`?")

Nothing prevents the edit, and confidentiality does not need it prevented: the
label is the address on the envelope, the ciphertext is the wax. Sealed
payloads carry the `kid` of the CEK that sealed them, and reads dispatch by
`kid`, never by label — relabeling opens nothing. The hazards are write-side,
both downgrade-shaped, and the design closes them with three rules:

1. **Relabeling requires the original scope open.** A legitimate relabel IS
   decrypt-plus-re-encrypt; a device that cannot open scope A cannot move a
   document out of it — it can only produce a document whose label and payload
   `kid` disagree.
2. **Label↔`kid` mismatch is a refusal, never a repair.** No rewrite path — the
   plugin's encrypt site, rotation sweeps (§7), propagation — re-encrypts a
   payload under the labeled scope's key when the payload's `kid` belongs to a
   different scope. Mismatch is quarantined ADR-0040-style (flagged, skipped,
   surfaced), because "fixing" it is exactly the induced-downgrade attack: a
   tampered label tricking an authorized key-holder into re-sealing content
   under a weaker key. Without this rule, hazard 2; without rule 1, hazard 1
   (future writes under the attacker-readable key).
3. **The label is bound into the ciphertext (AAD).** Each sealed field's
   AES-GCM invocation passes `scopeId` + `kid` as additional authenticated
   data, so a relabeled document does not merely *look* inconsistent — its
   decryption authenticates against the label and fails loudly on tamper. GCM
   provides this for free; today's engine passes no AAD (`utils.ts:109`), so
   this is an integration item (§5). Legacy-key payloads (no scope) pass no
   AAD, keeping old ciphertext readable.

The boundary stated honestly: these rules ensure tampering never becomes
*disclosure*. They do not make labels tamper-*proof* — anyone with write access
and replication can vandalize (relabel, overwrite, delete), which is an
integrity/availability problem CP-ABE never claimed to solve. Binding
revisions to their writers needs signatures — recorded on the roadmap as
writer authentication, not smuggled in here as an implied property.

## 3. The keyring (engine generalization)

Today: one `documentKey`/`cryptoKey`/`documentKeyId` scalar triple plus a
decrypt-only `retiredKeys` map. Target:

```ts
type KeyringEntry = {
  kid: string;
  cryptoKey: CryptoKey;          // AES-GCM, non-extractable
  scopeId?: string;              // absent for the legacy document key
  mode: "read-write" | "read-only";  // read-only: retired versions
};
```

- **Reads**: `resolveKeyFor(payload)` already dispatches by `kid`
  (`crypto-engine/index.ts:255`). Two fixes it needs first:
  - the missing-`kid` fallback to "the current key" mis-routes under multiple
    keys → fallback only to the **legacy document key**, never a scope key;
  - `wrapDocumentKey` (`utils.ts:139`) writes wrapped keys without a `kid` —
    wrapped key material must be self-identifying.
- **Writes**: new selector `keyFor(scopeId | undefined)` — the write-side choice
  the engine never had. The plugin passes the resolved scope; absent = legacy.
- The legacy single-key stack is the degenerate keyring: one entry, no scope.
  `StackOptions.documentKey` keeps working untouched.

## 4. The consumer key contract

DocStack never runs the authority and never invents key material (ADR-0018). The
contract generalizes what tokido already does with `documentKey`
(mint/adopt/store consumer-side, before first unlock, offline afterwards):

```ts
// StackOptions
accessKeys?: {
  /** The session's ABE attribute secret key, serialized. */
  attributeKey?: string;
  /** Called when scopes exist that the current material cannot open —
   *  the consumer may fetch/adopt newer material (their server, Drive,
   *  Firebase) and return it, or return null to stay partially locked. */
  requestAttributeKey?: (lockedScopes: string[]) => Promise<string | null>;
}
```

- Adoption discipline: material arrives before (or at) unlock; the stack stores
  nothing of it — the consumer persists it exactly as tokido persists the
  document key today. A device that adopted its key unlocks offline.
- `unlockScopes(attributeKey)` is the runtime entry (the per-scope `unlock()`):
  attempt every active `~AccessScope`, admit CEKs canary-first, emit
  `scopeUnlocked` per success; idempotent; a later call with better material
  unlocks more.
- The public authority API ships in a separate package (working name
  `@docstack/abe-authority`): `setup()` → master keys; `keygen(msk, attrs)` →
  attribute secret key; `wrapCek(pk, policy, cek)` → `abeWrappedCek`. The
  consumer's controlled environment (their server; an admin ceremony; later the
  docstack-server package) runs it. The client bundle carries only decrypt-side
  code.

## 5. Partial locks — the binary-lock generalization checklist

Every site below assumes one key / one lock bit. This list IS the integration
cycle's work-item list; each item names the current anchor.

| Site | Today | Target |
|---|---|---|
| `isLocked()` stack.ts:604 | one bit | `isLocked()` = legacy key absent AND every scope locked; add `isScopeLocked(scopeId)`, `lockedScopes()` |
| Write refusals pouchdb.ts:439, sweep.ts:135 | `stack.isLocked()` | per resolved scope: refuse when the document's scope has no read-write CEK; `StackLockedError` already carries a class name — carries the scope too |
| Read null-convention stack.ts:3243-3267, 2413-2417 | all-or-nothing | per payload: a `kid` the keyring lacks nulls that attribute (the machinery is already per-payload via `resolveKeyFor`) |
| `canApplyQueryLimitEarly` stack.ts:2469 | any missing key disables pushdown stack-wide | disable only for classes whose documents may carry locked scopes (class default scope or observed labels) |
| `exportContent` stack.ts:907-919 | locked ⇒ all encrypted classes lossy | lossy per locked scope; the report names which scopes were sealed |
| `unlock`/`validateCryptoConfig` stack.ts:640/2753 | one canary in `~crypto-engine-config` | legacy canary unchanged; scope canaries live on `~AccessScope` (§2.1) — the config doc stays single-key |
| `wrappedDocumentKey` stack.ts:1778, trigger datamodel:1160 | one wrapped key per user | untouched (legacy path); attribute keys are consumer-held, never on `~User` |
| `resolveKeyFor` crypto-engine:255 | missing-kid → current key | missing-kid → legacy key only (§3) |
| `wrapDocumentKey` utils.ts:139 | no kid in payload | stamp kid (§3) |
| Channel host adapter-channel/host.ts:191 | offers THE key | offers the legacy key only; scope material never crosses the channel (grant = consumer key distribution, ADR-0030 §8) |
| Patch deferral barrier stack.ts:1650-1700 | needs-key = binary | needs-key per scope: a patch touching scope-labeled classes defers until THAT scope opens; `onDocumentKeyAvailable` grows a per-scope replay hook |
| Policy engine — five call sites (processFoundDocuments stack.ts:3138; createDoc :3864; createDocs :3967; deleteDocument :4210; sweep.ts:94/:148) | JS-rule evaluation | **RETIRE** (single-vocabulary ruling): remove the calls; reads/writes answer to scopes and schema validation only |
| `ensureDefaultPolicyForClass` stack.ts:1144 + seeded `Policy-*` docs + pre-auth throw policy-engine:211/:307 | default JS policies per class | retire with the engine; the "secure by default" story becomes the class default scope (§2.2) |
| `~Policy` class + `canApplyQueryLimitEarly`'s `hasPoliciesFor` gate stack.ts:2470 | policy-driven pushdown gate | class deprecated (kept inert for legacy data or redacted by patch — decide at integration); pushdown keys on scope labels per the row above |
| `encryptWithAesGcm`/`decryptWithAesGcm` utils.ts:109 | no AAD | scope-sealed payloads bind `scopeId` + `kid` as GCM additional authenticated data (§2.3 rule 3); legacy-key payloads pass none, so old ciphertext stays readable |
| Every rewrite path: plugin encrypt site pouchdb.ts:525-543, rotation sweep (§7), propagation | re-encrypts under "the" key | label↔`kid` mismatch = refuse/quarantine, never re-seal under the labeled scope (§2.3 rule 2 — the induced-downgrade guard) |

## 6. Sync

Nothing new moves: `~AccessScope` docs and scope-encrypted payloads replicate in
stored form (ADR-0020/0019 discipline; the junction 0 pin — revision-addressed
reads serve ciphertext — already protects scope payloads identically). A device
whose attribute key satisfies nothing still replicates everything and reads
nothing: the GDrive passive-node scenario gets its real story — the remote holds
only blobs it cannot open. The ADR-0040 junctions (barrier, gate, replay) apply
per scope; the consumer schema gate is orthogonal.

## 7. Rotation and revocation

- **Revoking membership = rotating the scope** (ADR-0030 §8): authority mints
  CEK v+1, publishes a new `~AccessScope` version with a policy the revoked
  session no longer satisfies; writers holding v+1 re-encrypt lazily on write
  (the key-rotation machinery and its pins are the template —
  src-test/key-rotation.test.ts); v stays decrypt-only until sweep completes,
  then retires. Revoked members keep what they could already have copied —
  stated, not hidden; no crypto system un-reads data.
- ABE **attribute** revocation (shrinking a key, not a scope) is the scheme's
  known weakness — attribute versioning is the standard answer; roadmap.

## 8. Per-document policies (recorded extension)

A document-level `~policy` string with a per-document CEK is the expressiveness
ceiling ("(manager AND sales) OR top_secret" per record). Costs: one ABE decrypt
per document on first read (cacheable), per-document rotation, at-rest overhead
per doc. Deliberately after scope machinery is proven; the scope design leaves
room (a `~scope` value of a per-doc marker + CEK carried on the doc).

## 9. Threat model, stated honestly

- The math binds **whoever lacks satisfying attributes** — including the device
  owner for scopes their key does not satisfy. This is the claim client-side
  policy gates could never make.
- The math does NOT bind the consumer application: code holding the stack sees
  whatever the session's attribute key opens. What code does with an open scope
  is the application's own responsibility — there is deliberately no second
  "behavioral policy" layer to mistake for enforcement (single-vocabulary
  ruling, ADR-0045).
- Key material handling is the consumer's: a consumer that stores attribute keys
  beside the ciphertext has re-created the facade. The contract makes the right
  thing easy (adopt-then-store like tokido), not inevitable.
- **Tampering is not disclosure — and not prevented.** The scheme guarantees
  confidentiality, not integrity: anyone with write access and replication can
  relabel, overwrite, or delete (vandalism), and §2.3's rules guarantee only
  that no such act ever yields plaintext the actor's key could not produce.
  Binding revisions to writers (signatures) is the integrity tool — roadmap
  ("writer authentication"), deliberately not implied here.
- Vehicles are experimental cryptography (unaudited backend or hand-built scheme
  layer); an audit gates production. The spike's numbers are feasibility, not
  assurance.

## 10. Spike evidence matrix (measured 2026-09-04, `spikes/abe`)

Chromium numbers (node within a few ms of every figure); policies of 1 / 3 / 10
attributes; both vehicles pass all round-trip and refusal checks in browser and
node.

| Measure | rabe → WASM (AC17) | TS-FAME over @noble (AC17) |
|---|---|---|
| Builds & runs in browser | yes — stable Rust (no nightly), wasm32-unknown-unknown; init 36 ms | yes — pure TS, zero toolchain |
| Artifact size | 632 KB wasm, **178 KB gz** + 14 KB glue | 67 KB min, **26 KB gz** (incl. noble subset) |
| setup | 22 ms | 91 ms |
| keygen (1/2/5 attrs) | 18 / 20 / 35 ms | 109 / 153 / 253 ms |
| encrypt (1/3/10-attr policy) | 24 / 34 / 79 ms | 124 / 255 / 854 ms |
| **decrypt** (the unlock path) | **~24 ms, flat** in policy size | 83 / 89 / 148 ms |
| Ciphertext size | 3.8 / 5.5 / 11.1 KB (JSON limb serialization — a binary format would shrink it several-fold) | ~1.0 / 1.3 / 2.3 KB (compressed points) |
| Secret-key size | 3.3 / 4.1 / 6.5 KB (JSON) | ~0.6 / 0.7 / 1.2 KB |
| Policy shapes | monotone boolean, BUT **panics on unparenthesized AND-chains ≥ 3** (`utils::policy::msp::lw`, characterized by `bench/rabe-probe.ts`; a balancing preprocessor masks it) | monotone boolean, all shapes tested incl. long chains |
| Curve / security margin | BN254 — **~100-bit** after the 2016 tower-NFS estimates | BLS12-381 — ~120–128-bit target |
| License | rabe MIT (Fraunhofer AISEC), rabe-bn MIT/Apache-2.0 | noble MIT; scheme layer ours |
| Supply chain | institutional repo, sparse releases; `rabe-bn` is an unaudited fork of an old zcash crate | curve arithmetic audited (noble); scheme layer hand-built here, unaudited |
| API fit (§4 contract) | serde blobs are opaque strings — fits; u64 limbs MUST NOT round-trip through JS `JSON.parse` (mangled past 2^53, found the hard way) | native fit; serialization format is ours to define |

**Reading**: rabe is 3–10× faster with the flat ~24 ms decrypt AC17 promises, at
the cost of a Rust build step, a degraded-margin curve, a panicky policy parser,
and a heavier artifact. TS-FAME pays ~100–150 ms per scope decapsulation — paid
once per scope at unlock — and in exchange gets the stronger curve, a 7× smaller
artifact, every policy shape, and full ownership of a layer that must eventually
be audited anyway.

**Gate CLOSED (maintainer ruling, 2026-09-04): rabe integrates.** The security
judgment: pre-audit, implementation risk outranks curve margin — an
institutional implementation on BN254 over a hand-built scheme layer on
BLS12-381. The matrix's BN254 caveat stands recorded and re-enters the picture
at audit time. TS-FAME remains in the spike as the behavioral cross-validation
reference (same scheme, independent implementation; ciphertexts cannot interop
across curves, behavior must agree). Integration carries the AND-chain
balancing preprocessor (§1) as a hard requirement.

Both-fail fallback (symmetric key-splitting) is moot: both vehicles work.
