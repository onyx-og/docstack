/**
 * @docstack/abe — CP-ABE (AC17, the FAME scheme) for DocStack access scopes.
 *
 * rabe (Fraunhofer AISEC) compiled to WASM; gate ruling ADR-0045. Every key
 * and ciphertext is an OPAQUE string: rabe-bn serializes u64 limbs that do not
 * survive a JavaScript JSON round-trip (found the hard way in the spike), so
 * callers store and transport these blobs verbatim and never parse them.
 *
 * Two halves share the module because they share the WASM:
 * - **Authority half** (`setup`, `keygen`, `wrapCek`): runs where the
 *   application controls it — its server, an admin ceremony, later the
 *   docstack-server package. Master keys never belong on end-user devices.
 * - **Client half** (`decryptCek`): the only call @docstack/client makes.
 *   Denial is `null` — the mathematics failing IS the access decision.
 *
 * EXPERIMENTAL CRYPTOGRAPHY: unaudited (rabe-bn is a fork of an old zcash
 * BN254 crate, ~100-bit modern margin). An audit gates any production claim.
 */
import { ensureAbe } from "./runtime.js";
import { normalizePolicy } from "./policy.js";

export { normalizePolicy, parsePolicy, policyAttributes } from "./policy.js";
export type { PolicyNode } from "./policy.js";

/** Authority: mints the master key pair. Returns opaque `pk` (public) and `msk` (SECRET) blobs. */
export const setup = async (): Promise<{ pk: string; msk: string }> => {
    const abe = await ensureAbe();
    const bundle = JSON.parse(abe.setup()) as { pk: string; msk: string };
    return { pk: bundle.pk, msk: bundle.msk };
};

/**
 * Authority: issues a user's attribute secret key — their attributes embedded
 * in the key material itself. The returned blob is the `attributeKey` the
 * consumer's infrastructure hands to that user's devices (spec 02 §4).
 */
export const keygen = async (msk: string, attributes: string[]): Promise<string> => {
    if (!attributes.length) throw new Error("keygen requires at least one attribute.");
    const abe = await ensureAbe();
    return abe.cp_keygen(msk, JSON.stringify(attributes));
};

/**
 * Authority: seals a scope's 32-byte CEK under a policy formula. The formula
 * is normalized first (balanced parenthesization — rabe's converter panics on
 * long unbalanced AND-chains), so authors write it naturally.
 */
export const wrapCek = async (pk: string, policy: string, cek: Uint8Array): Promise<string> => {
    if (cek.length !== 32) throw new Error(`wrapCek seals 32-byte CEKs; got ${cek.length} bytes.`);
    const abe = await ensureAbe();
    return abe.cp_encrypt(pk, normalizePolicy(policy), cek);
};

/**
 * Client: attempts a scope's CEK with the session's attribute key.
 * `null` means the key does not satisfy the scope's policy — access denial as
 * decryption failure, the whole point of the architecture.
 */
export const decryptCek = async (attributeKey: string, wrappedCek: string): Promise<Uint8Array | null> => {
    const abe = await ensureAbe();
    try {
        return abe.cp_decrypt(attributeKey, wrappedCek);
    } catch {
        return null;
    }
};
