/** TS-FAME bench: setup / keygen / encaps / decaps at 1, 3, 10 attributes. */
import { setup, keygen, encaps, decaps, sizes } from "../src/ts-fame/index.js";

const time = async (label: string, iterations: number, fn: () => unknown) => {
    fn(); // warm
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const ms = (performance.now() - start) / iterations;
    console.log(`${label.padEnd(34)} ${ms.toFixed(2).padStart(8)} ms`);
    return ms;
};

const policies: Record<number, { policy: string; attrs: string[] }> = {
    1: { policy: "a1", attrs: ["a1"] },
    3: { policy: "a1 and (a2 or a3)", attrs: ["a1", "a2"] },
    10: {
        policy: "(a1 and a2 and a3 and a4 and a5) or (a6 and a7 and a8 and a9 and a10)",
        attrs: ["a6", "a7", "a8", "a9", "a10"],
    },
};

console.log("TS-FAME over @noble/curves bls12-381 (node)\n");
const t0 = performance.now();
const { pk, msk } = setup();
console.log(`setup (once)                       ${(performance.now() - t0).toFixed(2).padStart(8)} ms`);

for (const [count, { policy, attrs }] of Object.entries(policies)) {
    console.log(`\n-- ${count} attribute(s): '${policy}'`);
    await time(`keygen(${attrs.length} attrs)`, 5, () => keygen(msk, attrs));
    const sk = keygen(msk, attrs);
    await time("encaps", 5, () => encaps(pk, policy));
    const { ct, secret } = encaps(pk, policy);
    await time("decaps", 5, () => decaps(sk, ct));
    const recovered = decaps(sk, ct);
    const okay = recovered && Buffer.from(recovered).equals(Buffer.from(secret));
    const size = sizes(ct, sk);
    console.log(`round-trip ${okay ? "ok" : "BROKEN"}; ct ~${size.ciphertext} B, sk ~${size.secretKey} B`);
}
