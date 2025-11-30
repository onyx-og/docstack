import { AttributeModel, Document } from "@docstack/shared";
import createLogger from "../../utils/logger/index.js";
import Class from "../class.js";
import type ClientStack from "../stack.js";
import {
    EncryptedPayload,
    decryptWithAesGcm,
    encryptWithAesGcm,
    importAesKeyFromHex,
    isEncryptedPayload,
    unwrapDocumentKey,
} from "./utils.js";

export class CryptoEngine {
    private documentKey?: string;
    private cryptoKey?: CryptoKey;
    private readonly logger = createLogger().child({ module: "crypto-engine" });
    private readonly stack: ClientStack;

    constructor(stack: ClientStack) {
        this.stack = stack;
    }

    public async setDocumentKey(documentKey?: string | null) {
        this.documentKey = documentKey || undefined;
        this.cryptoKey = undefined;
    }

    public getDocumentKey() {
        return this.documentKey;
    }

    public async unwrapAndStoreDocumentKey(wrappedDocumentKey?: string | null, derivedKey?: string | null) {
        if (!wrappedDocumentKey || !derivedKey) return null;

        const key = await unwrapDocumentKey(wrappedDocumentKey, derivedKey);
        await this.setDocumentKey(key);
        return key;
    }

    private async getCryptoKey() {
        if (!this.documentKey) return null;
        if (this.cryptoKey) return this.cryptoKey;

        this.cryptoKey = await importAesKeyFromHex(this.documentKey, ["encrypt", "decrypt"]);
        return this.cryptoKey;
    }

    private shouldEncrypt(attribute: AttributeModel) {
        return attribute.config?.encrypted === true && attribute.config?.primaryKey !== true;
    }

    private async encryptValue(value: unknown, key: CryptoKey | null): Promise<EncryptedPayload | unknown> {
        if (!key) return value;
        if (value === undefined || value === null) return value;
        if (isEncryptedPayload(value)) return value;
        const serialized = JSON.stringify(value);
        return encryptWithAesGcm(serialized, key);
    }

    private async decryptValue(value: unknown, key: CryptoKey | null): Promise<unknown> {
        if (!key) return value;
        if (!isEncryptedPayload(value)) return value;
        try {
            const decrypted = await decryptWithAesGcm(value, key);
            return JSON.parse(decrypted);
        } catch (error: any) {
            this.logger.error("Failed to decrypt value", { error: error?.message || error });
            return value;
        }
    }

    public async encryptDocument(document: Document, classObj: Class) {
        const attributes = Object.values(classObj.getAttributes());
        const encryptableAttributes = attributes.filter((attribute) => this.shouldEncrypt(attribute.getModel()));
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

    public async decryptDocument(document: Document, classObj: Class) {
        const attributes = Object.values(classObj.getAttributes());
        const encryptedAttributes = attributes.filter((attribute) => this.shouldEncrypt(attribute.getModel()));
        if (!encryptedAttributes.length) return;

        const key = await this.getCryptoKey();
        if (!key) {
            this.logger.warn("Document key is not available; returning encrypted payload", { className: classObj.getName?.() ?? classObj.model?.name });
            return;
        }

        for (const attribute of encryptedAttributes) {
            const name = attribute.getName();
            const decrypted = await this.decryptValue((document as any)[name], key);
            (document as any)[name] = decrypted;
        }
    }
}

export type { EncryptedPayload } from "./utils.js";
export { wrapDocumentKey, unwrapDocumentKey } from "./utils.js";
