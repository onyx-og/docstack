/**
 * FAME CP-ABE (Agrawal-Chase, CCS 2017 - the "AC17" scheme) over BLS12-381,
 * as a KEM: encapsulation binds a random GT element to a policy; its hash is
 * the shared secret that wraps a CEK outside this module.
 *
 * SPIKE-GRADE CRYPTOGRAPHY. The curve arithmetic is @noble/curves (audited);
 * this scheme layer is hand-built from the paper and verified only by its own
 * property tests. It measures feasibility, not security (ADR-0045).
 *
 * Construction notes (the exponent-slot map used throughout):
 *   slot l=1 <-> b1*r1, l=2 <-> b2*r2, l=3 <-> r1+r2, sides t in {1,2} <-> a_t.
 *   Hash labels are domain-separated: A|attr|l|t for attribute rows,
 *   C|j|l|t for MSP column terms; sk' carries the column-1 (j=1) terms, since
 *   reconstruction sums rows to e1 and only column 1 survives.
 */

import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes, utf8ToBytes, concatBytes } from "@noble/hashes/utils";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";
import { parsePolicy, policyToMsp, reconstruct, Msp } from "./policy.js";

const Fr = bls.fields.Fr;
const Fp12 = bls.fields.Fp12;
const ORDER = Fr.ORDER;
const G1 = bls.G1.ProjectivePoint;
const G2 = bls.G2.ProjectivePoint;
type G1Point = InstanceType<typeof G1> | ReturnType<typeof hashG1>;
type G2Point = InstanceType<typeof G2>;
type Gt = ReturnType<typeof bls.pairing>;

const DST = "DOCSTACK-ABE-SPIKE-FAME-V1";

const randomScalar = (): bigint => {
    // 48 uniform bytes reduced mod r: bias < 2^-128. Reject zero.
    while (true) {
        const candidate = Fr.create(bytesToNumberBE(randomBytes(48)));
        if (candidate !== 0n) return candidate;
    }
};

const hashG1 = (label: string) =>
    bls.G1.hashToCurve(utf8ToBytes(label), { DST }) as unknown as InstanceType<typeof G1>;

const attrLabel = (attr: string, l: number, t: number) => `A|${attr}|${l}|${t}`;
const colLabel = (j: number, l: number, t: number) => `C|${j}|${l}|${t}`;

export type PublicKey = {
    h: G2Point; H1: G2Point; H2: G2Point;
    T1: Gt; T2: Gt;
};
export type MasterKey = {
    g: G1Point; h: G2Point;
    a: [bigint, bigint]; b: [bigint, bigint];
    gD: [G1Point, G1Point, G1Point]; // g^d1, g^d2, g^d3
};
export type SecretKey = {
    attrs: string[];
    sk0: [G2Point, G2Point, G2Point];
    // per attr: [sk_{y,1}, sk_{y,2}, sk_{y,3}=g^{-sigma_y}]
    skY: Map<string, [G1Point, G1Point, G1Point]>;
    skPrime: [G1Point, G1Point, G1Point];
};
export type Ciphertext = {
    policy: string;
    msp: Msp;
    ct0: [G2Point, G2Point, G2Point];
    ctRows: [G1Point, G1Point, G1Point][]; // per MSP row: l = 1..3
    ctPrime: Gt;
};

export const setup = (): { pk: PublicKey; msk: MasterKey } => {
    const g = G1.BASE.multiply(randomScalar());
    const h = G2.BASE.multiply(randomScalar());
    const a: [bigint, bigint] = [randomScalar(), randomScalar()];
    const b: [bigint, bigint] = [randomScalar(), randomScalar()];
    const d: [bigint, bigint, bigint] = [randomScalar(), randomScalar(), randomScalar()];
    const eGH = bls.pairing(g, h);
    return {
        pk: {
            h,
            H1: h.multiply(a[0]),
            H2: h.multiply(a[1]),
            T1: Fp12.pow(eGH, Fr.create(d[0] * a[0] + d[2])),
            T2: Fp12.pow(eGH, Fr.create(d[1] * a[1] + d[2])),
        },
        msk: { g, h, a, b, gD: [g.multiply(d[0]), g.multiply(d[1]), g.multiply(d[2])] },
    };
};

export const keygen = (msk: MasterKey, attrs: string[]): SecretKey => {
    const r1 = randomScalar();
    const r2 = randomScalar();
    const slots: [bigint, bigint, bigint] = [
        Fr.create(msk.b[0] * r1),
        Fr.create(msk.b[1] * r2),
        Fr.create(r1 + r2),
    ];
    const sk0: [G2Point, G2Point, G2Point] = [
        msk.h.multiply(slots[0]),
        msk.h.multiply(slots[1]),
        msk.h.multiply(slots[2]),
    ];
    const aInv = [Fr.inv(msk.a[0]), Fr.inv(msk.a[1])];

    const buildSide = (labelOf: (l: number, t: number) => string, t: number, extra: bigint): G1Point => {
        // prod_l H(label(l,t))^{slot_l / a_t} * g^{extra / a_t}
        let acc = msk.g.multiply(Fr.create(extra * aInv[t - 1]));
        for (let l = 1; l <= 3; l++) {
            const exponent = Fr.create(slots[l - 1] * aInv[t - 1]);
            acc = acc.add(hashG1(labelOf(l, t)).multiply(exponent));
        }
        return acc;
    };

    const skY = new Map<string, [G1Point, G1Point, G1Point]>();
    for (const attr of attrs) {
        const sigma = randomScalar();
        skY.set(attr, [
            buildSide((l, t) => attrLabel(attr, l, t), 1, sigma),
            buildSide((l, t) => attrLabel(attr, l, t), 2, sigma),
            msk.g.multiply(Fr.create(ORDER - sigma)),
        ]);
    }
    const sigmaPrime = randomScalar();
    const skPrime: [G1Point, G1Point, G1Point] = [
        msk.gD[0].add(buildSide((l, t) => colLabel(1, l, t), 1, sigmaPrime)),
        msk.gD[1].add(buildSide((l, t) => colLabel(1, l, t), 2, sigmaPrime)),
        msk.gD[2].add(msk.g.multiply(Fr.create(ORDER - sigmaPrime))),
    ];
    return { attrs, sk0, skY, skPrime };
};

