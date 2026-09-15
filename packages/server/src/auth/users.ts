import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { UserRecord } from "../types.js";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

interface StoredUser extends UserRecord {
    salt: string;
    hash: string;
}

interface StoreFile {
    version: 1;
    users: Record<string, StoredUser>;
}

/**
 * The host's own credential store (spec 03 §6): scrypt-hashed passwords, the
 * principal's attributes, and the wrapped key material a replica unwraps locally.
 *
 * A JSON file under the state directory, written atomically; in memory when no path is
 * given (tests). Not `~User` documents: the client's `authenticate` never verifies a
 * password and its user model was shaped for one device.
 */
export class CredentialStore {
    private users: Record<string, StoredUser> = {};
    private loaded = false;

    constructor(private readonly path?: string) {}

    private async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        if (!this.path) return;
        try {
            const file = JSON.parse(await readFile(this.path, "utf8")) as StoreFile;
            if (file.version === 1) this.users = file.users;
        } catch (error: any) {
            if (error?.code !== "ENOENT") throw error;
        }
    }

    private async persist(): Promise<void> {
        if (!this.path) return;
        await mkdir(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.${process.pid}.tmp`;
        const file: StoreFile = { version: 1, users: this.users };
        await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
        await rename(tmp, this.path);
    }

    /** Adds or replaces a user. */
    async add(user: UserRecord & { password: string }): Promise<void> {
        await this.load();
        const salt = randomBytes(16);
        const hash = await scrypt(user.password, salt, 64);
        const { password: _password, ...record } = user;
        this.users[user.username] = { ...record, salt: salt.toString("base64"), hash: hash.toString("base64") };
        await this.persist();
    }

    async remove(username: string): Promise<boolean> {
        await this.load();
        const existed = username in this.users;
        delete this.users[username];
        if (existed) await this.persist();
        return existed;
    }

    /** The record for a username and password, or `null`. Constant-time on the hash comparison. */
    async verify(username: string, password: string): Promise<UserRecord | null> {
        await this.load();
        const stored = this.users[username];
        if (!stored) return null;
        const hash = await scrypt(password, Buffer.from(stored.salt, "base64"), 64);
        const expected = Buffer.from(stored.hash, "base64");
        if (hash.length !== expected.length || !timingSafeEqual(hash, expected)) return null;
        const { salt: _salt, hash: _hash, ...record } = stored;
        return record;
    }

    async get(username: string): Promise<UserRecord | null> {
        await this.load();
        const stored = this.users[username];
        if (!stored) return null;
        const { salt: _salt, hash: _hash, ...record } = stored;
        return record;
    }

    async list(): Promise<string[]> {
        await this.load();
        return Object.keys(this.users);
    }
}
