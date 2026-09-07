/** Probe: which policy shapes rabe's MSP converter (utils::policy::msp::lw) survives. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const rabe = require("../rust/pkg-node/abe_rabe_wasm.js") as {
    setup(): string;
    cp_keygen(msk: string, attrs: string): string;
    cp_encrypt(pk: string, policy: string, plaintext: Uint8Array): string;
    cp_decrypt(sk: string, ct: string): Uint8Array;
};

const bundle = JSON.parse(rabe.setup()) as { pk: string; msk: string };
const cek = new Uint8Array(32).map((_, i) => i);
const q = (a: string) => `"${a}"`;

const probe = (name: string, policy: string, attrs: string[]) => {
    try {
        const ct = rabe.cp_encrypt(bundle.pk, policy, cek);
        const sk = rabe.cp_keygen(bundle.msk, JSON.stringify(attrs));
        const out = rabe.cp_decrypt(sk, ct);
        const okay = Buffer.from(out).equals(Buffer.from(cek));
        console.log(`${okay ? "ok      " : "WRONG   "} ${name}`);
    } catch (error: any) {
        console.log(`PANICS  ${name}  (${String(error?.message ?? error).slice(0, 60)})`);
    }
};

probe("2-AND chain", `${q("a1")} and ${q("a2")}`, ["a1", "a2"]);
probe("3-AND chain", `${q("a1")} and ${q("a2")} and ${q("a3")}`, ["a1", "a2", "a3"]);
probe("4-AND chain", ["a1", "a2", "a3", "a4"].map(q).join(" and "), ["a1", "a2", "a3", "a4"]);
probe("5-AND chain", ["a1", "a2", "a3", "a4", "a5"].map(q).join(" and "), ["a1", "a2", "a3", "a4", "a5"]);
probe("5-AND balanced parens", `((${q("a1")} and ${q("a2")}) and (${q("a3")} and ${q("a4")})) and ${q("a5")}`, ["a1", "a2", "a3", "a4", "a5"]);
probe("5-OR chain", ["a1", "a2", "a3", "a4", "a5"].map(q).join(" or "), ["a3"]);
probe("10-OR chain", ["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10"].map(q).join(" or "), ["a7"]);
probe("OR of 2-ANDs", `(${q("a1")} and ${q("a2")}) or (${q("a3")} and ${q("a4")})`, ["a3", "a4"]);
probe("OR of 3-ANDs", `(${q("a1")} and ${q("a2")} and ${q("a3")}) or (${q("a4")} and ${q("a5")} and ${q("a6")})`, ["a4", "a5", "a6"]);
probe("AND of ORs", `(${q("a1")} or ${q("a2")}) and (${q("a3")} or ${q("a4")})`, ["a2", "a3"]);
probe("ADR example", `(${q("role:manager")} and ${q("dept:sales")}) or ${q("clearance:secret")}`, ["clearance:secret"]);