/** Encapsulate: a fresh GT element under the policy; secret = SHA-256(GT bytes). */
export const encaps = (pk: PublicKey, policy: string): { ct: Ciphertext; secret: Uint8Array } => {
    const msp = policyToMsp(parsePolicy(policy), ORDER);
    const s1 = randomScalar();
    const s2 = randomScalar();
    const s = [s1, s2];

    const ct0: [G2Point, G2Point, G2Point] = [
        pk.H1.multiply(s1),
        pk.H2.multiply(s2),
        pk.h.multiply(Fr.create(s1 + s2)),
    ];

    const width = msp.rows[0].length;
    const ctRows = msp.rows.map((row, i): [G1Point, G1Point, G1Point] => {
        const perSlot: G1Point[] = [];
        for (let l = 1; l <= 3; l++) {
            let acc: G1Point | null = null;
            for (const t of [1, 2] as const) {
                let point = hashG1(attrLabel(msp.labels[i], l, t)).multiply(s[t - 1]);
                for (let j = 1; j <= width; j++) {
                    const mij = row[j - 1];
                    if (mij === 0n) continue;
                    point = point.add(hashG1(colLabel(j, l, t)).multiply(Fr.create(mij * s[t - 1])));
                }
                acc = acc ? acc.add(point) : point;
            }
            perSlot.push(acc!);
        }
        return perSlot as [G1Point, G1Point, G1Point];
    });

    const seed = Fp12.mul(Fp12.pow(pk.T1, s1), Fp12.pow(pk.T2, s2));
    const mask = randomGt();
    const ctPrime = Fp12.mul(seed, mask.element);
    return { ct: { policy, msp, ct0, ctRows, ctPrime }, secret: mask.secret };
};

/** A random GT element carried as g^x paired with h^y is costly; instead use
 *  e(g,h)^z for random z with fixed spike generators - uniform in the target
 *  subgroup, which is all the KEM needs. */
const spikeG = G1.BASE;
const spikeH = G2.BASE;
const spikeE = bls.pairing(spikeG, spikeH);
const randomGt = (): { element: Gt; secret: Uint8Array } => {
    const z = randomScalar();
    const element = Fp12.pow(spikeE, z);
    return { element, secret: sha256(gtBytes(element)) };
};

const gtBytes = (element: Gt): Uint8Array => {
    const anyField = Fp12 as unknown as { toBytes?: (e: Gt) => Uint8Array };
    if (anyField.toBytes) return anyField.toBytes(element);
    // Fallback: walk the tower c0/c1 structure collecting limbs deterministically.
    const limbs: bigint[] = [];
    const walk = (node: unknown): void => {
        if (typeof node === "bigint") { limbs.push(node); return; }
        if (node && typeof node === "object") {
            for (const key of Object.keys(node as object).sort()) walk((node as Record<string, unknown>)[key]);
        }
    };
    walk(element);
    return concatBytes(...limbs.map(limb => {
        const hex = limb.toString(16).padStart(96, "0");
        return Uint8Array.from(hex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    }));
};

/** Decapsulate: the shared secret, or null when the key's attributes do not
 *  satisfy the ciphertext's policy - denial IS the math failing. */
export const decaps = (sk: SecretKey, ct: Ciphertext): Uint8Array | null => {
    const gamma = reconstruct(ct.msp, new Set(sk.attrs), ORDER);
    if (!gamma) return null;

    // num_l = sk'_l * prod_i sk_{pi(i),l}^{gamma_i}; den_l = prod_i ct_{i,l}^{gamma_i}
    const numInputs: G1Point[] = [...sk.skPrime];
    const denInputs: (G1Point | null)[] = [null, null, null];
    for (const [rowIndex, coefficient] of gamma) {
        const attr = ct.msp.labels[rowIndex];
        const attrKey = sk.skY.get(attr);
        if (!attrKey) return null;
        for (let l = 0; l < 3; l++) {
            numInputs[l] = numInputs[l].add(attrKey[l].multiply(coefficient));
            const weighted = ct.ctRows[rowIndex][l].multiply(coefficient);
            denInputs[l] = denInputs[l] ? denInputs[l]!.add(weighted) : weighted;
        }
    }

    let num = Fp12.ONE;
    let den = Fp12.ONE;
    for (let l = 0; l < 3; l++) {
        num = Fp12.mul(num, bls.pairing(numInputs[l], ct.ct0[l]));
        den = Fp12.mul(den, bls.pairing(denInputs[l]!, sk.sk0[l]));
    }
    // ct' = seed * mask, and num/den telescopes to exactly `seed`.
    const mask = Fp12.mul(ct.ctPrime, Fp12.mul(den, Fp12.inv(num)));
    return sha256(gtBytes(mask));
};

/** Rough serialized sizes (bytes), for the evidence matrix. */
export const sizes = (ct: Ciphertext, sk: SecretKey) => ({
    ciphertext: 3 * 96 + ct.ctRows.length * 3 * 48 + 576,
    secretKey: 3 * 96 + (sk.skY.size + 1) * 3 * 48,
});
