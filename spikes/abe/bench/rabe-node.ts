/** rabe AC17 CP-ABE via WASM (node bindings): correctness + bench, mirroring node.ts. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rabe = require("../rust/pkg-node/abe_rabe_wasm.js") as {
    setup(): string;
    cp_keygen(msk: string, attrs: string): string;
    cp_encrypt(pk: string, policy: string, plaintext: Uint8Array): string;
    cp_decrypt(sk: string, ct: string): Uint8Array;
};

const time = (label: string, iterations: number, fn: () => unknown) => {
    fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const ms = (performance.now() - start) / iterations;
    console.log(`${label.padEnd(34)} ${ms.toFixed(2).padStart(8)} ms`);
    return ms;
};

// rabe's human policy language: "A" and "B" with quoted attribute names.
const q = (attr: string) => `"${attr}"`;
const policies: Record<number, { policy: string; attrs: string[] }> = {
    1: { policy: q("a1"), attrs: ["a1"] },
    3: { policy: `${q("a1")} and (${q("a2")} or ${q("a3")})`, attrs: ["a1", "a2"] },
    10: {
        // Balanced parens: rabe's MSP converter panics on left-nested AND chains
        // of length >= 3 (bench/rabe-probe.ts characterizes it); a policy
        // preprocessor would have to balance AND chains before handing them over.
        policy: `(((${q("a1")} and ${q("a2")}) and (${q("a3")} and ${q("a4")})) and ${q("a5")}) or (((${q("a6")} and ${q("a7")}) and (${q("a8")} and ${q("a9")})) and ${q("a10")})`,
        attrs: ["a6", "a7", "a8", "a9", "a10"],
    },
};

console.log("rabe AC17 CP-ABE via WASM (node)\n");
const cek = new Uint8Array(32).map((_, i) => i);

const t0 = performance.now();
// pk/msk arrive as pre-serialized opaque strings (u64 limbs would not survive
// a JS JSON round-trip); the outer parse only unwraps the envelope.
const bundle = JSON.parse(rabe.setup()) as { pk: string; msk: string };
console.log(`setup (once)                       ${(performance.now() - t0).toFixed(2).padStart(8)} ms`);
const pk = bundle.pk;
const msk = bundle.msk;

let failures = 0;
for (const [count, { policy, attrs }] of Object.entries(policies)) {
    console.log(`\n-- ${count} attribute(s): '${policy}'`);
    time(`keygen(${attrs.length} attrs)`, 5, () => rabe.cp_keygen(msk, JSON.stringify(attrs)));
    const sk = rabe.cp_keygen(msk, JSON.stringify(attrs));
    time("encrypt", 5, () => rabe.cp_encrypt(pk, policy, cek));
    const ct = rabe.cp_encrypt(pk, policy, cek);
    time("decrypt", 5, () => rabe.cp_decrypt(sk, ct));
    const recovered = rabe.cp_decrypt(sk, ct);
    const okay = Buffer.from(recovered).equals(Buffer.from(cek));
    if (!okay) failures += 1;
    console.log(`round-trip ${okay ? "ok" : "BROKEN"}; ct ${ct.length} B (json), sk ${sk.length} B (json)`);
}

// Sealed cases: a non-satisfying key must fail, not yield bytes.
console.log("\n-- refusal checks");
{
    const ct = rabe.cp_encrypt(pk, `${q("x")} and ${q("y")}`, cek);
    const skPartial = rabe.cp_keygen(msk, JSON.stringify(["x"]));
    let sealed = false;
    try {
        const out = rabe.cp_decrypt(skPartial, ct);
        sealed = !Buffer.from(out).equals(Buffer.from(cek));
    } catch { sealed = true; }
    console.log(`${sealed ? "ok  " : "FAIL"} [x] vs '"x" and "y"' -> sealed`);
    if (!sealed) failures += 1;
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nrabe wasm checks passed");
process.exit(failures ? 1 : 0);
