import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { setup, keygen, policyAttributes } from "@docstack/abe";
import { ClientStack } from "@docstack/client";
import type { AccessScopeModel } from "@docstack/shared";
import type { AuthorityMaterial } from "../types.js";
import type { ServerConfig } from "../config/schema.js";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** The encrypted file format: `msk` under AES-256-GCM, the key from scrypt over the passphrase. */
interface AuthorityFile {
    version: 1;
    pk: string;
    msk: { salt: string; iv: string; tag: string; data: string };
}

/**
 * The CP-ABE authority (spec 03 §6): holds the master secret, mints attribute keys for
 * sessions and the omni key for trusted stacks, and seals scope keys.
 *
 * Losing `msk` ends key minting and scope rotation; the file is backed up out of band
 * and this class never writes it unless asked to.
 */
export class Authority {
    readonly pk: string;
    private readonly msk: string;
    private readonly keys = new Map<string, Promise<string>>();

    private constructor(material: AuthorityMaterial) {
        this.pk = material.pk;
        this.msk = material.msk;
    }

    /** Mints a fresh master pair. Used by `ds init` and by tests. */
    static async generate(): Promise<Authority> {
        return new Authority(await setup());
    }

    static fromMaterial(material: AuthorityMaterial): Authority {
        return new Authority(material);
    }

    /** Resolves the configured authority, or `null` for a node without one (a blind hub). */
    static async load(config: ServerConfig["authority"]): Promise<Authority | null> {
        if (!config) return null;
        if ("msk" in config) return new Authority({ pk: config.pk, msk: config.msk });
        if ("load" in config) return new Authority(await config.load());
        return Authority.fromFile(config.file, config.passphrase);
    }

    static async fromFile(path: string, passphrase: string | undefined): Promise<Authority> {
        const file = JSON.parse(await readFile(path, "utf8")) as AuthorityFile;
        if (file.version !== 1) throw new Error(`Unsupported authority file version ${String((file as any).version)} at ${path}`);
        if (!passphrase) throw new Error(`The authority file ${path} is encrypted; set DS_AUTHORITY_PASSPHRASE (or DS_AUTHORITY_PASSPHRASE_FILE).`);
        const key = await scrypt(passphrase, Buffer.from(file.msk.salt, "base64"), 32);
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.msk.iv, "base64"));
        decipher.setAuthTag(Buffer.from(file.msk.tag, "base64"));
        const msk = Buffer.concat([decipher.update(Buffer.from(file.msk.data, "base64")), decipher.final()]).toString("utf8");
        return new Authority({ pk: file.pk, msk });
    }

    /** Writes the material as an encrypted file, atomically. */
    async save(path: string, passphrase: string): Promise<void> {
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const key = await scrypt(passphrase, salt, 32);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const data = Buffer.concat([cipher.update(Buffer.from(this.msk, "utf8")), cipher.final()]);
        const file: AuthorityFile = {
            version: 1,
            pk: this.pk,
            msk: {
                salt: salt.toString("base64"),
                iv: iv.toString("base64"),
                tag: cipher.getAuthTag().toString("base64"),
                data: data.toString("base64"),
            },
        };
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
        await rename(tmp, path);
    }

    /**
     * An attribute key for an attribute set. Memoised: `keygen` is not free and the same
     * principal asks again on every request.
     */
    keygen(attributes: string[]): Promise<string> {
        const normalised = [...new Set(attributes)].sort();
        const key = JSON.stringify(normalised);
        let pending = this.keys.get(key);
        if (!pending) {
            pending = keygen(this.msk, normalised);
            this.keys.set(key, pending);
        }
        return pending;
    }

    /**
     * The omni key for a set of scopes: every attribute any of their policies names, so
     * the key satisfies every monotone formula among them. What a trusted node unlocks
     * its own stacks with (spec 03 §4). `null` when there is nothing to open.
     */
    omniKey(scopes: Pick<AccessScopeModel, "policyString">[]): Promise<string> | null {
        const attributes = new Set<string>();
        for (const scope of scopes) {
            for (const attribute of policyAttributes(scope.policyString)) attributes.add(attribute);
        }
        if (!attributes.size) return null;
        return this.keygen([...attributes]);
    }

    /** A new `~AccessScope` document sealed under `policyString`, ready to write or to ship in a patch. */
    mintScope(input: { scopeId: string; policyString: string; version?: number }) {
        return ClientStack.buildAccessScope({ ...input, pk: this.pk });
    }
}
