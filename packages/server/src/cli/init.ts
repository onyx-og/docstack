import { randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Authority } from "../auth/authority.js";

const exists = async (path: string): Promise<boolean> => access(path).then(() => true, () => false);

const CONFIG_TEMPLATE = `import { defineConfig } from '@docstack/server';

// The stacks this node serves. Everything in a stack entry that is not the host's own
// is a StackOptions for the engine: patches, transactions, logLevel.
const PATCHES = [];

export default defineConfig({
    host: '127.0.0.1',
    port: 5984,
    storage: { adapter: 'leveldb', dir: './data' },          // 'memory' for development
    state: { dir: './.docstack' },
    // keys: { documentKey: process.env.DS_DOC_KEY },        // a trusted node; absent: a blind hub
    authority: { file: './.docstack/authority.json' },       // DS_AUTHORITY_PASSPHRASE unlocks it
    stacks: {
        'my-app': { patches: PATCHES },
    },
    auth: {
        jwt: { secret: process.env.DS_JWT_SECRET, issuer: 'docstack' },
        users: true,                                        // POST /auth/session over the credential store
    },
    grant: (principal) => ({
        stacks: {
            'my-app': { api: true, documentKey: true, accept: () => principal.attributes.includes('role:admin') },
        },
        attributes: principal.attributes,
        ui: principal.attributes.includes('role:admin'),
    }),
    cors: { origins: [] },
});
`;

/**
 * `ds init`: a config file to edit, an encrypted authority file, and the node secret
 * the config reads from the environment. Refuses to overwrite what exists.
 */
export const init = async (options: { dir: string }): Promise<void> => {
    const configPath = join(options.dir, "ds.config.js");
    const stateDir = join(options.dir, ".docstack");
    const authorityPath = join(stateDir, "authority.json");
    const envPath = join(options.dir, ".env.docstack");
    if (await exists(configPath)) throw new Error(`${configPath} already exists; remove it to re-initialise.`);
    await mkdir(stateDir, { recursive: true });

    const passphrase = process.env.DS_AUTHORITY_PASSPHRASE ?? randomBytes(24).toString("base64url");
    if (!(await exists(authorityPath))) {
        const authority = await Authority.generate();
        await authority.save(authorityPath, passphrase);
    }
    const jwtSecret = process.env.DS_JWT_SECRET ?? randomBytes(32).toString("base64url");
    await writeFile(configPath, CONFIG_TEMPLATE);
    await writeFile(envPath, `DS_JWT_SECRET=${jwtSecret}\nDS_AUTHORITY_PASSPHRASE=${passphrase}\n`, { mode: 0o600 });

    console.log(`Wrote ${configPath}`);
    console.log(`Wrote ${authorityPath} (the CP-ABE master pair, encrypted; back it up out of band)`);
    console.log(`Wrote ${envPath} (DS_JWT_SECRET and DS_AUTHORITY_PASSPHRASE; keep it out of version control)`);
    console.log(`Next: edit the config, export the variables from ${envPath}, then 'docstack-server serve'.`);
};
