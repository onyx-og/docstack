import { AttributeModel, Document } from "@docstack/shared";
import createLogger from "../../utils/logger/index.js";
import Class from "../class.js";
import type ClientStack from "../stack.js";
import { wrapDocumentKey, generateRandomString } from "./utils.js";
import {
    EncryptedPayload,
    decryptWithAesGcm,
    deriveKeyId,
    encryptWithAesGcm,
    importAesKeyFromHex,
    isEncryptedPayload,
    unwrapDocumentKey,
} from "./utils.js";

/**
 * Engine for handling document-level encryption and decryption.
 * 
 * CryptoEngine manages AES-GCM encryption for sensitive document fields.
 * It uses a document key (derived from user credentials) to encrypt/decrypt
 * fields marked with `encrypted: true` in their attribute configuration.
 * 
 * The engine can be disabled via stack options for scenarios where
 * encryption is not required.
 * 
 * @example
 * ```typescript
 * // Encryption is handled automatically during document operations
 * // when attributes are configured with `encrypted: true`
 * await Attribute.create(userClass, 'ssn', 'string', 'Social Security Number', {
 *     encrypted: true
 * });
 * 
 * // After authentication, the document key is available
 * await stack.authenticate({ username: 'user', password: 'pass' });
 * // Now encrypted fields will be automatically encrypted/decrypted
 * ```
 */
export class CryptoEngine {
    /** The hex-encoded document encryption key. */
    private documentKey?: string;
    /** The imported CryptoKey for Web Crypto API operations. */
    private cryptoKey?: CryptoKey;
    /** Identifier of {@link documentKey}, stamped onto everything it encrypts. */
    private documentKeyId?: string;
    /**
     * Keys this engine can still read but will never write with, by identifier.
     *
     * Re-keying a database is not instantaneous: between the moment a new key becomes the
     * one that encrypts and the moment the last field has been rewritten, both keys are
     * needed at once. Retiring a key rather than discarding it is what lets that interval
     * be arbitrarily long - and therefore what lets a re-key be done in the background,
     * interrupted, and resumed.
     */
    private retiredKeys = new Map<string, CryptoKey>();
    private readonly logger = createLogger().child({ module: "crypto-engine" });
    /** Reference to the parent stack. */
    private readonly stack: ClientStack;
    /** Whether the crypto engine is enabled. */
    private readonly enabled: boolean;

    /**
     * Creates a new CryptoEngine instance.
     * @param stack - The parent ClientStack instance
     */
    constructor(stack: ClientStack) {
        this.stack = stack;
        this.enabled = !stack.isCryptoEngineDisabled();
    }

    /**
     * Sets the document encryption key.
     * Called automatically during authentication to provide the key
     * derived from user credentials.
     * 
     * @param documentKey - The hex-encoded document key, or null to clear
     */
    public async setDocumentKey(documentKey?: string | null) {
        if (!this.enabled) return;
        this.documentKey = documentKey || undefined;
        this.cryptoKey = undefined;
        this.documentKeyId = documentKey ? await deriveKeyId(documentKey) : undefined;
    }

    /**
     * Returns the current document key.
     * @returns The hex-encoded document key, or undefined if not set
     */
    public getDocumentKey() {
        return this.enabled ? this.documentKey : undefined;
    }

    /**
     * Returns the identifier of the key this engine currently encrypts with.
     *
     * Every payload it writes carries this value, so comparing it against a stored
     * payload's `kid` says whether that field is current or still under an older key -
     * which is what makes an incremental re-key possible.
     *
     * @returns The key identifier, or `undefined` when no key is held.
     *
     * @example
     * ```typescript
     * const current = stack.cryptoEngine.getKeyId();
     * const stale = doc.ssn.kid !== current;   // needs rewriting
     * ```
     */
    public getKeyId() {
        return this.enabled ? this.documentKeyId : undefined;
    }

