# abe-spike — dual CP-ABE spike (ADR-0045)

Two independent implementations of the AC17/FAME CP-ABE scheme, measured against
each other to pick the vehicle for `specs/02-crypto-access.md`:

- `rust/` — wasm-bindgen wrapper over Fraunhofer AISEC's **rabe** (BN254).
- `src/ts-fame/` — the scheme hand-built over **@noble/curves** BLS12-381
  (policy→MSP compiler in `policy.ts`, scheme in `fame.ts`).

**SPIKE-GRADE CRYPTOGRAPHY — never ship this as-is.** The matrix measures
feasibility and performance, not security; an audit gates production (ADR-0045).
This package lives outside `packages/*` deliberately: the npm workspace glob
must not swallow it, and nothing in the client may depend on it.

## Verdict (2026-09-04) — gate closed

Both vehicles pass every round-trip and refusal check in node and Chromium.
Full matrix: `specs/02-crypto-access.md` §10. Headline: rabe decrypts in a flat
~24 ms but rides BN254 (~100-bit), panics on unparenthesized AND-chains ≥ 3
(`bench/rabe-probe.ts`), and costs 178 KB gz + a Rust toolchain; TS-FAME costs
83–148 ms per decapsulation, 26 KB gz, every policy shape, BLS12-381.

**Maintainer ruling: rabe integrates** — pre-audit, an institutional
implementation on a legacy-margin curve is a smaller risk than a hand-built
scheme layer on a stronger one. TS-FAME stays here as the behavioral
cross-validation reference (same AC17 scheme, independent implementation;
different curves, so behavior — not ciphertext — must agree). Integration
must ship an AND-chain balancing preprocessor.

## Reproduce

TS side (node ≥ 20):

    npm install
    npx tsx bench/correctness.ts   # 22 property checks
    npx tsx bench/node.ts          # TS-FAME timings

Rust side (rustup stable + wasm32-unknown-unknown target; wasm-bindgen CLI
matching Cargo.lock's wasm-bindgen version, prebuilt binary is fine):

    cd rust
    cargo build --release                                   # native API check
    cargo build --target wasm32-unknown-unknown --release
    wasm-bindgen --target nodejs --out-dir pkg-node target/wasm32-unknown-unknown/release/abe_rabe_wasm.wasm
    wasm-bindgen --target web    --out-dir pkg-web  target/wasm32-unknown-unknown/release/abe_rabe_wasm.wasm
    cd .. && npx tsx bench/rabe-node.ts                     # rabe timings + refusal
    npx tsx bench/rabe-probe.ts                             # policy-shape limits

Browser (both vehicles, drives Chromium borrowed from packages/client's
playwright install — build the client's node_modules first, or point CLIENT_PKG
at any dir whose node_modules holds playwright-core):

    npx esbuild bench/browser-entry.ts --bundle --format=esm --outfile=bench/dist/bundle.js
    npx tsx bench/browser-driver.ts

On WSL, run everything from an ext4 copy (the 9p mount makes cargo and npm
crawl) — the house round-trip discipline applies.

## Traps found the hard way

- rabe key/ciphertext blobs must cross the JS boundary as **opaque strings**:
  their serde output carries u64 limbs, and a `JSON.parse` in JS silently
  mangles anything past 2^53 — decryption then fails with `aead::Error`.
- rabe `utils::policy::msp::lw` panics (wasm `unreachable`) on left-nested AND
  chains of length ≥ 3; balanced parentheses avoid it.
