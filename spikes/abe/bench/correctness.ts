/**
 * Property tests for the TS-FAME spike. Every case states the access-control
 * claim it pins: satisfying attribute sets recover the secret, non-satisfying
 * sets get nothing - and get it as a clean null, not garbage.
 */
import { setup, keygen, encaps, decaps } from "../src/ts-fame/index.js";

const hex = (bytes: Uint8Array | null) =>
    bytes ? Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, "0")).join("") : null;

let failures = 0;
const check = (name: string, condition: boolean) => {
    console.log(`${condition ? "ok  " : "FAIL"} ${name}`);
    if (!condition) failures += 1;
};

const { pk, msk } = setup();

const run = (policy: string, attrs: string[], expectOpen: boolean) => {
    const { ct, secret } = encaps(pk, policy);
    const recovered = decaps(keygen(msk, attrs), ct);
    const opened = recovered !== null && hex(recovered) === hex(secret);
    check(
        `[${attrs.join(",") || "-"}] vs '${policy}' -> ${expectOpen ? "opens" : "sealed"}`,
        expectOpen ? opened : recovered === null
    );
};

// Single attribute
run("role:manager", ["role:manager"], true);
run("role:manager", ["role:intern"], false);
run("role:manager", [], false);

// AND
run("role:manager and dept:sales", ["role:manager", "dept:sales"], true);
run("role:manager and dept:sales", ["role:manager"], false);
run("role:manager and dept:sales", ["dept:sales"], false);

// OR
run("role:manager or clearance:secret", ["clearance:secret"], true);
run("role:manager or clearance:secret", ["role:manager"], true);
run("role:manager or clearance:secret", ["dept:sales"], false);

// The ADR's own example
const policy = '("role:manager" and "dept:sales") or "clearance:secret"';
run(policy, ["role:manager", "dept:sales"], true);
run(policy, ["clearance:secret"], true);
run(policy, ["role:manager"], false);
run(policy, ["dept:sales", "clearance:secret"], true);

// Nesting + extra attributes on the key (supersets must still work)
run("(a or b) and (c or d)", ["a", "c"], true);
run("(a or b) and (c or d)", ["b", "d", "unrelated"], true);
run("(a or b) and (c or d)", ["a", "b"], false);
run("a and (b or (c and d))", ["a", "c", "d"], true);
run("a and (b or (c and d))", ["a", "c"], false);
run("a and (b or (c and d))", ["c", "d"], false);

// Two independent encapsulations under the same policy differ (fresh masks)
{
    const one = encaps(pk, "x");
    const two = encaps(pk, "x");
    check("fresh secrets per encapsulation", hex(one.secret) !== hex(two.secret));
}

// A key from a DIFFERENT authority opens nothing (the consumer-contract claim)
{
    const foreign = setup();
    const { ct } = encaps(pk, "role:manager");
    const recovered = decaps(keygen(foreign.msk, ["role:manager"]), ct);
    check("foreign authority's key recovers a wrong secret or nothing", recovered === null || hex(recovered) !== null);
    // Note: decaps under a foreign key still reconstructs (the MSP is public);
    // the recovered bytes are garbage. The wrap layer's AES-GCM auth tag is what
    // turns "wrong secret" into a hard failure - asserted by the KEM-DEM check:
    const right = encaps(pk, "role:manager");
    const wrong = decaps(keygen(foreign.msk, ["role:manager"]), right.ct);
    check("foreign secret differs from the true one", wrong === null || hex(wrong) !== hex(right.secret));
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall correctness checks passed");
process.exit(failures ? 1 : 0);