    /**
     * Keeps an old document key available for reading after it has stopped being used.
     *
     * Call this with the previous key before installing a replacement, and fields written
     * under either will open while the database is rewritten a piece at a time. Without
     * it, swapping the key makes every not-yet-rewritten field unreadable, which is what
     * forces a re-key to be a single offline pass that cannot be resumed if it stops
     * halfway.
     *
     * @param documentKey - The hex-encoded key to retire.
     * @returns The retired key's identifier.
     *
     * @example
     * ```typescript
     * await stack.cryptoEngine.retireDocumentKey(oldKey);  // still readable
     * await stack.unlock(newKey);                          // now writes under newKey
     * ```
     */
    public async retireDocumentKey(documentKey: string): Promise<string> {
        if (!this.enabled) throw new Error("Crypto engine is disabled");
        const kid = await deriveKeyId(documentKey);
        this.retiredKeys.set(kid, await importAesKeyFromHex(documentKey, ["decrypt"]));
        return kid;
    }

    /**
     * Identifiers of every key this engine can read with, current one first.
     *
     * @returns Key identifiers; empty when no key is held.
     */
    public getReadableKeyIds(): string[] {
        if (!this.enabled) return [];
        return [
            ...(this.documentKeyId ? [this.documentKeyId] : []),
            ...this.retiredKeys.keys(),
        ];
    }

    /**
     * Generates a cryptographically secure random string.
     * Useful for generating salts or nonces.
     * 
     * @param length - The length of the string to generate (default: 16)
     * @returns A random hex string
     */
    public generateRandomString(length: number = 16): string {
        return generateRandomString(length);
    }

    public async encryptValueForMarker(value: unknown) {
        if (!this.enabled) return null;
        const key = await this.getCryptoKey();
        if (!key) return null;
        return await this.encryptValue(value, key) as EncryptedPayload;
    }

