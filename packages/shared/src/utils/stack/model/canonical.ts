/**
 * Serializes a value with object keys in sorted order, so the same content always
 * produces the same string whatever order it was written in.
 *
 * Used for hashing a model and for comparing two attribute models, which is why it
 * lives on its own: one serialization, so a hash and a diff can never disagree about
 * whether two things are the same.
 *
 * @param value - Any JSON-serializable value. `undefined` members are dropped, matching
 * `JSON.stringify`, so a declared-but-undefined key cannot look like a change.
 * @returns A deterministic JSON string.
 */
export const canonicalJson = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
};

/**
 * Hex-encoded SHA-256, through Web Crypto so the same code runs in a browser and in
 * Node.
 *
 * @param input - The string to digest.
 * @returns The digest, lowercase hex.
 * @throws If the runtime exposes no Web Crypto digest.
 */
export const sha256Hex = async (input: string): Promise<string> => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error(
            "Model hashing needs Web Crypto (globalThis.crypto.subtle), which this runtime does not expose."
        );
    }
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
};
