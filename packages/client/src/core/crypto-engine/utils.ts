import { webcrypto } from "crypto";

export type EncryptedPayload = {
    __enc: true;
    iv: string;
    data: string;
    alg: "AES-GCM";
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const getCrypto = () => globalThis.crypto || webcrypto;

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
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array => {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(value, "base64"));
    }
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
        hexToBytes(hexKey),
        { name: "AES-GCM", length: 256 },
        false,
        usages,
    );
};

export const isEncryptedPayload = (value: unknown): value is EncryptedPayload => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return candidate.__enc === true && typeof candidate.iv === "string" && typeof candidate.data === "string";
};

export const encryptWithAesGcm = async (plaintext: string, key: CryptoKey): Promise<EncryptedPayload> => {
    const cryptoObj = getCrypto();
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const ciphertext = await cryptoObj.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
    return {
        __enc: true,
        iv: toBase64(iv),
        data: toBase64(ciphertext),
        alg: "AES-GCM",
    };
};

export const decryptWithAesGcm = async (payload: EncryptedPayload, key: CryptoKey): Promise<string> => {
    const cryptoObj = getCrypto();
    const decrypted = await cryptoObj.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(payload.iv) },
        key,
        fromBase64(payload.data),
    );
    return decoder.decode(decrypted);
};

export const wrapDocumentKey = async (documentKey: string, derivedKeyHex: string): Promise<string> => {
    const key = await importAesKeyFromHex(derivedKeyHex);
    const payload = await encryptWithAesGcm(documentKey, key);
    return JSON.stringify(payload);
};

export const unwrapDocumentKey = async (wrappedDocumentKey: string, derivedKeyHex: string): Promise<string> => {
    const parsed: unknown = JSON.parse(wrappedDocumentKey);
    if (!isEncryptedPayload(parsed)) {
        throw new Error("Wrapped document key payload is malformed");
    }
    const key = await importAesKeyFromHex(derivedKeyHex, ["decrypt"]);
    return decryptWithAesGcm(parsed, key);
};