    /**
     * Tests whether the current document key is the one a stack was written with.
     *
     * AES-GCM authenticates its ciphertext, so a wrong key fails to decrypt rather than
     * yielding plausible garbage - which makes the stored marker a reliable canary. This
     * is deliberately separate from {@link decryptValue}, which swallows failures to keep
     * reads non-fatal: here the failure *is* the answer.
     *
     * @param marker - The stored `encryptedMarker` payload.
     * @returns `true` if the held key decrypts the marker.
     *
     * @example
     * ```typescript
     * if (!await stack.cryptoEngine.verifyMarker(config.encryptedMarker)) {
     *     throw new Error("wrong document key");
     * }
     * ```
     */
    public async verifyMarker(marker: unknown): Promise<boolean> {
        if (!this.enabled) return false;
        if (!isEncryptedPayload(marker)) return false;
        const key = await this.getCryptoKey();
        if (!key) return false;
        try {
            await decryptWithAesGcm(marker, key);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks if the crypto engine is enabled.
     * @returns `true` if encryption is enabled
     */
    public isEnabled() {
        return this.enabled;
    }

    /**
     * Wraps a document key using the user's derived key.
     * Used during user registration to store the encrypted document key.
     * 
     * @param documentKey - The document key to wrap
     * @param derivedKeyHex - The user's derived key (from password)
     * @returns The wrapped (encrypted) document key
     */
    public async wrapDocumentKey(documentKey: string, derivedKeyHex: string): Promise<string> {
        return wrapDocumentKey(documentKey, derivedKeyHex);
    }

    /**
     * Unwraps and stores the document key using the user's derived key.
     * Called during authentication to recover the document key.
     * 
     * @param wrappedDocumentKey - The wrapped document key from the user record
     * @param derivedKey - The user's derived key (from password)
     * @returns The unwrapped document key
     * @throws Error if the crypto engine is disabled or keys are missing
     */
    public async unwrapAndStoreDocumentKey(wrappedDocumentKey?: string | null, derivedKey?: string | null) {
        if (!this.enabled) throw new Error("Crypto engine is disabled");
        if (!wrappedDocumentKey) throw new Error("Missing wrapped document key");
        if (!derivedKey) throw new Error("Missing derived key");

        const key = await unwrapDocumentKey(wrappedDocumentKey, await this.getCryptoKey(), derivedKey);
        await this.setDocumentKey(key);
        return key;
    }

    private async getCryptoKey() {
        if (!this.enabled) return null;
        if (!this.documentKey) return null;
        if (this.cryptoKey) return this.cryptoKey;

        this.cryptoKey = await importAesKeyFromHex(this.documentKey, ["encrypt", "decrypt"]);
        return this.cryptoKey;
    }

    /**
     * Chooses the key that can open a payload.
     *
     * A payload names its key, so an old field found mid-re-key is decrypted with the key
     * it was actually written under instead of failing against the current one. Payloads
     * from before identifiers existed name nothing, and are tried against the current key
     * - which is what they meant when only one key could exist.
     */
    private async resolveKeyFor(payload: EncryptedPayload, fallback: CryptoKey | null) {
        if (!payload.kid) return fallback;
        if (payload.kid === this.documentKeyId) return fallback;
        return this.retiredKeys.get(payload.kid) ?? null;
    }

    private async encryptValue(value: unknown, key: CryptoKey | null): Promise<EncryptedPayload | unknown> {
        if (!this.enabled) return value;
        if (!key) return value;
        if (value === undefined || value === null) return value;
        if (isEncryptedPayload(value)) return value;
        const serialized = JSON.stringify(value);
        return encryptWithAesGcm(serialized, key, this.documentKeyId);
    }

    private async decryptValue(value: unknown, key: CryptoKey | null): Promise<unknown> {
        if (!this.enabled) return value;
        if (!key) return value;
        if (!isEncryptedPayload(value)) return value;
        const resolved = await this.resolveKeyFor(value, key);
        if (!resolved) {
            this.logger.warn("No held key matches this payload; leaving it encrypted", { kid: value.kid });
            return value;
        }
        try {
            const decrypted = await decryptWithAesGcm(value, resolved);
            return JSON.parse(decrypted);
        } catch (error: any) {
            this.logger.error("Failed to decrypt value", { error: error?.message || error });
            return value;
        }
    }

    /**
     * Identifies which document keys contain encrypted data.
     * Combines schema-defined encrypted attributes with runtime detection.
     * 
     * @param document - The document to analyze
     * @param classObj - Optional class for schema-based detection
     * @returns Array of field names that are/should be encrypted
     */
    public identifyEncryptedKeys(document: Document, classObj?: Class): string[] {
        if (!this.enabled) return [];
        const encryptedFromSchema = classObj?.getEncryptedAttributes().map((attribute) => attribute.getName()) ?? [];
        const encryptedFromPayload = Object.keys(document).filter((key) => isEncryptedPayload((document as any)[key]));

        if (!encryptedFromSchema.length) {
            return encryptedFromPayload;
        }

        const merged = new Set<string>(encryptedFromSchema);
        for (const key of encryptedFromPayload) {
            merged.add(key);
        }
        return Array.from(merged);
    }

    /**
     * Encrypts sensitive fields in a document before storage.
     * Only encrypts fields marked with `encrypted: true` in the schema.
     * Modifies the document in place.
     * 
     * @param document - The document to encrypt
     * @param classObj - The class defining which fields to encrypt
     */
    public async encryptDocument(document: Document, classObj: Class) {
        if (!this.enabled) return;
        const encryptableAttributes = classObj.getEncryptedAttributes();
        if (!encryptableAttributes.length) return;

        const key = await this.getCryptoKey();
        if (!key) {
            this.logger.warn("Document key is not available; skipping encryption", { className: classObj.getName?.() ?? classObj.model?.name });
            return;
        }

        for (const attribute of encryptableAttributes) {
            const name = attribute.getName();
            if (!(name in document)) continue;
            const encrypted = await this.encryptValue((document as any)[name], key);
            (document as any)[name] = encrypted;
        }
    }

    /**
     * Decrypts encrypted fields in a document after retrieval.
     * Modifies the document in place.
     * 
     * @param document - The document to decrypt
     * @param classObj - Optional class for schema-based detection
     * @param encryptedKeys - Optional pre-computed list of encrypted field names
     */
    public async decryptDocument(document: Document, classObj?: Class, encryptedKeys?: string[]) {
        if (!this.enabled) return;
        const encryptedAttributes = encryptedKeys ?? this.identifyEncryptedKeys(document, classObj);
        if (!encryptedAttributes.length) return;

        const key = await this.getCryptoKey();
        if (!key) {
            this.logger.warn("Document key is not available; returning encrypted payload", { className: classObj?.getName?.() ?? classObj?.model?.name });
            return;
        }

        for (const name of encryptedAttributes) {
            const decrypted = await this.decryptValue((document as any)[name], key);
            (document as any)[name] = decrypted;
        }
    }
}

export type { EncryptedPayload } from "./utils.js";
export { wrapDocumentKey, unwrapDocumentKey, deriveKeyId, isEncryptedPayload } from "./utils.js";
