// Round-trip + refusal smoke over the built lib (node): the same checks the
// spike's correctness harness pinned, kept runnable against this package.
import { setup, keygen, wrapCek, decryptCek, normalizePolicy } from "../lib/index.js";

const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exit(1); } };

const { pk, msk } = await setup();
const cek = new Uint8Array(32).map((_, i) => i);

// Long unbalanced AND-chain: the normalizer must make rabe accept it.
const policy = '"a" and "b" and "c" and "d"';
console.log("normalized:", normalizePolicy(policy));
const wrapped = await wrapCek(pk, policy, cek);

const goodKey = await keygen(msk, ["a", "b", "c", "d"]);
const badKey = await keygen(msk, ["a", "b"]);

const opened = await decryptCek(goodKey, wrapped);
assert(opened && opened.length === 32 && opened.every((b, i) => b === i), "satisfying key must open the CEK");
assert((await decryptCek(badKey, wrapped)) === null, "unsatisfying key must yield null");

let refused = false;
try { normalizePolicy('not "a"'); } catch { refused = true; }
assert(refused, "negation must refuse");

console.log("abe smoke ok");
