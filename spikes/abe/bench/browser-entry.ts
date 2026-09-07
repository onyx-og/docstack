/** Browser bench: both vehicles in one page; the driver scrapes __LINES/__DONE. */
import { setup, keygen, encaps, decaps } from "../src/ts-fame/index.js";
import init, * as rabe from "../rust/pkg-web/abe_rabe_wasm.js";

declare global { interface Window { __LINES: string[]; __DONE: boolean; __FAILED: boolean } }
window.__LINES = [];
window.__DONE = false;
window.__FAILED = false;
const log = (line: string) => { window.__LINES.push(line); console.log(line); };

const time = (label: string, iterations: number, fn: () => unknown) => {
    fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    log(`${label}: ${((performance.now() - start) / iterations).toFixed(2)} ms`);
};

const q = (a: string) => `"${a}"`;
const equal = (x: Uint8Array | null, y: Uint8Array) =>
    !!x && x.length === y.length && x.every((byte, i) => byte === y[i]);

async function main() {
    // --- TS-FAME ---
    log("== ts-fame (browser)");
    let t = performance.now();
    const { pk, msk } = setup();
    log(`setup: ${(performance.now() - t).toFixed(2)} ms`);
    const cases = [
        { name: "1-attr", policy: "a1", attrs: ["a1"] },
        { name: "3-attr", policy: "a1 and (a2 or a3)", attrs: ["a1", "a2"] },
        { name: "10-attr", policy: "(a1 and a2 and a3 and a4 and a5) or (a6 and a7 and a8 and a9 and a10)", attrs: ["a6", "a7", "a8", "a9", "a10"] },
    ];
    for (const { name, policy, attrs } of cases) {
        const sk = keygen(msk, attrs);
        time(`ts-fame keygen ${name}`, 3, () => keygen(msk, attrs));
        time(`ts-fame encaps ${name}`, 3, () => encaps(pk, policy));
        const { ct, secret } = encaps(pk, policy);
        time(`ts-fame decaps ${name}`, 3, () => decaps(sk, ct));
        const opened = decaps(sk, ct);
        log(`ts-fame roundtrip ${name}: ${equal(opened, secret) ? "ok" : "BROKEN"}`);
        if (!equal(opened, secret)) window.__FAILED = true;
    }

    // --- rabe wasm ---
    log("== rabe wasm (browser)");
    t = performance.now();
    // Explicit path: esbuild rebased the module, so the default relative fetch
    // would look in /bench/dist/.
    await init({ module_or_path: "/rust/pkg-web/abe_rabe_wasm_bg.wasm" });
    log(`wasm init: ${(performance.now() - t).toFixed(2)} ms`);
    t = performance.now();
    const bundle = JSON.parse(rabe.setup()) as { pk: string; msk: string };
    log(`setup: ${(performance.now() - t).toFixed(2)} ms`);
    const cek = new Uint8Array(32).map((_, i) => i);
    const rabeCases = [
        { name: "1-attr", policy: q("a1"), attrs: ["a1"] },
        { name: "3-attr", policy: `${q("a1")} and (${q("a2")} or ${q("a3")})`, attrs: ["a1", "a2"] },
        { name: "10-attr", policy: `(((${q("a1")} and ${q("a2")}) and (${q("a3")} and ${q("a4")})) and ${q("a5")}) or (((${q("a6")} and ${q("a7")}) and (${q("a8")} and ${q("a9")})) and ${q("a10")})`, attrs: ["a6", "a7", "a8", "a9", "a10"] },
    ];
    for (const { name, policy, attrs } of rabeCases) {
        time(`rabe keygen ${name}`, 3, () => rabe.cp_keygen(bundle.msk, JSON.stringify(attrs)));
        const sk = rabe.cp_keygen(bundle.msk, JSON.stringify(attrs));
        time(`rabe encrypt ${name}`, 3, () => rabe.cp_encrypt(bundle.pk, policy, cek));
        const ct = rabe.cp_encrypt(bundle.pk, policy, cek);
        time(`rabe decrypt ${name}`, 3, () => rabe.cp_decrypt(sk, ct));
        const opened = rabe.cp_decrypt(sk, ct);
        log(`rabe roundtrip ${name}: ${equal(opened, cek) ? "ok" : "BROKEN"}`);
        if (!equal(opened, cek)) window.__FAILED = true;
    }
    window.__DONE = true;
}

main().catch(error => { log(`FATAL: ${error?.message ?? error}`); window.__FAILED = true; window.__DONE = true; });
