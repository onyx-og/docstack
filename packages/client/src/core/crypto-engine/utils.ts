

export type EncryptedPayload = {
    __enc: true;
    iv: string;
    data: string;
    alg: "AES-GCM";
    /**
     * Identifies the document key this value was encrypted under.
     *
     * Without it a database that holds two keys is illegible: a field either opens or it
     * does not, and nothing says which key it wanted, so re-keying has to be
     * all-or-nothing and cannot be resumed after an interruption. With it, the fields
     * still under an old key can be found, so re-keying becomes incremental and
     * restartable.
     *
     * Optional because payloads written before it existed do not carry one. A payload
     * without a `kid` is assumed to belong to the primary key - which is what it meant
     * when there could only be one.
     *
     * @see deriveKeyId
     */
    kid?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const getCrypto = () => globalThis.crypto;

export const hexToBytes = (hex: string): Uint8Array => {
    if (hex.length % 2 !== 0) {
        throw new Error("Hex value must have an even length");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
};

const toUint8Array = (data: ArrayBuffer | Uint8Array) => data instanceof ArrayBuffer ? new Uint8Array(data) : data;

export const toBase64 = (data: ArrayBuffer | Uint8Array): string => {
    const bytes = toUint8Array(data);    
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array => {    
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

export const importAesKeyFromHex = async (hexKey: string, usages: KeyUsage[] = ["encrypt", "decrypt"]): Promise<CryptoKey> => {
    const cryptoObj = getCrypto();
    return cryptoObj.subtle.importKey(
        "raw",
        hexToBytes(hexKey) as BufferSource,
        { name: "AES-GCM" } as any,
        false,
        usages,
    );
};

export const isEncryptedPayload = (value: unknown): value is EncryptedPayload => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return candidate.__enc === true && typeof candidate.iv === "string" && typeof candidate.data === "string";
};

/**
 * Derives the stable identifier of a document key.
 *
 * A truncated SHA-256 of the key's bytes: deterministic, so two devices handed the same
 * key arrive at the same identifier without talking to each other, and one-way, so
 * publishing it in every stored payload discloses nothing about the key itself. Eight
 * bytes is far more than needed to tell apart the handful of keys a database sees across
 * its re-keyings, and short enough to sit on every encrypted field without weighing it
 * down.
 *
 * @param hexKey - The hex-encoded document key.
 * @returns A 16-character hex identifier.
 *
 * @example
 * ```typescript
 * const kid = await deriveKeyId(documentKey); // e.g. "9f2c1ab30e77d541"
 * ```
 */
export const deriveKeyId = async (hexKey: string): Promise<string> => {
    const cryptoObj = getCrypto();
    const bytes = hexToBytes(hexKey);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await cryptoObj.subtle.digest("SHA-256", buffer as BufferSource);
    return Array.from(new Uint8Array(digest).slice(0, 8))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
};

export const encryptWithAesGcm = async (plaintext: string, key: CryptoKey, kid?: string): Promise<EncryptedPayload> => {
    const cryptoObj = getCrypto();
    const iv = new Uint8Array(12);
    (cryptoObj as any).getRandomValues(iv);
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
    const ciphertext = await cryptoObj.subtle.encrypt({ name: "AES-GCM", iv: ivBuffer } as any, key, encoder.encode(plaintext));
    const payload: EncryptedPayload = {
        __enc: true,
        iv: toBase64(iv),
        data: toBase64(ciphertext),
        alg: "AES-GCM",
    };
    if (kid) payload.kid = kid;
    return payload;
};

export const decryptWithAesGcm = async (payload: EncryptedPayload, key: CryptoKey): Promise<string> => {
    const cryptoObj = getCrypto();
    const ivBytes = fromBase64(payload.iv);
    const dataBytes = fromBase64(payload.data);
    const ivBuffer = ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength);
    const dataBuffer = dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength);
    const decrypted = await cryptoObj.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer } as any,
        key,
        dataBuffer as BufferSource,
    );
    return decoder.decode(decrypted);
};

export const wrapDocumentKey = async (documentKey: string, derivedKeyHex: string): Promise<string> => {
    const key = await importAesKeyFromHex(derivedKeyHex);
    const payload = await encryptWithAesGcm(documentKey, key);
    return JSON.stringify(payload);
};

export const unwrapDocumentKey = async (wrappedDocumentKey: string, cryptoKey: CryptoKey, derivedKeyHex: string): Promise<string> => {
    const parsed: unknown = JSON.parse(wrappedDocumentKey);
    if (!isEncryptedPayload(parsed)) {
        throw new Error("Wrapped document key payload is malformed: "+wrappedDocumentKey);
    }
    const key = await importAesKeyFromHex(derivedKeyHex, ["decrypt"]);
    const firstLayer = await decryptWithAesGcm(parsed, key);
    return firstLayer;
    // return await decryptWithAesGcm((JSON.parse(firstLayer) as EncryptedPayload), key);
};

/**
 * Generate random string of given length in bytes, returned as hex string
 *
**/
export const generateRandomString = (length: number = 16): string => {
    const cryptoObj = getCrypto();
    const array = new Uint8Array(length);
    (cryptoObj as any).getRandomValues(array);
    return Array.from(array).map(b => ('00' + b.toString(16)).slice(-2)).join('');
}
