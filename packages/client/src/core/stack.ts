import PouchDB from "pouchdb-browser";
import createLogger from "../utils/logger/index.js";
import Class from "./class.js";
import Domain from "./domain.js";
import PouchDBFind from 'pouchdb-find';

import { getAllSystemPatches, getSystemPatches } from "./datamodel/index.js";
import {
    Stack,
    StackOptions,
    AuthSessionProof,
    ClientCredentials,
    CachedClass,
    ClassModelPropagationStart,
    ClassModelPropagationComplete,
    isClassModel,
    CachedDomain,
    DomainModel,
    UserModel,
    UserSessionModel,
    AuthModuleModel,
    PolicyModel,
    ChangesSubscription,
} from "@docstack/shared";

import { SystemDoc, Patch, ClassModel, Document, RelationDocument } from "@docstack/shared";
import { StackPlugin } from "../plugins/pouchdb.js";

import { createGuardedDb, createReplicationDb } from "./guarded-db.js";
import { StackSyncHandle } from "./sync/index.js";
import type { StackSyncOptions, SyncStatus } from "./sync/index.js";

import { parse, createPlan, executePlan, executePlanStream } from "./query-engine/index.js";
import type { SelectAST, UnionAST } from "./query-engine/index.js";
import { JobEngine } from "./job-engine/index.js";
import { PolicyEngine } from "./policy-engine/index.js";
import { CryptoEngine } from "./crypto-engine/index.js";
import { isEncryptedPayload } from "./crypto-engine/utils.js";
import {
    CONTENT_EXPORT_FORMAT,
    isContentClassName,
    stripTransientFields,
    assertContentExport,
} from "./content-transfer.js";
import type {
    ContentExport,
    ContentExportOptions,
    ContentImportOptions,
    ContentImportReport,
    ContentImportIssue,
} from "./content-transfer.js";

const logger = createLogger().child({ module: "stack" });

/**
 * `StackOptions` keys DocStack consumes itself; everything else belongs to PouchDB.
 *
 * `name` is on the list because the two libraries mean different things by it: to
 * DocStack it names the *stack*, and the database is `db-<name>`; to PouchDB it would
 * name the database outright and override the connection string.
 */
const DOCSTACK_OPTION_KEYS: readonly string[] = [
    "name",
    "plugins",
    "patches",
    "credentials",
    "disableCryptoEngine",
    "documentKey",
];

/**
 * Extracts the PouchDB half of a {@link StackOptions} object.
 *
 * `StackOptions` extends PouchDB's own `DatabaseConfiguration`, so callers can pass
 * `adapter`, `auto_compaction`, `revs_limit` and any adapter-specific option through
 * to the database - which only works if they actually reach the constructor.
 *
 * @param options - The options a stack was created with.
 * @returns The configuration to hand `new PouchDB(...)`, or `undefined` when nothing
 * is left over.
 */
const toPouchConfiguration = (
    options?: StackOptions
): PouchDB.Configuration.DatabaseConfiguration | undefined => {
    if (!options) return undefined;
    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
        if (DOCSTACK_OPTION_KEYS.includes(key)) continue;
        config[key] = value;
    }
    return Object.keys(config).length ? (config as PouchDB.Configuration.DatabaseConfiguration) : undefined;
};

/**
 * Removes `_rev` when there is no revision to state.
 *
 * PouchDB validates the field whenever the key is *present*, so a document carrying
 * `_rev: undefined` - which is what spreading a freshly prepared document produces - is
 * rejected with `bad_request: Invalid rev format`. PouchDB 7 ignored it, so the pattern
 * survived unnoticed until the supported version moved on.
 *
 * @param doc - A document about to be written.
 * @returns The same document, without a `_rev` key if it had no value.
 */
const withoutEmptyRev = <T extends { _rev?: string }>(doc: T): T => {
    if (doc._rev) return doc;
    const { _rev, ...rest } = doc as T & { _rev?: string };
    return rest as T;
};

export const BASE_SCHEMA: ClassModel["schema"] = {
    "_id": { name: "_id", type: "string", config: { maxLength: 100, primaryKey: true } },
    "~class": { name: "~class", type: "string", config: { maxLength: 100 } },
    "~createTimestamp": { name: "~createTimestamp", type: "integer", config: { min: 0 } },
    "~updateTimestamp": { name: "~updateTimestamp", type: "integer", config: { min: 0 } },
    "description": { name: "description", type: "string", config: { maxLength: 1000 } },
    "active": { name: "active", type: "boolean", config: { defaultValue: true, primaryKey: true } }
}
export const CLASS_SCHEMA: ClassModel["schema"] = {
    ...BASE_SCHEMA,
    "~class": { name: "~class", type: "string", config: { defaultValue: "class" } },
    "schema": { name: "schema", type: "object", config: { maxLength: 1000, isArray: false } },
    "parentClass": { name: "parentClass", type: "foreign_key", config: { isArray: false } },
}
const DOMAIN_SCHEMA: ClassModel["schema"] = {
    ...BASE_SCHEMA,
    "~class": { name: "~class", type: "string", config: { defaultValue: "domain" } },
    "schema": {
        name: "schema", type: "object", config: {
            isArray: true,
            defaultValue: {
                "source": {
                    name: "source",
                    type: "foreign_key",
                    config: {
                        isArray: false
                    }
                },
                "target": {
                    name: "target",
                    type: "foreign_key",
                    config: {
                        isArray: false
                    }
                }
            }
        }
    },
    // "parentDomain": { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
    "relation": {
        name: "relation", type: "enum", config: {
            isArray: false, values: [
                { value: "1:1" }, { value: "1:N" }, { value: "N:1" }, { value: "N:N" }
            ]
        }
    },
    "sourceClass": { name: "sourceClass", type: "foreign_key", config: { isArray: false } },
    "targetClass": { name: "targetClass", type: "foreign_key", config: { isArray: false } },
};
/**
 * The core database engine for DocStack client applications.
 * 
 * ClientStack provides a complete offline-first datastore built on PouchDB with:
 * - Schema validation and class-based document modeling
 * - SQL-like querying capabilities
 * - Field-level encryption via {@link CryptoEngine}
 * - Access control via {@link PolicyEngine}
 * - Background job execution via {@link JobEngine}
 * 
 * @example
 * ```typescript
 * // Create a new stack instance
 * const stack = await ClientStack.create('my-app-db');
 * 
 * // Authenticate a user
 * const session = await stack.authenticate({ username: 'admin', password: 'secret' });
 * 
 * // Query documents using SQL
 * const { rows } = await stack.query('SELECT * FROM Task WHERE isComplete = false');
 * ```
 * 
 * @extends Stack
 */
class ClientStack extends Stack {
    private static readonly CRYPTO_CONFIG_DOC_ID = "~crypto-engine-config";
    /**
     * The underlying PouchDB database instance.
     * Initialized asynchronously during stack creation.
     * 
     * @example
     * ```typescript
     * // Access the raw PouchDB API for advanced operations
     * const allDocs = await stack.db.allDocs({ include_docs: true });
     * ```
     */
    db!: PouchDB.Database<{}>;
    /**
     * The unguarded PouchDB instance. Only the sync layer reaches for it, through
     * {@link getReplicationHandle}.
     * @internal
     */
    private rawDb!: PouchDB.Database<{}>;
    /**
     * `bulkDocs`/`bulkGet` as PouchDB defines them, captured before {@link StackPlugin}
     * replaces them.
     * @internal
     */
    private pristineDbMethods!: { bulkDocs: Function; bulkGet: Function };
    /** Memoised {@link getReplicationHandle} result. @internal */
    private replicationDb?: PouchDB.Database<{}>;
    /** The stack's replication, once {@link sync} has been called. @internal */
    private syncHandle?: StackSyncHandle;
    /** The unique name identifier for this stack instance, derived from the connection string. */
    name!: string;
    /* Retrieved asynchronously */
    lastDocId!: number;
    /** The connection string used to create this stack. */
    connection!: string;
    /** Configuration options provided during stack creation. */
    options?: StackOptions;
    /** The current application version string. */
    appVersion: string = "0.0.1";
    /**
     * In-memory cache for Class and Domain objects.
     * Items are cached with a 15-minute TTL to improve performance.
     */
    cache: {
        [className: string]: CachedClass | CachedDomain
    }
    patchCount!: number;

    /**
     * Stored class models, keyed by whatever the caller looked them up with (name or id).
     *
     * `getClassModel` runs at least once per document on every read and write path (the
     * policy engine resolves each document's class through it), and each miss is an
     * unindexed find. Entries include `null` for names that resolved to nothing - the
     * caches are cleared whenever a class document is written, so a class created later
     * evicts its own negative entry.
     *
     * Invalidated as a pair with {@link classSnapshotCache}: synchronously by the write
     * path (StackPlugin calls {@link invalidateWriteCaches} after every batch that
     * touches a class model) and again by the shared changes feed for writes this stack
     * did not make itself. Cleared wholesale rather than per-entry because a rename
     * leaves the old name keyed to a model that no longer answers to it.
     */
    private classModelCache: Map<string, ClassModel | null> = new Map();

    /**
     * Built, non-subscribing Class instances, keyed by class name and pinned to the
     * model revision they were built from.
     *
     * Building a Class rebuilds every Attribute and re-derives the Zod schema, per
     * attribute - work `getClassSnapshot` used to repeat on every call. The `_rev` pin
     * means a stale entry can never be served even if invalidation lags: the model is
     * looked up first (through {@link classModelCache}) and the snapshot is reused only
     * when its revision still matches.
     */
    private classSnapshotCache: Map<string, { rev: string, cls: Class }> = new Map();

    /**
     * Every live changes subscription this stack has handed out; released on close.
     */
    listeners: ChangesSubscription[] = [];

    /**
     * The one live feed behind every class-document subscription.
     *
     * PouchDB attaches a `destroyed` listener to the database for each
     * `db.changes({ live: true })` and holds it until that feed is cancelled, so a feed
     * per watched class crosses Node's ten-listener limit - and prints
     * `MaxListenersExceededWarning` - on an app with a handful of classes on screen. It
     * is also wasted work: the local adapter runs every filter over the same change
     * stream, so N filtered feeds each see every change anyway.
     */
    private classDocFeed?: PouchDB.Core.Changes<{}>;

    /**
     * Change handlers, keyed `"<metaKey>:<name>"`. Empty means {@link classDocFeed} can be
     * cancelled.
     *
     * The meta key is part of the key because classes and domains are separate namespaces:
     * a relation document is named by `~domain` and carries no `~class`, so routing both
     * through one keyspace would let a class and a same-named domain hear each other.
     */
    private classDocSubscribers: Map<string, Set<(change: any) => void>> = new Map();

    modelWorker: Worker | null = null;
    /**
     * Engine for executing background jobs and scheduled tasks.
     * Jobs are defined as documents and run in a sandboxed environment.
     * 
     * @example
     * ```typescript
     * const run = await stack.jobEngine.executeJob('Job-CleanupOldData');
     * console.log('Job completed:', run.status);
     * ```
     */
    jobEngine!: JobEngine;

    /**
     * Engine for enforcing read/write access control policies.
     * Policies are evaluated based on user session and document content.
     */
    policyEngine!: PolicyEngine;

    /**
     * Engine for field-level encryption and decryption.
     * Handles key derivation (PBKDF2) and AES-GCM encryption.
     */
    cryptoEngine!: CryptoEngine;
    schemaVersion: string | undefined;
    /**
     * The current authenticated user session, if any.
     * Contains session details, derived key, and document encryption key.
     */
    authSession?: AuthSessionProof;
    private cryptoEngineDisabled!: boolean;
    /**
     * Application patches held back because they write encrypted attributes and the stack
     * has no key yet. Replayed by {@link unlock}. Kept in memory on purpose - reopening
     * the stack runs the same options through the same check.
     */
    private deferredPatches: Patch[] = [];

    private constructor() {
        super();
        // Private constructor to prevent direct instantiation
        this.cache = {}
    }

    private async initialize(conn: string, options?: StackOptions) {
        // Store the connection string and options
        this.connection = conn;
        this.options = options;
        this.cryptoEngineDisabled = Boolean(options?.disableCryptoEngine);
        // An explicit name wins: a stack opened on a connection string that is not
        // `db-<name>` (a URL, an adapter-specific handle) has no name to derive.
        if (options?.name) {
            this.name = options.name;
        } else {
            const connRegExp = /(?<=db-).*/
            const match = conn.match(connRegExp);
            this.name = match ? match[0] : conn;
        }

        // PouchDB.plugin((await import('pouchdb-adapter-node-websql')).default);
        // PouchDB.plugin((await import('pouchdb-adapter-websql')).default);

        // Load default plugins
        PouchDB.plugin(PouchDBFind);

        // Validation plugin
        if (options?.plugins) {
            for (let plugin of options.plugins) {
                PouchDB.plugin(plugin);
            }
        }
        // Anything in `options` that isn't DocStack's own is PouchDB configuration -
        // `adapter` most of all, without which a stack could only ever be opened on the
        // default transport and never, say, on a remote-backed one.
        const rawDb = new PouchDB(
            conn,
            toPouchConfiguration(options),
        );
        // Captured before the plugin replaces them, and the only correct source for them:
        // PouchDB installs these per instance, so `PouchDB.prototype.bulkDocs` is
        // `undefined` and capturing from there silently yields nothing. Replication needs
        // them too - it writes documents verbatim and reads them exactly as stored.
        // Unbound on purpose: StackPlugin forwards with `.call(this, ...)`.
        this.pristineDbMethods = { bulkDocs: rawDb.bulkDocs, bulkGet: rawDb.bulkGet };

        // Built from the pristine methods rather than looking them up: the plugin can no
        // longer be constructed at a moment when its capture would be wrong, because the
        // capture is an argument. See ADR-0019.
        const stackPlugin = StackPlugin(PouchDB, this, this.pristineDbMethods);
        (rawDb as any).ping = stackPlugin.ping;
        (rawDb as any).bulkDocs = stackPlugin.bulkDocs;
        (rawDb as any).bulkGet = stackPlugin.bulkGet;

        this.rawDb = rawDb;
        this.replicationDb = undefined;
        // What consumers get is guarded: the two ways around the authoring path -
        // `new_edits: false` and the `_`-prefixed adapter methods - are closed off, so a
        // stack's schema validation, relation checks and triggers cannot be side-stepped
        // by picking a different method on `stack.db`.
        this.db = createGuardedDb(rawDb);

        const pong = await (this.db as any).ping();
        if (!pong || pong !== "pong") {
            throw new Error("PouchDB ping failed");
        }
        this.cache = {
            // empty at init
        }
        this.jobEngine = new JobEngine(this);
        this.policyEngine = new PolicyEngine(this);
        this.cryptoEngine = new CryptoEngine(this);
        if (options?.documentKey) {
            await this.cryptoEngine.setDocumentKey(options.documentKey);
        }
    }

    /**
     * Returns the stack's PouchDB database handle.
     *
     * The handle is guarded: reads and ordinary writes behave exactly as PouchDB
     * documents them, and `put`/`post`/`remove`/`bulkDocs` all run the stack's
     * authoring path. The two routes that would skip it - `bulkDocs` with
     * `new_edits: false`, and the `_`-prefixed adapter methods - throw
     * {@link StackWriteGuardError}; replicating into a stack goes through
     * {@link sync} instead.
     *
     * @returns The guarded PouchDB database
     */
    public getDb() {
        return this.db
    }

    /**
     * Returns the database with PouchDB's own `bulkDocs`/`bulkGet` restored, for the
     * sync layer's exclusive use.
     *
     * Replication needs both halves of the plugin out of the way: it writes documents
     * with revisions it already owns (`new_edits: false`), and it must read documents
     * exactly as they are stored - the plugin's `bulkGet` decrypts on read, which would
     * push plaintext to a remote that is meant to hold ciphertext.
     *
     * @returns A handle suitable for `PouchDB.replicate`/`PouchDB.sync`
     * @internal
     */
    public getReplicationHandle(): PouchDB.Database<{}> {
        if (!this.replicationDb) {
            this.replicationDb = createReplicationDb(this.rawDb, this.pristineDbMethods);
        }
        return this.replicationDb;
    }

    /**
     * Starts replicating this stack against a remote.
     *
     * DocStack owns the lifecycle - the filter that keeps `~system`, the crypto marker,
     * design documents, locks, sessions and the patch ledger on this device; the schema
     * gate that refuses a remote written by a newer build; the convergence state a UI
     * renders; and cancellation when the stack closes. It owns nothing about the
     * transport: the remote is whatever PouchDB database the caller hands over, so
     * credentials and adapter configuration stay in the application.
     *
     * Calling it again replaces the previous replication.
     *
     * @param options - See {@link StackSyncOptions}.
     * @returns The handle, once replication is running.
     * @throws {SyncSchemaMismatchError} When the remote was last written by a newer schema.
     *
     * @example
     * ```typescript
     * const sync = await stack.sync({
     *     remote: () => new PouchDB("workspace", { adapter: "googledrive", accessToken }),
     *     direction: "both",
     *     live: true,
     *     retry: true,
     * });
     *
     * sync.addEventListener("status", (event) => {
     *     console.log((event as CustomEvent).detail.state);
     * });
     * ```
     */
    public async sync(options: StackSyncOptions): Promise<StackSyncHandle> {
        if (this.syncHandle) this.syncHandle.cancel();
        const handle = new StackSyncHandle(this, options);
        this.syncHandle = handle;
        await handle.start();
        return handle;
    }

    /**
     * Returns this stack's replication handle, or `null` if {@link sync} was never called.
     */
    public getSyncHandle(): StackSyncHandle | null {
        return this.syncHandle || null;
    }

    /**
     * Returns where this stack's replication stands, or `null` if it has none.
     *
     * @example
     * ```typescript
     * const status = stack.getSyncStatus();
     * if (status?.lastConvergedAt) {
     *     ui.setLabel(`Synced ${formatAgo(status.lastConvergedAt)}`);
     * }
     * ```
     */
    public getSyncStatus(): SyncStatus | null {
        return this.syncHandle ? this.syncHandle.getStatus() : null;
    }

    /**
     * Stops this stack's replication. Idempotent; called automatically by {@link close}.
     */
    public cancelSync() {
        if (this.syncHandle) {
            this.syncHandle.cancel();
        }
    }

    /**
     * Retrieves information about the database including document count and update sequence.
     * @returns Database information object
     */
    public async getDbInfo() {
        return this.db.info();
    }

    /**
     * Returns the name of the underlying PouchDB database.
     * @returns The database name string
     */
    public getDbName() {
        return this.db.name;
    }

    /**
     * Checks if the crypto engine was disabled during stack initialization.
     * @returns `true` if encryption is disabled, `false` otherwise
     */
    public isCryptoEngineDisabled() {
        return this.cryptoEngineDisabled;
    }

    /**
     * Sets the current authentication session.
     * Called automatically by {@link authenticate}, but can be set manually for custom auth flows.
     * @param proof - The authentication session proof containing session and encryption keys
     */
    public async setAuthSession(proof: AuthSessionProof) {
        this.authSession = proof;

        // Symmetric with `clearAuthSession`, which does clear the engine's key. Without
        // this a custom flow could hand over a proof carrying a document key and still be
        // left with a locked stack - a session held, and nothing it can decrypt - because
        // only the session half of the proof was ever applied.
        //
        // Guarded on the key being absent so the ordinary path is not repeated:
        // `authenticate` has already installed it by the time it calls this.
        if (proof.documentKey && this.cryptoEngine.isEnabled() && !this.cryptoEngine.getDocumentKey()) {
            await this.cryptoEngine.setDocumentKey(proof.documentKey);
            await this.onDocumentKeyAvailable();
        }
    }

    /**
     * Clears the current authentication session and removes the document encryption key.
     * Call this when a user logs out.
     */
    public clearAuthSession() {
        this.authSession = undefined;
        this.cryptoEngine.setDocumentKey(null);
    }

    /**
     * Whether the stack is operating without its document encryption key.
     *
     * A locked stack reads everything that needs no key and refuses writes to classes
     * carrying encrypted attributes, rather than storing them in the clear. Patches that
     * would write encrypted data are deferred until {@link unlock}. Stacks with the crypto
     * engine disabled are never locked - there is no key to be missing.
     *
     * @returns `true` when encryption is enabled but no key is held.
     */
    public isLocked() {
        return this.cryptoEngine.isEnabled() && !this.cryptoEngine.getDocumentKey();
    }

    /**
     * Supplies the document encryption key to a locked stack.
     *
     * The key is checked against the stack's canary before it is accepted, so passing the
     * wrong one throws instead of quietly producing unreadable writes. On the first unlock
     * of a stack that has none, the canary is minted from the key given - which is what
     * makes every later open verifiable.
     *
     * Unlocking resumes any bootstrap deferred while locked, then emits `unlocked`.
     *
     * @param documentKey - The hex-encoded document key, from wherever the application
     * provisions it.
     * @throws If the stack has encryption disabled, or the key does not match the canary.
     *
     * @example
     * ```typescript
     * const stack = await ClientStack.create('db-app');   // opens locked
     * await stack.unlock(await myServer.fetchDocumentKey());
     * stack.isLocked(); // false
     * ```
     */
    public async unlock(documentKey: string) {
        if (!this.cryptoEngine.isEnabled()) {
            throw new Error("Stack was opened with the crypto engine disabled; there is no document key to supply.");
        }
        if (!documentKey) {
            throw new Error("unlock requires a document key.");
        }

        const previousKey = this.cryptoEngine.getDocumentKey();
        await this.cryptoEngine.setDocumentKey(documentKey);

        const config = await this.db
            .get<{ encryptedMarker?: unknown }>(ClientStack.CRYPTO_CONFIG_DOC_ID)
            .catch((error: any) => {
                if (error?.name === "not_found" || error?.status === 404) return null;
                throw error;
            });

        const canary = (config as any)?.encryptedMarker;
        if (isEncryptedPayload(canary)) {
            if (!(await this.cryptoEngine.verifyMarker(canary))) {
                // Put the stack back as it was: a rejected key must not leave it half-keyed.
                await this.cryptoEngine.setDocumentKey(previousKey ?? null);
                throw new Error(
                    "The supplied document key does not match this stack: it cannot decrypt the stack's key marker."
                );
            }
        }

        // Mints the canary if this is the first key the stack has seen, then finishes the
        // bootstrap and patches that were waiting on one.
        await this.onDocumentKeyAvailable();

        this.dispatchEvent(new CustomEvent("unlocked", { detail: { stackName: this.name } }));
        return this;
    }

    /**
     * Encrypts bootstrap documents that were seeded before this stack had a key.
     *
     * The seed system user is the one document DocStack must write before a key can
     * exist: the first open of a database has no wrapped key to recover one from, and
     * refusing to seed it would leave nothing to authenticate against. It is therefore
     * written in the clear - its password is the published constant `"system"`, so
     * nothing secret is exposed - and repaired here.
     *
     * Rewriting it through the authoring path encrypts its attributes and lets
     * `auto-wrap-document-key` run for the first time, producing the
     * `wrappedDocumentKey` that lets another device recover this same document key.
     * Without this step a stack bootstrapped locked could never authenticate, because
     * the trigger no-ops when no key is held. See ADR-0018.
     */
    private async rekeyBootstrapDocuments() {
        if (this.isLocked()) return;

        const systemUser = await this.db.get<Document>("system").catch((error: any) => {
            if (error?.name === "not_found" || error?.status === 404) return null;
            throw error;
        });
        if (!systemUser) return;
        // A wrapped key means a previous unlock already repaired it.
        if ((systemUser as any).wrappedDocumentKey) return;

        logger.warn("Re-keying bootstrap documents seeded before a document key was available");
        await this.db.put(systemUser as any);
    }

    /**
     * Exports all documents from the database.
     * Useful for debugging or creating backups.
     * @returns All documents including their content
     */
    public dump = async () => {
        const all = await this.db.allDocs({ include_docs: true });
        return all;
    }

    /**
     * Lists the content classes and domains this stack holds.
     *
     * "Content" means created by an application: DocStack's own classes are `~`-prefixed
     * and its datamodel documents use the reserved names in `META_CLASSES`.
     *
     * @returns The class names and domain names an export would cover.
     */
    /**
     * Every class name in this stack, DocStack's own included.
     *
     * The fail-open path for a live query: when the classes a query reads cannot be
     * determined from its AST, watching all of them is wasteful but correct, and watching
     * none is silently wrong. Cheap to act on - subscriptions share one database
     * listener, so the cost is a set entry per class rather than a feed. See ADR-0025.
     *
     * For the application's classes alone, use {@link getContentClassNames}.
     *
     * @returns The class names, sorted.
     */
    public getClassNames = async (): Promise<string[]> => {
        const { list } = await this.getClassModels();
        return [...new Set(list.map(model => model.name).filter(Boolean))].sort();
    }

    public getContentClassNames = async (): Promise<{ classes: string[]; domains: string[] }> => {
        const [classModels, domainModels] = await Promise.all([
            this.getClassModels(),
            this.getDomainModels(),
        ]);

        // A document's `~class` is its class model's `name` - `Class.addCard` passes
        // `getName()` - while the model's own `_id` is generated (`class-6`). DocStack's
        // own classes are the exception that proves it: `~User` has `name: "User"` and its
        // documents carry `~class: "~User"`, the id. So a class counts as content only
        // when *neither* identifier is `~`-prefixed, and the name is what documents are
        // queried by. A relation's `~domain` is its domain model's name, where id and name
        // agree.
        const classes = classModels.list
            .filter(model => !String(model._id).startsWith("~"))
            .map(model => model.name)
            .filter(isContentClassName);
        const domains = domainModels.list
            .map(model => model.name)
            .filter(isContentClassName);

        return { classes: [...new Set(classes)].sort(), domains: [...new Set(domains)].sort() };
    }

    /**
     * Exports this stack's application content, and nothing else.
     *
     * Deliberately narrower than {@link dump}, which returns the database verbatim -
     * class models, patches, users, sessions, policies, design documents, and encrypted
     * attributes as unreadable payloads. That is a backup of *this* database. This is the
     * portable one: the documents an application put in, ready for
     * {@link importContent} to place into a stack whose schema its own patches built and
     * whose document key is its own.
     *
     * What it does **not** do:
     *
     * - **It does not bypass encryption.** Documents are read through the decrypting path,
     *   so encrypted attributes come out as plaintext. That is what makes the export
     *   portable across keys - and what makes the result as sensitive as the data itself.
     *   A locked stack cannot decrypt, so the export is refused rather than silently
     *   emitting `null` where values should be (see `allowLossyWhenLocked`).
     * - **It does not bypass read policies.** Documents the current session may not read
     *   are absent, exactly as they are absent from `findDocuments`.
     * - **It carries no schema, no patches and no system documents.**
     *
     * @param options - Which classes and domains to cover; see {@link ContentExportOptions}.
     * @returns The portable envelope.
     * @throws Error when the stack is locked and an exported class has encrypted
     * attributes, unless `allowLossyWhenLocked` is set.
     *
     * @example
     * ```typescript
     * const payload = await stack.exportContent({ classes: ["Task", "Project"] });
     * download(new Blob([JSON.stringify(payload)], { type: "application/json" }));
     * ```
     */
    public exportContent = async (options: ContentExportOptions = {}): Promise<ContentExport> => {
        const fnLogger = logger.child({ method: "exportContent" });
        const available = await this.getContentClassNames();

        const classes = options.classes
            ? options.classes.filter(name => available.classes.includes(name))
            : available.classes;
        const domains = options.includeRelations === false
            ? []
            : options.domains
                ? options.domains.filter(name => available.domains.includes(name))
                : available.domains;

        if (options.classes) {
            const unknown = options.classes.filter(name => !available.classes.includes(name));
            if (unknown.length) {
                throw new Error(`exportContent - no such content class: ${unknown.join(", ")}`);
            }
        }

        // A locked stack reads encrypted attributes back as `null`. Writing that into an
        // export would lose data in a way nothing downstream could detect, so it is
        // refused unless the caller has said they want the rest anyway.
        if (this.isLocked() && !options.allowLossyWhenLocked) {
            const encrypted: string[] = [];
            for (const className of classes) {
                const classObj = await this.getClassSnapshot(className);
                if (classObj?.getEncryptedAttributes().length) encrypted.push(className);
            }
            if (encrypted.length) {
                throw new Error(
                    `exportContent - the stack is locked, so encrypted attributes on ${encrypted.join(", ")} ` +
                    "would be exported as null. Unlock it with 'stack.unlock(documentKey)', or pass " +
                    "'allowLossyWhenLocked: true' to accept the loss."
                );
            }
        }

        const keep = (doc: any) => options.includeInactive || doc.active !== false;

        const documents: Document[] = [];
        for (const className of classes) {
            const found = await this.findDocuments<Document>({ "~class": { $eq: className } });
            for (const doc of found.docs) {
                if (keep(doc)) documents.push(stripTransientFields(doc));
            }
        }

        const relations: RelationDocument[] = [];
        for (const domainName of domains) {
            const found = await this.findDocuments<RelationDocument>({ "~domain": { $eq: domainName } });
            for (const doc of found.docs) {
                if (keep(doc)) relations.push(stripTransientFields(doc));
            }
        }

        fnLogger.info("Exported content", {
            classes: classes.length, documents: documents.length, relations: relations.length,
        });

        return {
            format: CONTENT_EXPORT_FORMAT,
            exportedAt: new Date().toISOString(),
            source: {
                stack: this.name,
                appVersion: this.appVersion,
                schemaVersion: this.schemaVersion,
            },
            classes,
            domains,
            documents,
            relations,
        };
    }

    /**
     * Imports content produced by {@link exportContent} into this stack.
     *
     * The counterpart, and it is not symmetric: an export is a read, an import is a
     * reconciliation. The payload carries data and no schema, so this stack's datamodel
     * decides what is allowed in.
     *
     * - **Reconciled against the datamodel.** Every document's class must already exist
     *   here; a missing one is reported rather than invented, because the export carries
     *   no schema to create it from. Attributes the target class does not define are
     *   dropped by default.
     * - **Written through the authoring path**, so schema validation, relation checks and
     *   triggers all run - and so encrypted attributes are **encrypted under this stack's
     *   document key**, not the one they were exported from.
     * - **Documents before relations**, because a relation is rejected unless both ends
     *   already exist.
     *
     * Not a transaction: a failure part way through leaves what was already written. The
     * report says what landed.
     *
     * @param payload - An envelope from {@link exportContent}.
     * @param options - How to reconcile; see {@link ContentImportOptions}.
     * @returns What was written, skipped, and why.
     * @throws Error when the payload is not a recognised export, or when a `"fail"` option
     * is set and the condition it names occurs.
     *
     * @example
     * ```typescript
     * const report = await stack.importContent(JSON.parse(await file.text()));
     * report.documents.written; // 128
     * report.issues;            // [{ docId: "Task-9", kind: "missing-class", ... }]
     * ```
     */
    public importContent = async (
        payload: ContentExport,
        options: ContentImportOptions = {}
    ): Promise<ContentImportReport> => {
        const fnLogger = logger.child({ method: "importContent" });
        assertContentExport(payload);

        const onMissingClass = options.onMissingClass ?? "skip";
        const onUnknownAttribute = options.onUnknownAttribute ?? "strip";
        const issues: ContentImportIssue[] = [];
        const report: ContentImportReport = {
            documents: { written: 0, skipped: 0 },
            relations: { written: 0, skipped: 0 },
            issues,
        };

        // Resolved once per class rather than per document, and detached - these are read
        // for their schema, not watched.
        const classes = new Map<string, Class | null>();
        const classFor = async (className: string) => {
            if (!classes.has(className)) {
                classes.set(className, await this.getClassSnapshot(className).catch(() => null));
            }
            return classes.get(className) ?? null;
        };

        const reconcile = async (doc: any, className: string): Promise<Document | null> => {
            const classObj = await classFor(className);
            if (!classObj) {
                const detail = `this stack has no class '${className}'; apply the patch that defines it first`;
                if (onMissingClass === "fail") throw new Error(`importContent - ${detail}`);
                issues.push({ docId: doc._id, kind: "missing-class", detail });
                return null;
            }

            // `buildSchema()`, not `classObj.schema`: `setModel` hydrates `attributes` and
            // the zod schema from the stored model and leaves the `schema` field at its
            // `{}` initial value, so reading it here treats every attribute as unknown -
            // which strips the mandatory ones and gets the whole document rejected.
            const known = new Set(Object.keys(classObj.buildSchema() || {}));
            const candidate = stripTransientFields(doc) as Record<string, unknown>;
            for (const key of Object.keys(candidate)) {
                // `_`-prefixed is PouchDB's, `~`-prefixed is DocStack's; neither is a
                // schema attribute and both are meant to travel.
                if (key.startsWith("_") || key.startsWith("~") || key === "active") continue;
                if (known.has(key)) continue;

                const detail = `class '${className}' does not define attribute '${key}'`;
                if (onUnknownAttribute === "fail") throw new Error(`importContent - ${detail}`);
                if (onUnknownAttribute === "strip") {
                    delete candidate[key];
                    issues.push({ docId: doc._id, kind: "unknown-attribute", detail: `${detail}; dropped` });
                }
            }
            return candidate as unknown as Document;
        };

        /** Resolves the revision to write at, or `null` to skip this document. */
        const revisionFor = async (docId: string, kind: "documents" | "relations") => {
            const existing = await this.db.get(docId).catch(() => null);
            if (!existing) return undefined;
            if (!options.overwrite) {
                issues.push({
                    docId,
                    kind: "conflict",
                    detail: "already present; pass 'overwrite: true' to replace it",
                });
                report[kind].skipped += 1;
                return null;
            }
            return (existing as any)._rev as string;
        };

        const writeBatch = async (drafts: any[], kind: "documents" | "relations") => {
            if (!drafts.length) return;
            try {
                const results = await this.db.bulkDocs(drafts);
                for (const [index, result] of (results as any[]).entries()) {
                    if ((result as any)?.error) {
                        report[kind].skipped += 1;
                        issues.push({
                            docId: drafts[index]._id,
                            kind: "rejected",
                            detail: (result as any).reason || (result as any).message || String((result as any).error),
                        });
                    } else {
                        report[kind].written += 1;
                    }
                }
            } catch (error: any) {
                // The plugin refuses a whole batch on a validation failure, so the batch
                // is written one at a time to find out which document was at fault.
                if (drafts.length === 1) {
                    report[kind].skipped += 1;
                    issues.push({
                        docId: drafts[0]._id,
                        kind: "rejected",
                        detail: error?.message || String(error),
                    });
                    return;
                }
                for (const draft of drafts) await writeBatch([draft], kind);
            }
        };

        const documentDrafts: Document[] = [];
        for (const doc of payload.documents) {
            const className = (doc as any)["~class"];
            if (!isContentClassName(className)) {
                report.documents.skipped += 1;
                issues.push({
                    docId: (doc as any)._id,
                    kind: "rejected",
                    detail: `'${String(className)}' is not a content class; only application data is imported`,
                });
                continue;
            }
            const draft = await reconcile(doc, className);
            if (!draft) { report.documents.skipped += 1; continue; }

            const rev = await revisionFor((draft as any)._id, "documents");
            if (rev === null) continue;
            documentDrafts.push(rev ? ({ ...draft, _rev: rev } as Document) : draft);
        }
        await writeBatch(documentDrafts, "documents");

        // Relations only after every document has landed: the plugin rejects a relation
        // whose source or target is not in the database.
        const relationDrafts: RelationDocument[] = [];
        for (const relation of payload.relations) {
            const domainName = (relation as any)["~domain"];
            const domain = await this.getDomain(domainName).catch(() => null);
            if (!domain) {
                report.relations.skipped += 1;
                issues.push({
                    docId: (relation as any)._id,
                    kind: "missing-domain",
                    detail: `this stack has no domain '${String(domainName)}'`,
                });
                continue;
            }
            const draft = stripTransientFields(relation);
            const rev = await revisionFor((draft as any)._id, "relations");
            if (rev === null) continue;
            relationDrafts.push(rev ? ({ ...draft, _rev: rev } as RelationDocument) : draft);
        }
        await writeBatch(relationDrafts, "relations");

        fnLogger.info("Imported content", { report });
        return report;
    }

    private async ensureDefaultPolicyForClass(targetClass: ClassModel) {
        const fnLogger = logger.child({ method: "ensureDefaultPolicyForClass", targetClass: targetClass._id });
        const existingPolicy = await this.findDocument<PolicyModel>({
            "~class": { $eq: "~Policy" },
            targetClass: { $elemMatch: { $eq: targetClass._id } }
        });
        if (existingPolicy) {
            return;
        }

        const policyDoc: PolicyModel = {
            _id: `Policy-${targetClass._id}`,
            "~class": "~Policy",
            active: true,
            rule: "return session && session.sessionStatus === 'active';",
            description: `Default policy for ${targetClass.name || targetClass._id}`,
            targetClass: [targetClass._id],
        };

        fnLogger.info("Creating default policy", { policyDoc });
        try {
            await this.db.bulkDocs([policyDoc as any]);
        } catch (error: any) {
            throw new Error(`Failed to create default policy for ${targetClass._id}: ${error?.message || error}`);
        }
    }

    /**
     * Creates and initializes a new ClientStack instance.
     * This is the primary way to instantiate a stack - the constructor is private.
     * 
     * @param conn - The connection string or database name
     * @param options - Optional configuration including plugins, patches, and credentials
     * @returns A fully initialized ClientStack instance
     * 
     * @example
     * ```typescript
     * // Basic initialization
     * const stack = await ClientStack.create('my-app-db');
     * 
     * // With authentication
     * const stack = await ClientStack.create('my-app-db', {
     *     credentials: { username: 'admin', password: 'secret' }
     * });
     * 
     * // With custom patches
     * const stack = await ClientStack.create('my-app-db', {
     *     patches: [myCustomPatch]
     * });
     * ```
     */
    public static async create(conn: string, options?: StackOptions): Promise<ClientStack> {
        const stack = new ClientStack();
        await stack.initialize(conn, options);
        await stack.initdb()
        if (options?.patches && options.patches.length) {
            const patches = await stack.findDocuments<Patch>({
                "~class": { $eq: "patch" }
            })
            await stack.applyConsumerPatches(options.patches.filter(
                p => !patches.docs.find(
                    existing => existing.version === p.version
                    && existing.target === p.target
                )
            ));
        }
        if (options?.credentials) {
            await stack.authenticate(options.credentials);
        }
        return stack;
    }

    /**
     * Applies application-supplied patches, holding back any that need a document key.
     *
     * A locked stack must not write encrypted attributes in the clear, so a patch that
     * would do so is kept for {@link unlock} instead. This is a barrier rather than a
     * filter: patches apply in order and a later one may depend on the schema an earlier
     * one installs, so the first deferral stops the run.
     *
     * The held-back patches live on the instance, not in the database - reopening the
     * stack replays the same options through the same check, so there is no persisted
     * state to drift.
     *
     * @param patches - Patches not yet present in this stack.
     */
    private async applyConsumerPatches(patches: Patch[]) {
        const fnLogger = logger.child({ method: "applyConsumerPatches" });
        for (let index = 0; index < patches.length; index++) {
            const patch = patches[index];
            if (this.isLocked() && await this.patchNeedsDocumentKey(patch)) {
                this.deferredPatches = patches.slice(index);
                fnLogger.warn("Deferred patches that write encrypted attributes until the stack is unlocked", {
                    from: patch.version,
                    count: this.deferredPatches.length,
                });
                return;
            }
            await this.applyPatch(patch);
        }
        this.deferredPatches = [];
    }

    /**
     * Decides whether applying a patch would write an encrypted attribute.
     *
     * The judgement is made immediately before the patch would be applied, against the
     * schema as it stands then, plus any class model the patch carries itself - a patch
     * can introduce an encrypted attribute and write a document using it in one go, as
     * `~sys-0.0.8` does. Everything earlier has already landed, so nothing needs to
     * simulate schema evolution ahead of time.
     *
     * @param patch - The patch about to be applied.
     * @returns `true` if any document in it belongs to a class with encrypted attributes.
     */
    private async patchNeedsDocumentKey(patch: Patch): Promise<boolean> {
        const hasEncryptedAttribute = (schema?: ClassModel["schema"]) =>
            !!schema && Object.values(schema).some((attribute: any) => attribute?.config?.encrypted === true);

        const schemasInPatch = new Map<string, ClassModel["schema"]>();
        for (const doc of patch.docs) {
            if (isClassModel(doc) && doc.schema) schemasInPatch.set(doc._id, doc.schema);
        }

        for (const doc of patch.docs) {
            // Class models describe encryption; they never carry an encrypted value.
            if (isClassModel(doc)) continue;
            const className = (doc as any)["~class"];
            if (!className) continue;

            if (hasEncryptedAttribute(schemasInPatch.get(className))) return true;

            const stored = await this.getClassModel(className).catch(() => null);
            if (hasEncryptedAttribute(stored?.schema)) return true;
        }
        return false;
    }

    /**
     * Authenticates a user and establishes a session.
     * 
     * This method:
     * 1. Looks up the user by username
     * 2. Executes the configured authentication job (e.g., password verification)
     * 3. Creates a new session document
     * 4. Sets up encryption keys for the session
     * 
     * @param credentials - The user's login credentials containing username and password
     * @returns The authentication session proof containing session info and encryption keys
     * @throws Error if the user is not found or authentication fails
     * 
     * @example
     * ```typescript
     * const proof = await stack.authenticate({
     *     username: 'john.doe',
     *     password: 'securePassword123'
     * });
     * console.log('Logged in as:', proof.session.username);
     * ```
     */
    public async authenticate(credentials: ClientCredentials) {
        const { username, password } = credentials;
        const userQuery = await this.db.find({
            selector: {
                "~class": { $eq: "~User" },
                username: { $eq: username },
                active: { $eq: true }
            }
        });
        const user = userQuery.docs.length ? userQuery.docs[0] as unknown as UserModel : null;

        if (!user) {
            throw new Error(`User '${username}' not found`);
        }

        const authModuleId = user.authMethod || "AuthMod-Classic";
        const authModule = await this.db.get<AuthModuleModel>(authModuleId);
        const jobId = authModule.jobId;
        const run = await this.jobEngine.executeJob(jobId, {
            password,
            salt: user.keyDerivationSalt,
            keyDerivationSalt: user.keyDerivationSalt,
        });

        const derivedKey = (run.finalMetadata as any)?.derivedKey ?? (run.initialMetadata as any)?.derivedKey;
        const userGroups = Array.isArray((user as any).groupId)
            ? (user as any).groupId
            : (user as any).groupId
                ? [(user as any).groupId]
                : ["Group-Default"];
        const randomBytes = new Uint8Array(8);
        globalThis.crypto.getRandomValues(randomBytes);
        const hexId = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const sessionId = `session-${globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : hexId}`;
        const sessionDoc: UserSessionModel = {
            _id: sessionId,
            "~class": "~UserSession",
            userId: user._id || user.username,
            groupId: userGroups,
            username: user.username,
            sessionId,
            sessionStart: new Date().toISOString(),
            sessionStatus: "active",
        };

        const sessionClassModel = (await this.getClassModel("~UserSession")) || (await this.getClassModel("UserSession"));
        const sessionSchema = sessionClassModel?.schema || {};
        await this.createDoc(sessionDoc._id, sessionDoc["~class"], sessionSchema, sessionDoc);

        // Recovering the document key is the *ordinary* outcome here - it is how a second
        // device ends up with the key the first one wrote - but it is not guaranteed. A
        // user seeded before the stack had any key carries no wrapped copy (see ADR-0018's
        // bootstrap exception), and authenticating cannot conjure one. Holding a session
        // and holding a key are separate things, so the session stands either way and the
        // stack simply stays locked until `unlock` supplies one.
        let documentKey: string | undefined;
        if (this.cryptoEngine.isEnabled() && user.wrappedDocumentKey) {
            documentKey = await this.cryptoEngine.unwrapAndStoreDocumentKey(user.wrappedDocumentKey, derivedKey) ?? undefined;
        } else if (this.cryptoEngine.isEnabled()) {
            logger.warn("Authenticated without recovering a document key: the user carries no wrapped key, so the stack stays locked", {
                username: user.username,
            });
        }

        const proof: AuthSessionProof = { session: sessionDoc, derivedKey, documentKey };
        await this.setAuthSession(proof);
        if (documentKey) {
            await this.onDocumentKeyAvailable();
        }
        return proof;
    }

    /**
     * Finishes the work that could not be done while the stack had no document key.
     *
     * Reached from both ways a key arrives - {@link unlock} and {@link authenticate} -
     * because the consequences are the same either way: the canary has to exist for later
     * opens to be verifiable, bootstrap documents seeded in the clear have to be
     * encrypted, and patches held back have to be applied.
     */
    private async onDocumentKeyAvailable() {
        await this.ensureCryptoMarkerEncryption();
        await this.rekeyBootstrapDocuments();
        if (this.deferredPatches.length) {
            const deferred = this.deferredPatches;
            this.deferredPatches = [];
            await this.applyConsumerPatches(deferred);
        }
    }

    /**
     * Mints an identifier for a new document.
     *
     * Random, not sequential, and that is the whole point. Ids used to be
     * `${type}-${lastDocId + 1}`, from a counter that only *local* writes advance: a
     * document arriving by replication goes through {@link getReplicationHandle}, which
     * bypasses that path by design, so the counter stood still while ids were consumed.
     * The next local write then minted an id the database already held, PouchDB resolved
     * the two as revisions of one document, and the new one was gone - with no error,
     * because the conflict was swallowed. Two devices did it to each other from their
     * very first document, both starting at `1`.
     *
     * No counter repair fixes that. Feeding replicated documents back into the counter
     * still leaves two offline devices minting the same id, because a sequence derived
     * from local state cannot be unique across devices that have not met. The identifier
     * has to stop being derived from local state at all. See ADR-0023.
     *
     * The class prefix stays, so an id still says what it is.
     *
     * @param type - The class or domain name, used as the prefix.
     * @returns An id of the form `Task-9f2c...`, 96 random bits wide.
     *
     * @example
     * ```typescript
     * stack.generateDocId("Task"); // "Task-3f9a2b7c1d4e5f60a1b2c3d4"
     * ```
     */
    public generateDocId(type: string): string {
        // 12 bytes - 96 bits - matching the width applications already use for
        // collision-safe values through `cryptoEngine.generateRandomString`.
        return `${type}-${this.cryptoEngine.generateRandomString(12)}`;
    }

    async getLastDocId() {
        let lastDocId = 0;
        try {
            let doc: { value: number, [key: string]: string | number } = await this.db.get("lastDocId");
            lastDocId = doc.value;
        } catch (e: any) {
            if (e.name === 'not_found') {
                logger.info("getLastDocId - not found. Must be first initialization.")
                return lastDocId
            }
            logger.error("checkdb - something went wrong", { "error": e });
        }
        return lastDocId;
    }

    async getSystem() {
        try {
            let doc = await this.db.get("~system") as SystemDoc;
            return doc;
        } catch (e: any) {
            if (e.name === 'not_found') {
                logger.info("get System - not found", e)
                return null;
            }
            logger.error("getSystem - something went wrong", { "error": e });
            throw new Error(e);
        }
    }

    private async loadPatches(schemaVersion: string | undefined): Promise<Patch[]> {
        const fnLogger = logger.child({ method: "loadPatches" });
        try {
            fnLogger.info("loadPatches - loading patches");
            const patches = await getSystemPatches(schemaVersion || "0.0.0");
            fnLogger.warn(`loadPatches - loaded ${patches.length} patches`);
            return patches;
        } catch (e: any) {
            fnLogger.error("loadPatches - something went wrong", e)
            throw new Error(e);
        }
    }

    applyPatch = async (patch: Patch): Promise<string> => {
        const fnLogger = logger.child({ method: "applyPatch", args: { patch } });
        return new Promise<string>(async (resolve, reject) => {
            try {
                fnLogger.info("Attempting to apply patch", { patch })
                fnLogger.info("applyPatch - starting to hydrate patch docs", { docCount: patch.docs.length });
                const hydratedDocs = await Promise.all(patch.docs.map(async sourceDoc => {
                    // Work on a copy: the patch definition must survive intact. System
                    // patches are module-level objects shared by every stack in the
                    // process, so deleting `_rev` from one would strip the "auto" marker
                    // permanently — the next ClientStack created in the same context
                    // would then rewrite those documents as fresh inserts, hit a 409,
                    // and end up without its `class` class model.
                    let doc = { ...sourceDoc };
                    if (doc._rev === "auto") {
                        delete doc._rev;
                        const existingDoc = await this.db.get(doc._id);
                        if (existingDoc) {
                            doc = { ...existingDoc, ...doc };
                        }
                    }
                    return doc;
                }));
                fnLogger.info("applyPatch - hydration complete, calling bulkDocs", { docCount: hydratedDocs.length });
                await this.db.bulkDocs(hydratedDocs, { isPatch: true } as PouchDB.Core.BulkDocsOptions).then((result) => {
                    fnLogger.warn("applyPatch - bulkDocs completed with result", { result });
                    fnLogger.warn("Successfully processed patch", { version: patch.version });
                }).catch((error) => {
                    fnLogger.error("applyPatch - bulkDocs error", { error });
                    reject(error);
                });
                // Store patch itself
                await this.db.post({createTimestamp: (new Date()).valueOf(), ...patch});
                fnLogger.info("Successfully stored patch", { version: patch.version, target: patch.target });
                resolve(patch.version);
            } catch (e: any) {
                fnLogger.error("Failed to apply patch", e)
                reject(new Error(e));
            }
        });
    }

    private async applyPatches(schemaVersion: string | undefined): Promise<string> {
        const fnLogger = logger.child({ method: "applyPatches", args: { schemaVersion } });
        let _schemaVersion = schemaVersion;
        try {
            const patches = await this.loadPatches(_schemaVersion);
            for (let patch of patches) {
                _schemaVersion = await this.applyPatch(patch);
            }
            if (_schemaVersion) {
                fnLogger.warn("Successfully applied patches till version", { version: _schemaVersion });
                this.schemaVersion = _schemaVersion;
                return _schemaVersion!;
            } else {
                fnLogger.info("No patches were provided or applied");
                throw new Error("applyPatches - No patches were provided or applied");
            }
        } catch (e: any) {
            fnLogger.error("Something went wrong", e);
            throw new Error(e);
        }
    }

    // Method that verifies wether the system information are updated
    // applies patches too
    // TODO: Test if works corrrectly with multiple patch files
    async checkSystem() {
        let systemDoc = await this.getSystem();
        logger.info("checkSystem - system doc rev", { systemDoc });
        let _systemDoc: SystemDoc;
        const dbInfo = await this.getDbInfo();
        logger.info("checkSystem - current system doc", { system: systemDoc })
        if (!systemDoc) {
            _systemDoc = {
                _id: "~system",
                appVersion: this.appVersion,
                dbInfo: dbInfo,
                schemaVersion: undefined,
                startupTime: (new Date()).valueOf()
            }
            // schemaVersion will be added after applying patches
            let schemaVersion = await this.applyPatches(_systemDoc.schemaVersion);
            logger.info("checkSystem - applied patches", { schemaVersion });
            _systemDoc.schemaVersion = schemaVersion;
        } else {
            logger.info("checkSystem - system doc already exists. Checking for updates", systemDoc)
            // apply patches if needed
            let schemaVersion = await this.applyPatches(systemDoc.schemaVersion);
            _systemDoc = {
                ...systemDoc,
                appVersion: this.appVersion,
                dbInfo: dbInfo,
                schemaVersion: schemaVersion,
                startupTime: (new Date()).valueOf()
            }
        }
        // Update systemDoc
        try {
            await this.db.put(_systemDoc);

        } catch (e: any) {
            logger.info("checkSystem - got system doc", { systemDoc: _systemDoc });
            logger.error("checkSystem - There was a problem while updating system", { error: e })
            throw new Error(e)
        }
        logger.info("checkSystem - updated system", { system: _systemDoc })
    }

    setListeners = () => {
        const fnLogger = logger.child({ method: "setListeners" });

        // Listening for class model propagation
        this.addEventListener('class-model-propagation-pending', this.onClassModelPropagationStart as EventListener);
        this.addEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete as EventListener);

        // fnLogger.info("Setting up class model worker");
        // this.modelWorker = new Worker(require("../workers/dataModel"), {type: "module"});

        fnLogger.info("Setting up class model changes listener");
        const classModelChanges = this.onClassModelChanges();

        // Cache invalidation for writes this instance did not make itself - another tab
        // on the same IndexedDB, a direct pristine write. Local writes are already
        // handled synchronously by StackPlugin calling `invalidateWriteCaches`; this
        // rides the one shared feed (ADR-0021) and so adds no listener of its own.
        const invalidateFromChange = (change: { doc?: unknown }) => {
            if (change?.doc) this.invalidateWriteCaches([change.doc]);
        };
        for (const watched of ["class", "~self", "~Policy"]) {
            this.addClassDocSubscriber(ClientStack.subscriberKey("~class", watched), invalidateFromChange);
        }

        /*
        this.modelWorker.onmessage = (event) => {
            const { status, className, message } = event.data;
            
            this.dispatchEvent(new CustomEvent('class-model-propagation-complete', {
                detail: { className: className, success: status === 'success', message }
            }));

            if (status === 'error') {
                fnLogger.error(`Model worker error for class '${className}': ${message}`);
            }
        };
        */

        // Store listener for later
        this.listeners.push(classModelChanges);
    }

    /**
     * @description Clears all listeners from the Stack
     */
    removeAllListeners = () => {
        this.removeEventListener('class-model-propagation-pending', this.onClassModelPropagationStart as EventListener);
        this.removeEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete as EventListener);

        if (this.listeners.length > 0) {
            for (const listener of this.listeners) {
                if (listener && typeof listener.cancel === 'function') {
                    try {
                        listener.cancel();
                    } catch (error) {
                        logger.warn('Error while cancelling listener', { error });
                    }
                }
            }
            this.listeners = [];
        }

        // Cancelling each subscription should have emptied this and stopped the shared
        // feed, but a handle obtained outside `this.listeners` would not have, so close
        // it out directly.
        this.classDocSubscribers.clear();
        if (this.classDocFeed) {
            this.classDocFeed.cancel();
            this.classDocFeed = undefined;
        }
    }

    /**
     * @description When a class model propagation starts write the ~lock document to the database.
     * It prevents any further modifications on the class data model
     * @param event
     */
    onClassModelPropagationStart = (event: CustomEvent<ClassModelPropagationStart>) => {
        const className = event.detail.className;
        const fnLogger = logger.child({ method: "onClassModelPropagationStart", className });
        this.addClassLock(className).then(() => {
            fnLogger.info(`Lock created successfully for class: '${className}'`);
        }).catch(error => {
            fnLogger.error(`Error creating lock for '${className}': ${error}`);
        });
    }

    /**
     * @description When a class model propagation comes to completion remove the corresponding 
     * ~lock from the database
     * @param event 
     */
    onClassModelPropagationComplete = (event: CustomEvent<ClassModelPropagationComplete>) => {
        const fnLogger = logger.child({ method: "onClassModelPropagationComplete", args: { event } });
        const className = event.detail.className;
        this.clearClassLock(className).then(() => {
            fnLogger.info(`Lock removed successfully for class: '${className}'`);
        }).catch(error => {
            fnLogger.error(`Error removing lock for '${className}': ${error}`);
        });;
    }

    /**
     * @returns PouchDB.Core.Changes<{}>
     */
    onClassModelChanges = () => {
        const fnLogger = logger.child({ listener: "classModelChanges" });

        const classModelChanges = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            filter: (doc) => {
                return doc["~class"] == "class";
            }
        }).on("change", async (change) => {
            const doc = change.doc;
            if (doc && isClassModel(doc) && doc.active) {
                const className = doc.name;
                // Invalidate cached version if present
                fnLogger.info(`Class model was updated. Clearing '${className}' from cache.`);
                delete this.cache[className];
                fnLogger.info(`Successfully cleared '${className}' from cache.`);
            } else if (doc && isClassModel(doc) && !doc.active) {
                const className = doc.name;
                fnLogger.info(`Class was deleted. Removing from '${className} from cache.'`);
            } // else
        });

        return classModelChanges;
    }

    onClassLock = (className: string) => {
        const classLockListener = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            filter: (doc) => {
                return doc["~class"] == "~lock" && doc._id == `~lock-propagation-${className}`;
            }
        });
        this.listeners.push(classLockListener);
        return classLockListener;
    }

    addClassLock = async (className: string) => {
        const fnLogger = logger.child({ method: "addClassLock", args: { className } });
        try {
            const existing = await this.db.get(`~lock-propagation-${className}`);
            let _rev: string | undefined = undefined;
            if (existing) {
                _rev = existing._rev;
            }
            const response = await this.db.put({
                _id: `~lock-propagation-${className}`,
                "~class": `~Lock`,
                _rev
            });
            fnLogger.info(`Adding class lock response`, { response });
            return response.ok;
        } catch (e: any) {
            fnLogger.error(`Error while adding class lock: ${e}`);
            return false;
        }
    }

    clearClassLock = async (className: string) => {
        const fnLogger = logger.child({ method: "clearClassLock", args: { className } });
        try {
            const doc = await this.db.get(`~lock-propagation-${className}`);
            fnLogger.info(`Fetched class lock`, { document: doc });
            const response = await this.db.remove(doc);
            fnLogger.info(`Removing class lock response`, { response });
            return response.ok;
        } catch (e: any) {
            fnLogger.error(`Error while adding class lock: ${e}`);
            return false;
        }
    }

    /**
     * Opens the shared class-document feed if it is not already running.
     *
     * Dispatch is keyed on the document's `~class`, which is what the per-class filters
     * used to test. A change with no document therefore cannot be routed and is dropped,
     * exactly as the filters dropped it: PouchDB hands a filter only `{_id, _rev,
     * _deleted}` for a hard deletion, so `~class` was already absent. DocStack deletes
     * are soft - the document arrives with `active: false` - so this is not the delete
     * path.
     */
    /** The subscriber-map key for a name in one of the two namespaces. */
    private static subscriberKey = (metaKey: "~class" | "~domain", name: string) => `${metaKey}:${name}`;

    /**
     * Resolves which subscribers a change belongs to.
     *
     * A document names its owner in exactly one of two fields - `~class` for a class's
     * documents, `~domain` for a domain's relation documents - so the routing key comes
     * from whichever is present. A change with neither cannot be routed and is dropped,
     * exactly as the per-class filters dropped it: PouchDB hands a filter only
     * `{_id, _rev, _deleted}` for a hard deletion, so no meta field was there either.
     * DocStack deletes are soft - the document arrives with `active: false` - so this is
     * not the delete path.
     */
    private static routingKeyFor = (doc: any): string | null => {
        if (typeof doc?.["~class"] === "string") return ClientStack.subscriberKey("~class", doc["~class"]);
        if (typeof doc?.["~domain"] === "string") return ClientStack.subscriberKey("~domain", doc["~domain"]);
        return null;
    }

    private ensureClassDocFeed = () => {
        if (this.classDocFeed) return;

        this.classDocFeed = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
        }).on("change", (change) => {
            const key = ClientStack.routingKeyFor(change.doc);
            if (!key) return;

            const subscribers = this.classDocSubscribers.get(key);
            if (!subscribers?.size) return;

            // Copied: a handler is allowed to cancel its subscription while dispatching.
            for (const subscriber of [...subscribers]) {
                try {
                    subscriber(change);
                } catch (error) {
                    logger.warn("classDocFeed - subscriber threw", { key, error });
                }
            }
        }).on("error", (error) => {
            logger.error("classDocFeed - feed error", { error });
        });
    }

    private addClassDocSubscriber = (key: string, listener: (change: any) => void) => {
        let subscribers = this.classDocSubscribers.get(key);
        if (!subscribers) {
            subscribers = new Set();
            this.classDocSubscribers.set(key, subscribers);
        }
        subscribers.add(listener);
        this.ensureClassDocFeed();
    }

    private removeClassDocSubscriber = (key: string, listener: (change: any) => void) => {
        const subscribers = this.classDocSubscribers.get(key);
        if (!subscribers) return;

        subscribers.delete(listener);
        if (!subscribers.size) this.classDocSubscribers.delete(key);

        // Nothing left to serve: give the database its `destroyed` listener back.
        if (!this.classDocSubscribers.size && this.classDocFeed) {
            this.classDocFeed.cancel();
            this.classDocFeed = undefined;
        }
    }

    /**
     * Subscribes to changes on the documents of a class, or of a domain.
     *
     * Returns a handle onto {@link classDocFeed} rather than a feed of its own, so the
     * database carries one `destroyed` listener no matter how many are watched.
     * Cancelling releases only this subscriber; the feed stops once the last one goes.
     *
     * Prefer {@link subscribeClassDocs} / {@link subscribeDomainDocs}, which route changes
     * through the decrypting preparation step (ADR-0020). Whichever is used, the handle
     * must be handed to {@link releaseListener} when the watcher is done.
     *
     * @param className - The class or domain whose documents to watch.
     * @param metaKey - Which field names the owner: `~class` (default) for a class's
     * documents, `~domain` for a domain's relation documents. Separate namespaces.
     * @returns A cancellable subscription handle.
     */
    onClassDoc = (className: string, metaKey: "~class" | "~domain" = "~class"): ChangesSubscription => {
        const owned = new Set<(change: any) => void>();
        const key = ClientStack.subscriberKey(metaKey, className);
        let cancelled = false;

        const subscription: ChangesSubscription = {
            on: (event: string, listener: (value: any) => void) => {
                // "complete" never arrives on a live feed, and feed-level errors are
                // logged centrally; both are accepted so this stays a drop-in for a
                // PouchDB `Changes`.
                if (event === "change" && !cancelled) {
                    owned.add(listener);
                    this.addClassDocSubscriber(key, listener);
                }
                return subscription;
            },
            cancel: () => {
                if (cancelled) return;
                cancelled = true;
                for (const listener of owned) this.removeClassDocSubscriber(key, listener);
                owned.clear();
            },
        } as ChangesSubscription;

        this.listeners.push(subscription);
        return subscription;
    }

    /**
     * Prepares a document delivered by the changes feed for a listener.
     *
     * The changes feed is the one read path that does not pass through
     * {@link StackPlugin}: decryption lives in the `bulkGet` wrapper, which is what makes
     * `getCards` and `findDocuments` transparent, while `include_docs` hands back exactly
     * what is stored. Every read decrypted except the one that pushed, so a live view
     * received an `EncryptedPayload` object where it had just rendered a string.
     *
     * @param doc - The document from `change.doc`.
     * @param classObj - The class, when known; without it encrypted values are still
     * recognised by shape.
     * @returns A copy safe to hand to a consumer. Never contains an `EncryptedPayload`.
     *
     * @example
     * ```typescript
     * const doc = await stack.prepareChangeDocument(change.doc, classObj);
     * doc.ssn; // plaintext, or null when it cannot be opened
     * ```
     */
    public override prepareChangeDocument = async (doc: Document, classObj?: Class): Promise<Document> => {
        if (!this.cryptoEngine.isEnabled()) return doc;

        const encryptedKeys = this.cryptoEngine.identifyEncryptedKeys(doc, classObj);
        if (!encryptedKeys.length) return doc;

        const clone = { ...doc } as Document;
        if (this.cryptoEngine.getDocumentKey()) {
            await this.cryptoEngine.decryptDocument(clone, classObj, encryptedKeys);
        }

        // Whatever is still sealed - no key at all, or one this engine no longer holds -
        // is nulled rather than passed on. That is what a locked *read* returns, so
        // locked reads and locked change events agree; and it is the defect itself, since
        // an `EncryptedPayload` reaching a view is what crashes it. Dropping the event
        // instead would make a locked stack look frozen.
        for (const key of encryptedKeys) {
            if (isEncryptedPayload((clone as any)[key])) {
                (clone as any)[key] = null;
            }
        }

        return clone;
    }


    /**
     * Evicts derived caches after documents were written.
     *
     * Called synchronously by StackPlugin after every successful `bulkDocs` batch (which
     * every local write funnels through, `put`/`post`/`remove` and replication included),
     * and again by the shared changes feed for writes made outside this instance -
     * another tab on the same database, most commonly. The write-path call is what makes
     * a policy or schema write visible to the very next read: the changes feed delivers
     * asynchronously, and a cache invalidated only by the feed would serve stale answers
     * in that window.
     *
     * Class-model writes clear the model and snapshot caches wholesale rather than by
     * key - a rename leaves the old name keyed to a model that no longer answers to it,
     * and class writes are rare enough that precision buys nothing.
     *
     * @param docs - The documents just written; omit to invalidate everything.
     */
    invalidateWriteCaches = (docs?: unknown[]) => {
        let classTouched = !docs;
        let policyTouched = !docs;
        for (const doc of docs ?? []) {
            if (!doc || typeof doc !== "object") continue;
            if (isClassModel(doc as { [key: string]: any })) classTouched = true;
            else if ((doc as { [key: string]: any })["~class"] === "~Policy") policyTouched = true;
            if (classTouched && policyTouched) break;
        }
        if (classTouched) {
            this.classModelCache.clear();
            this.classSnapshotCache.clear();
        }
        if (policyTouched) {
            this.policyEngine?.invalidatePolicyCache();
        }
    }

    /**
     * Whether a database-level `limit` returns the same rows as limiting in memory.
     *
     * `findDocuments` filters per document *after* the query - policy checks drop
     * unreadable documents, and a locked crypto engine drops documents whose visible
     * fields are all encrypted. A limit applied before either would under-fill. The
     * query engine asks this before pushing a SQL LIMIT into the fetch.
     *
     * @param className - The class being queried.
     */
    canApplyQueryLimitEarly = async (className: string): Promise<boolean> => {
        if (this.cryptoEngine.isEnabled() && !this.cryptoEngine.getDocumentKey()) return false;
        return !(await this.policyEngine.hasPoliciesFor(className));
    }

    /**
     * Creates the stack's standing Mango indexes.
     *
     * Every `findDocuments` selector carries `~class` and `active`, and without an index
     * pouchdb-find answers each one with a full `allDocs` scan - linear in database
     * size, per call. One fixed index serves them all. This replaces the old commented
     * per-query `createIndex` inside `findDocuments`, which built a fresh index for
     * every distinct selector shape and buried the database in design documents - the
     * "breaks find and even db" the comment there warned about.
     *
     * Failure is deliberately non-fatal: an index is an optimization, and pouchdb-find
     * falls back to scanning exactly as before.
     */
    private async ensureMangoIndexes() {
        try {
            await (this.db as PouchDB.Database).createIndex({
                index: {
                    fields: ["~class", "active"],
                    ddoc: "docstack-indexes",
                    name: "by-class-active",
                },
            });
        } catch (e: any) {
            logger.warn("ensureMangoIndexes - could not create index; queries fall back to scans", { error: e?.message || e });
        }
    }

    /** Registry of on-demand sort indexes; a `_local` doc, so per-device and unreplicated. */
    private static readonly SORT_INDEX_REGISTRY_ID = "_local/docstack-sort-indexes";
    /** Prefix shared by every sort-index design document this stack creates. */
    private static readonly SORT_INDEX_DDOC_PREFIX = "docstack-sort-";
    /** Most sort indexes a stack will maintain; past this, queries sort in memory. */
    private static readonly MAX_SORT_INDEXES = 20;
    /** How stale a sort index may go before {@link cleanupSortIndexes} removes it. */
    private static readonly SORT_INDEX_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
    /** Fields whose sort index exists this session; avoids re-running createIndex. */
    private sortIndexSession = new Map<string, number>();

    private async readSortIndexRegistry(): Promise<{ _id: string, _rev?: string, indexes: { [field: string]: { createdAt: number, lastUsed: number } } }> {
        try {
            return await this.db.get(ClientStack.SORT_INDEX_REGISTRY_ID) as any;
        } catch {
            return { _id: ClientStack.SORT_INDEX_REGISTRY_ID, indexes: {} };
        }
    }

    /**
     * Creates (or confirms) a Mango index for sorting by `field`, and records the use.
     *
     * Indexes are made on demand by the query engine when an ORDER BY can ride the
     * database, and every index is a standing cost: a view updated on every write from
     * then on. Three things keep that bounded: a cap ({@link MAX_SORT_INDEXES}) past
     * which this returns `false` and the caller sorts in memory; a usage registry (a
     * `_local` document, per device) stamped on each use; and
     * {@link cleanupSortIndexes}, run at init, dropping indexes idle past
     * {@link SORT_INDEX_MAX_IDLE_MS}. A dropped index is not an error - the next sorted
     * query recreates it.
     *
     * @param field - The document field to index for sorting (under `~class`).
     * @returns `true` when the index exists and may be used for a sorted query.
     */
    ensureSortIndex = async (field: string): Promise<boolean> => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return false;

        // Stamp usage at most every 6 hours - a write per sorted query would be its own
        // hot-path cost.
        const now = Date.now();
        const stamped = this.sortIndexSession.get(field);
        if (stamped !== undefined && now - stamped < 6 * 60 * 60 * 1000) return true;

        try {
            const registry = await this.readSortIndexRegistry();
            if (!registry.indexes[field]) {
                if (Object.keys(registry.indexes).length >= ClientStack.MAX_SORT_INDEXES) {
                    logger.warn("ensureSortIndex - sort index cap reached; sorting in memory", { field });
                    return false;
                }
                registry.indexes[field] = { createdAt: now, lastUsed: now };
            } else {
                registry.indexes[field].lastUsed = now;
            }

            await (this.db as PouchDB.Database).createIndex({
                index: {
                    fields: ["~class", field],
                    ddoc: `${ClientStack.SORT_INDEX_DDOC_PREFIX}${field}`,
                    name: `sort-${field}`,
                },
            });

            await this.db.put(registry as any);
            this.sortIndexSession.set(field, now);
            return true;
        } catch (e: any) {
            logger.warn("ensureSortIndex - could not create sort index; sorting in memory", { field, error: e?.message || e });
            return false;
        }
    }

    /**
     * Drops sort indexes that have gone unused.
     *
     * Covers indexes this device created *and* ones that replicated in as design
     * documents from a peer: every `_design/docstack-sort-*` doc is considered, and one
     * with no registry entry is adopted with the current time as first-seen, so it gets
     * a full idle period before removal. Runs automatically at init; callable directly
     * for an immediate sweep.
     *
     * @param options.olderThanMs - Idle threshold; defaults to {@link SORT_INDEX_MAX_IDLE_MS}.
     * @returns Which fields were removed and which kept.
     */
    cleanupSortIndexes = async (options: { olderThanMs?: number } = {}): Promise<{ removed: string[], kept: string[] }> => {
        const olderThanMs = options.olderThanMs ?? ClientStack.SORT_INDEX_MAX_IDLE_MS;
        const now = Date.now();
        const removed: string[] = [];
        const kept: string[] = [];

        try {
            const registry = await this.readSortIndexRegistry();

            // Design docs are replicated; a peer's sort index can land here without a
            // registry entry. Sweep what actually exists, not just what we recorded.
            const ddocs = await this.db.allDocs({
                startkey: `_design/${ClientStack.SORT_INDEX_DDOC_PREFIX}`,
                endkey: `_design/${ClientStack.SORT_INDEX_DDOC_PREFIX}\ufff0`,
            });
            const liveFields = ddocs.rows.map(row => row.id.slice(`_design/${ClientStack.SORT_INDEX_DDOC_PREFIX}`.length));

            for (const field of liveFields) {
                const entry = registry.indexes[field];
                if (!entry) {
                    // Unknown provenance: adopt it and give it a full idle period.
                    registry.indexes[field] = { createdAt: now, lastUsed: now };
                    kept.push(field);
                    continue;
                }
                if (now - entry.lastUsed >= olderThanMs) {
                    await (this.db as any).deleteIndex({
                        ddoc: `_design/${ClientStack.SORT_INDEX_DDOC_PREFIX}${field}`,
                        name: `sort-${field}`,
                    });
                    delete registry.indexes[field];
                    this.sortIndexSession.delete(field);
                    removed.push(field);
                } else {
                    kept.push(field);
                }
            }

            // Registry entries whose design doc is gone (deleted elsewhere) are noise.
            for (const field of Object.keys(registry.indexes)) {
                if (!liveFields.includes(field)) delete registry.indexes[field];
            }

            await this.db.put(registry as any);

            // deleteIndex removes the design document, but the built view's data stays
            // on disk until viewCleanup reclaims it.
            if (removed.length > 0) {
                await (this.db as PouchDB.Database).viewCleanup().catch(() => undefined);
            }
        } catch (e: any) {
            logger.warn("cleanupSortIndexes - sweep failed; will retry next init", { error: e?.message || e });
        }
        return { removed, kept };
    }

    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb() {
        logger.warn("initdb - starting initialization", { "stackName": this.name });
        await this.ensureCryptoConfigDocument();
        logger.warn("initdb - crypto config ensured", { "stackName": this.name });
        await this.initIndex();
        await this.ensureMangoIndexes();
        await this.cleanupSortIndexes();
        logger.warn("initdb - index initialized", { "stackName": this.name });
        await this.checkSystem();
        logger.warn("initdb - system checked", { "stackName": this.name });
        this.setListeners();
        logger.warn("initdb - listeners set, initialization complete", { "stackName": this.name });
        return this;
    }

    private async ensureCryptoConfigDocument() {
        const markerId = ClientStack.CRYPTO_CONFIG_DOC_ID;
        let existing: { cryptoEngineDisabled?: boolean; encryptedMarker?: unknown } | null = null;
        try {
            existing = await this.db.get<{ cryptoEngineDisabled?: boolean; encryptedMarker?: unknown }>(markerId);
        } catch (error: any) {
            if (error?.name === "not_found" || error?.status === 404) {
                existing = null;
            } else {
                throw error;
            }
        }

        // No key is invented here. One generated per session cannot outlive it and a
        // second device would generate a different one, so writes would look successful
        // and read back as undecryptable ciphertext. Without a key the stack stays
        // locked instead - see ADR-0018.

        if (existing) {
            await this.validateCryptoConfig(existing);
            return existing;
        }

        const markerDoc: PouchDB.Core.PutDocument<Record<string, unknown>> = {
            _id: markerId,
            cryptoEngineDisabled: this.cryptoEngineDisabled,
            createdAt: new Date().toISOString(),
        };

        if (!this.cryptoEngineDisabled) {
            const randomBytes = new Uint8Array(12);
            globalThis.crypto.getRandomValues(randomBytes);
            const encryptedMarker = await this.cryptoEngine.encryptValueForMarker({
                nonce: Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
            });
            if (encryptedMarker) {
                (markerDoc as any).encryptedMarker = encryptedMarker;
            }
        }

        try {
            await this.db.put(markerDoc as any);
            return markerDoc;
        } catch (error: any) {
            if (error?.status === 409 || error?.name === "conflict") {
                const current = await this.db.get<{ cryptoEngineDisabled?: boolean; encryptedMarker?: unknown }>(markerId);
                await this.validateCryptoConfig(current);
                return current;
            }
            throw error;
        }
    }

    private async ensureCryptoMarkerEncryption() {
        if (this.cryptoEngineDisabled || !this.cryptoEngine.isEnabled()) return;

        const markerId = ClientStack.CRYPTO_CONFIG_DOC_ID;
        const markerDoc = await this.db.get<{ encryptedMarker?: unknown }>(markerId).catch((error: any) => {
            if (error?.name === "not_found" || error?.status === 404) return null;
            throw error;
        });

        if (!markerDoc || isEncryptedPayload((markerDoc as any).encryptedMarker)) return;

        const randomBytes = new Uint8Array(12);
        globalThis.crypto.getRandomValues(randomBytes);
        const encryptedMarker = await this.cryptoEngine.encryptValueForMarker({
            nonce: Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        });

        if (!encryptedMarker) return;

        (markerDoc as any).encryptedMarker = encryptedMarker;
        await this.db.put(markerDoc as any);
    }

    /**
     * Checks a stack's stored crypto configuration against how it is being opened.
     *
     * The canary is the admission test for keys: `encryptedMarker` holds a value only the
     * stack's own document key can decrypt, so a wrong key is caught here rather than
     * becoming unreadable data later. Note what is *not* checked - whether the stack
     * already holds encrypted documents. A key is admitted on proof, so a second device
     * can open a stack the first one wrote, which is the whole point of the wrapped-key
     * path. See ADR-0018.
     *
     * @param existing - The stored `~crypto-engine-config` document.
     * @throws If the engine flag disagrees with the stored one, or a key is present but
     * fails to decrypt the canary.
     */
    private async validateCryptoConfig(existing: { cryptoEngineDisabled?: boolean; encryptedMarker?: unknown }) {
        const storedDisabled = Boolean(existing.cryptoEngineDisabled);
        if (storedDisabled !== this.cryptoEngineDisabled) {
            throw new Error(
                storedDisabled
                    ? "Stack was initialized with crypto engine disabled; re-open it with disableCryptoEngine set to true."
                    : "Stack requires the crypto engine; remove disableCryptoEngine to continue."
            );
        }

        if (storedDisabled) return;

        const canary = (existing as any).encryptedMarker;
        if (!isEncryptedPayload(canary)) return;

        if (!this.cryptoEngine.isEnabled()) {
            throw new Error("Crypto engine must be enabled to access this stack because it contains encrypted data.");
        }

        // No key yet is not a failure: the stack opens locked and the canary is checked
        // again when `unlock` supplies one.
        if (!this.cryptoEngine.getDocumentKey()) return;

        if (!(await this.cryptoEngine.verifyMarker(canary))) {
            throw new Error(
                "The supplied document key does not match this stack: it cannot decrypt the stack's key marker. " +
                "Data written under a different key would be unreadable, so the stack was not opened."
            );
        }
    }

    /**
     * Closes the stack and cleans up all resources.
     * Removes event listeners and terminates background workers.
     */
    close = () => {
        this.cancelSync();
        this.removeAllListeners();
        if (this.modelWorker) this.modelWorker.terminate();
    }

    /**
     * Retrieves a Class instance by name.
     * Results are cached for 15 minutes to improve performance.
     * 
     * @param className - The name or ID of the class to retrieve
     * @param fresh - If `true`, bypasses the cache and fetches from database
     * @returns The Class instance, or `null` if not found
     * 
     * @example
     * ```typescript
     * const taskClass = await stack.getClass('Task');
     * if (taskClass) {
     *     const tasks = await taskClass.getCards();
     * }
     * ```
     */
    getClass = async (className: string, fresh = false): Promise<Class | null> => {
        const fnLogger = logger.child({ method: "getClass", args: { className, fresh } });
        if (!fresh) {
            // Check if class is in cache and not expired
            if (this.cache[className] && this.cache[className] instanceof Class && Date.now() < this.cache[className].ttl) {
                fnLogger.info("Retrieving class from cache", { ttl: this.cache[className].ttl })
                return this.cache[className] as Class;
            }
        }

        const classObj = await Class.fetch(this, className);
        if (classObj) {
            (classObj as unknown as CachedClass).ttl = Date.now() + 60000 * 15; // 15 minutes expiration
            this.cache[className] = classObj as unknown as CachedClass;
        }
        return classObj;
    }

    /**
     * Retrieves a Domain instance by name.
     * Results are cached for 15 minutes to improve performance.
     * 
     * @param domainName - The name or ID of the domain to retrieve
     * @param fresh - If `true`, bypasses the cache and fetches from database
     * @returns The Domain instance, or `null` if not found
     */
    /**
     * Reads a class's current stored model without subscribing or caching it.
     *
     * The counterpart to {@link getClass} for code that wants a schema rather than a live
     * view: validation, encryption, and anything else that runs per write or per row.
     * Two properties matter and pull in opposite directions in {@link getClass}:
     *
     * - It is always current. The cache is invalidated by a changes feed, which is
     *   asynchronous, so during a burst of schema writes - patch application, most
     *   obviously - the cached instance can still be the previous schema. Validating a
     *   document against that fails.
     * - It does not subscribe. A Class built by {@link Class.get} watches its documents
     *   until closed, so building one per written document leaves live feeds behind and
     *   PouchDB eventually warns about the `destroyed` listeners they hold.
     *
     * The returned instance emits no `doc` events and needs no `close()`.
     *
     * @param className - The name or ID of the class.
     * @returns The class, or `null` if there is no model by that name.
     *
     * @example
     * ```typescript
     * const classObj = await stack.getClassSnapshot(doc["~class"]);
     * classObj?.getEncryptedAttributes();
     * ```
     */
    getClassSnapshot = async (className: string): Promise<Class | null> => {
        const classModel = await this.getClassModel(className);
        if (!classModel) return null;

        // Reuse the built instance while the stored model hasn't moved. The `_rev` pin
        // makes staleness impossible regardless of invalidation timing: the model above
        // is the current one (cached or fresh), and a snapshot built from any other
        // revision is rebuilt here rather than served.
        const cached = this.classSnapshotCache.get(className);
        if (cached && classModel._rev && cached.rev === classModel._rev) {
            return cached.cls;
        }

        const cls = await Class.buildFromModel(this, classModel, { subscribe: false });
        if (classModel._rev) {
            this.classSnapshotCache.set(className, { rev: classModel._rev, cls });
        }
        return cls;
    }

    getDomain = async (domainName: string, fresh = false): Promise<Domain | null> => {
        const fnLogger = logger.child({ method: "getDomain", args: { domainName, fresh } });
        if (!fresh) {
            if (this.cache[domainName] && Date.now() < this.cache[domainName].ttl) {
                fnLogger.info("Retrieving domain from cache", { ttl: this.cache[domainName].ttl });
                return this.cache[domainName] as Domain;
            }
        }

        const domainObj = await Domain.fetch(this, domainName);
        if (domainObj) {
            (domainObj as CachedDomain).ttl = Date.now() + 60000 * 15; // 15 minutes expiration
            this.cache[domainName] = domainObj as CachedDomain;
        }
        return domainObj;
    }

    async initIndex() {
        try {
            let lastDocId: number = await this.getLastDocId();
            // logger.info("initdb - res", res)
            if (!lastDocId) {
                lastDocId = Number(lastDocId);
                // logger.info("initdb - initializing db")
                try {
                    let response = await this.db.put({
                        _id: "lastDocId",
                        value: ++lastDocId
                    });
                    if (response.ok) this.lastDocId = lastDocId;
                    else throw new Error("Got problem while putting doc" + response);
                } catch (error: any) {
                    if (error?.status === 409 || error?.name === "conflict") {
                        const existing = await this.db.get<{ value: number }>("lastDocId");
                        this.lastDocId = Number(existing.value);
                        return;
                    }
                    throw error;
                }
            } else {
                logger.info("initdb - db already initialized, consider purge")
            }
            this.lastDocId = Number(lastDocId);
        } catch (e: any) {
            logger.error("initdb -  something went wrong", e)
            throw new Error(e);
        }
    }

    // static async build( that: ClientStack ) {
    //     let result = await that.initdb();
    //     return result;
    // }

    /**
     * Retrieves a single document by its ID.
     * 
     * @typeParam T - The expected document type
     * @param docId - The document ID to retrieve
     * @returns The document, or `null` if not found
     * 
     * @example
     * ```typescript
     * const task = await stack.getDocument<TaskDocument>('Task-123');
     * if (task) {
     *     console.log(task.title);
     * }
     * ```
     */
    async getDocument<T extends Document>(docId: string) {
        let doc: PouchDB.Core.ExistingDocument<T> | undefined = undefined;
        try {
            doc = await this.db.get<T>(docId);
        } catch (e: any) {
            if (e.name === 'not_found') {
                logger.info("getDocument - not found", e)
                return null;
            }
            logger.info("getDocument - error", e)
            throw new Error(e);
        }
        return doc;
    }

    async getDocRevision(docId: string) {
        let _rev: string | null = null;
        try {
            let doc = await this.getDocument(docId);
            if (doc) _rev = doc._rev;
        } catch (e: any) {
            logger.info("getDocRevision - error", e)
            throw new Error(e);
        }
        return _rev;
    }

    /**
     * Finds multiple documents matching a PouchDB/Mango-style selector.
     * Automatically filters to only active documents and applies access policies.
     * 
     * @typeParam T - The expected document type
     * @param selector - A PouchDB/Mango query selector
     * @param fields - Optional list of fields to return
     * @param skip - Number of documents to skip (for pagination)
     * @param limit - Maximum number of documents to return
     * @returns Object containing matching documents array
     * 
     * @example
     * ```typescript
     * const result = await stack.findDocuments({
     *     '~class': { $eq: 'Task' },
     *     isComplete: { $eq: false }
     * });
     * console.log('Found tasks:', result.docs.length);
     * ```
     */
    findDocuments = async <T extends Document | RelationDocument = Document>(selector: { [key: string]: any }, fields?: string[], skip?: number, limit?: number, sort?: { [field: string]: "asc" | "desc" }[]) => {
        const fnLogger = logger.child({ method: "findDocuments", args: { selector, fields, skip, limit, sort } });

        // By default request for only active documents
        if (!selector.hasOwnProperty("active")) {
            selector["active"] = true;
        }

        let indexFields = Object.keys(selector);
        fnLogger.info("Produced index fields from selector", { indexFields });

        let result: {
            docs: T[],
            [key: string]: any
        } = {
            docs: []
        }

        try {
            // [TODO] This breaks find method and even db!!
            // let indexResult = await this.db.createIndex({
            //     index: { fields: indexFields }
            // });
            // fnLogger.info("Index result", indexResult);
            const query = {
                selector
            }
            if (fields) query["fields"] = fields;
            if (skip) query["skip"] = skip;
            // A sorted query needs a Mango index carrying the sort fields; callers go
            // through ensureSortIndex first (the query engine does).
            if (sort) query["sort"] = sort;
            // Always explicit: pouchdb-find otherwise applies CouchDB's default of 25
            // and silently truncates every un-limited read to 25 documents.
            query["limit"] = limit ? limit : 2 ** 31 - 1;
            let foundResult = await this.db.find(query);

            fnLogger.info("Found", {
                result: foundResult,
                selector: selector,
            });
            const readableDocs = await this.processFoundDocuments<T>(foundResult.docs as unknown as Document[], fields);

            result = { docs: readableDocs, selector, skip, limit };
            return result;
        } catch (e: any) {
            fnLogger.error("findDocument - error", e);
            throw e;
        }
    }

    /**
     * Runs raw fetched documents through the read pipeline: per-document policy
     * check, decryption, and field visibility. Shared by {@link findDocuments} and
     * {@link findDocumentsIterator} so the two cannot drift.
     */
    private async processFoundDocuments<T extends Document | RelationDocument = Document>(docs: Document[], fields?: string[]): Promise<T[]> {
        const readableDocs: T[] = [];

        // Resolved at most once per class per batch, and detached. This used to be
        // `getClass(className, true)` per document, which reads the same stored model
        // but also subscribes the instance it builds: a five-row read left five live
        // feeds behind, and the database's `destroyed` listeners crossed Node's limit
        // within two renders of a live view. The freshness is kept - the cache is
        // invalidated by a changes feed and so can lag a burst of schema writes - and
        // only the subscription is dropped.
        const classesInResult: Map<string, Class | undefined> = new Map();
        const classFor = async (className: string) => {
            if (!classesInResult.has(className)) {
                classesInResult.set(className, (await this.getClassSnapshot(className)) ?? undefined);
            }
            return classesInResult.get(className);
        };

        for (const doc of docs) {
            const canRead = await this.policyEngine.isReadableDocument(doc);
            if (!canRead) {
                logger.info("processFoundDocuments - document is not readable by policy", { docId: doc._id, docClass: doc["~class"] });
                continue;
            }

            const encryptedKeys = this.cryptoEngine.identifyEncryptedKeys(doc);
            const classObj = encryptedKeys.length || (fields && fields.length)
                ? await classFor(doc["~class"])
                : undefined;
            const processedDoc = await this.processReadableDocument(doc, classObj, fields, encryptedKeys);
            if (processedDoc) {
                readableDocs.push(processedDoc as unknown as T);
            }
        }
        return readableDocs;
    }

    /**
     * Reads documents matching a selector as an async stream, in `_id` order.
     *
     * Pages through the database with a keyset cursor on `_id` (which the primary
     * index serves) instead of materializing the full result: peak memory is one
     * batch, and total work across all pages is the same one scan a single big read
     * would do. Each batch goes through the same policy/decryption pipeline as
     * {@link findDocuments}. The cursor advances by the last *fetched* document, not
     * the last *readable* one, so pages thinned out by policy filtering cannot stall
     * the iteration.
     *
     * @param selector - A Mango selector; `active: true` is injected unless present.
     * @param options.fields - Projection; `_id` is always included (the cursor needs it).
     * @param options.batchSize - Documents fetched per page (default 100).
     *
     * @example
     * ```typescript
     * for await (const doc of stack.findDocumentsIterator({ "~class": "Task" })) {
     *     render(doc);
     * }
     * ```
     */
    findDocumentsIterator = <T extends Document | RelationDocument = Document>(
        selector: { [key: string]: any },
        options: { fields?: string[], batchSize?: number } = {}
    ): AsyncGenerator<T, void, void> => {
        const stack = this;
        const batchSize = Math.max(1, options.batchSize ?? 100);
        let fields = options.fields;
        if (fields && !fields.includes("_id")) fields = [...fields, "_id"];

        const baseSelector: { [key: string]: any } = { ...selector };
        if (!baseSelector.hasOwnProperty("active")) {
            baseSelector["active"] = true;
        }

        async function* iterate(): AsyncGenerator<T, void, void> {
            let cursor: string | null = null;
            while (true) {
                const pageSelector: { [key: string]: any } = { ...baseSelector };
                if (cursor !== null) {
                    // Everything at or before the cursor has been fetched already, so
                    // overwriting a caller's own $gt is safe - the first page honored it.
                    const existing = pageSelector._id && typeof pageSelector._id === "object"
                        ? pageSelector._id
                        : pageSelector._id !== undefined ? { $eq: pageSelector._id } : {};
                    pageSelector._id = { ...existing, $gt: cursor };
                } else if (pageSelector._id === undefined) {
                    // The _id sort requires the field constrained; $gt null matches all.
                    pageSelector._id = { $gt: null };
                }

                const raw = await stack.db.find({
                    selector: pageSelector,
                    sort: [{ _id: "asc" }],
                    limit: batchSize,
                    ...(fields ? { fields } : {}),
                });
                const rawDocs = raw.docs as unknown as Document[];
                if (!rawDocs.length) return;

                cursor = rawDocs[rawDocs.length - 1]._id;
                const processed = await stack.processFoundDocuments<T>(rawDocs, fields);
                for (const doc of processed) {
                    yield doc;
                }
                if (rawDocs.length < batchSize) return;
            }
        }
        return iterate();
    }

    private async processReadableDocument(doc: Document, classObj?: Class, fields?: string[], precomputedEncryptedKeys?: string[]) {
        if (!this.cryptoEngine.isEnabled()) {
            return doc;
        }

        const encryptedKeys = precomputedEncryptedKeys ?? this.cryptoEngine.identifyEncryptedKeys(doc, classObj);
        if (!encryptedKeys.length && (!fields || !fields.length)) {
            return doc;
        }

        const clone: Document = { ...doc } as Document;
        const hasDocumentKey = Boolean(this.cryptoEngine.getDocumentKey());

        if (hasDocumentKey && encryptedKeys.length) {
            await this.cryptoEngine.decryptDocument(clone, classObj, encryptedKeys);
        } else if (encryptedKeys.length) {
            for (const key of encryptedKeys) {
                if ((clone as any)[key] !== undefined) {
                    (clone as any)[key] = null;
                }
            }
        }

        const encryptedKeySet = new Set(encryptedKeys);
        const visibleKeys = Object.keys(clone).filter((key) => {
            if (key === "_id" || key === "_rev" || key === "~rev" || key === "~class" || key === "active" || key === "~createTimestamp" || key === "~updateTimestamp" || key === "description") {
                return false;
            }
            if (fields && fields.length) {
                return fields.includes(key) && (clone as any)[key] !== undefined;
            }
            return (clone as any)[key] !== undefined;
        });

        if (!hasDocumentKey && encryptedKeySet.size) {
            const nonEncryptedVisible = visibleKeys.filter((key) => !encryptedKeySet.has(key));
            if (!nonEncryptedVisible.length) {
                return null;
            }
        }

        // A doc with nothing visible is hidden - but only on un-projected reads. When
        // the caller asked for specific fields, a document that merely lacks them is
        // still a row (Mango projection semantics, and what SQL expects of projected
        // columns); dropping it would change row counts under projection pushdown.
        if (!visibleKeys.length && !(fields && fields.length)) {
            return null;
        }

        return clone;
    }

    /**
     * Finds a single document matching a selector.
     * Convenience wrapper around {@link findDocuments} that returns the first match.
     * 
     * @typeParam T - The expected document type
     * @param selector - A PouchDB/Mango query selector
     * @param fields - Optional list of fields to return
     * @param skip - Number of documents to skip
     * @param limit - Maximum number of documents to check
     * @returns The first matching document, or `null` if none found
     */
    async findDocument<T extends Document | RelationDocument = Document>(selector: any, fields = undefined, skip = undefined, limit = undefined) {
        let result = await this.findDocuments<T>(selector, fields, skip, limit);
        return result.docs.length > 0 ? result.docs[0] : null;
    }

    getClassModel = async (className: string) => {
        // Served from cache when possible: this lookup runs at least once per document
        // on every read and write (the policy engine resolves each document's class),
        // and the underlying find is an unindexed scan. `undefined` means never looked
        // up; a cached `null` is a real answer ("no such class") whose entry is evicted
        // when any class document is written.
        if (this.classModelCache.has(className)) {
            return this.classModelCache.get(className) ?? null;
        }

        // TODO: understand whether to use name of _id field
        let selector = {
            $or: [
                { name: { $eq: className } },
                { _id: { $eq: className } }
            ],
            // _id: { $eq: className },
            "~class": { $in: ["class", "~self"] }
        };

        try {
            let response = await this.db.find({ selector });
            if (response == null) return null;
            let result: ClassModel = response.docs[0] as unknown as ClassModel
            logger.info("getClassModel - result", { result: result })
            this.classModelCache.set(className, result ?? null);
            return result;
        } catch (e: any) {
            logger.info("getClassModel - error", e)
            throw new Error(e)
        }
    }

    getDomainModel = async (domainName: string) => {
        let selector = {
            "~class": { $eq: "domain" },
            name: { $eq: domainName }
        };

        try {
            let response = await this.findDocument(selector);
            if (response == null) return null;
            let result: DomainModel = response as DomainModel
            logger.info("getDomainModel - result", { result: result })
            return result;
        } catch (e: any) {
            logger.info("getDomainModel - error", e)
            throw new Error(e)
        }
    }

    // TODO: move listener to stack field, for easier un-registering
    // TODO: Change into getClass("Class").getCards()
    getClassModels = async (conf: { listen?: boolean, filter?: string[], search?: string } = {}) => {
        const { listen, filter, search } = conf;
        const selector: { [field: string]: object } = { "~class": { $eq: "class" } };
        if (Array.isArray(filter) && filter.length > 0) {
            // TODO: Consider checking against name field instead of _id
            selector._id = { $in: filter };
        }

        // Case 2: A search query (partial match)
        else if (search && typeof search === 'string') {
            // Mango doesn’t have full regex support, so we use $regex via the pouchdb-find plugin.
            selector.$or = [
                { _id: { $regex: RegExp(search, "i") } },
                { name: { $regex: RegExp(search, "i") } },
                { description: { $regex: RegExp(search, "i") } }
            ];
        }
        const fields = ['_id', 'name', 'description', 'schema', '~class', '_rev'];

        const response = await this.findDocuments(selector, fields);
        const result: ClassModel[] = response.docs as ClassModel[];

        if (!conf.listen) {
            return { list: result };
        }

        // Create a live listener via PouchDB changes feed
        const listener = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            selector
        });

        this.listeners.push(listener);

        return {
            list: result,
            listener
        };
    }

    getClasses = async (conf: { filter?: string[], search?: string }) => {
        const classNames = conf.filter;
        const searchFilter = conf.search;
        const fnLogger = logger.child({ method: "getClasses" });
        fnLogger.info("Requesting");

        const { list: classModels, listener } = await this.getClassModels({
            listen: true, filter: classNames, search: searchFilter
        });
        fnLogger.info("Received class models", { classModels });

        const classList: Class[] = [];

        // Get current class list
        for (const classModel of classModels) {
            fnLogger.info(`Building class "${classModel.name}"`);
            const classObj = await Class.buildFromModel(this, classModel);
            classList.push(classObj);
        }

        // Queue for occasional addition/deletion
        if (listener) {
            listener.on("change", async (change) => {
                if (!change.deleted) {
                    const className = change.id;
                    fnLogger.info(`Received class model change with "${className}"`);
                    const existingIndex = classList.findIndex(c => c.model._id === className);
                    const classObj = await Class.buildFromModel(this, change.doc as ClassModel);
                    if (existingIndex === -1) {
                        classList.push(classObj);
                    } else {
                        // The instance leaving the list owns a subscription; the rebuild
                        // has already made its own.
                        classList[existingIndex].close();
                        classList[existingIndex] = classObj;
                    }
                    const evt = new CustomEvent("classListChange", { detail: classList });
                    this.dispatchEvent(evt);
                } else {
                    // remove from classList without altering the array reference
                    const idx = classList.findIndex(c => c.model._id === change.id);
                    if (idx !== -1) {
                        classList[idx].close();
                        classList.splice(idx, 1);
                        const evt = new CustomEvent("classListChange", { detail: classList });
                        this.dispatchEvent(evt);
                    }
                }
            })
        }

        fnLogger.info("Completed inital classes build");

        return classList;
    };

    getDomainModels = async (conf: { listen?: boolean, filter?: string[], search?: string } = {}) => {
        const { listen, filter, search } = conf;
        const selector: { [field: string]: object } = { "~class": { $eq: "domain" } };
        if (Array.isArray(filter) && filter.length > 0) {
            // TODO: Consider checking against name field instead of _id
            selector._id = { $in: filter };
        }

        // Case 2: A search query (partial match)
        else if (search && typeof search === 'string') {
            // Mango doesn’t have full regex support, so we use $regex via the pouchdb-find plugin.
            selector.$or = [
                { _id: { $regex: RegExp(search, "i") } },
                { name: { $regex: RegExp(search, "i") } },
                { description: { $regex: RegExp(search, "i") } }
            ];
        }
        const fields = ['_id', 'name', 'description', 'schema', '~class', '_rev'];

        const response = await this.findDocuments(selector, fields);
        const result: DomainModel[] = response.docs as DomainModel[];

        if (!conf.listen) {
            return { list: result };
        }

        // Create a live listener via PouchDB changes feed
        const listener = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            selector
        });

        // Tracked, so closing the stack cancels it. It used to be left out, which meant
        // every call to this method leaked a feed.
        this.listeners.push(listener);

        return {
            list: result,
            listener
        };
    }

    getDomains = async (conf: { filter?: string[], search?: string }) => {
        const classNames = conf.filter;
        const searchFilter = conf.search;
        const fnLogger = logger.child({ method: "getDomains" });
        fnLogger.info("Requesting");

        const { list: domainModels, listener } = await this.getDomainModels({
            listen: true, filter: classNames, search: searchFilter
        });
        fnLogger.info("Received class models", { domainModels });

        const domainList: Domain[] = [];

        // Get current class list
        for (const domainModel of domainModels) {
            fnLogger.info(`Building class "${domainModel.name}"`);
            const domain = await Domain.buildFromModel(this, domainModel);
            domainList.push(domain);
        }

        // Queue for occasional addition/deletion
        if (listener) {
            listener.on("change", async (change) => {
                if (!change.deleted) {
                    const domainName = change.id;
                    fnLogger.info(`Received class model change with "${domainName}"`);
                    const existingIndex = domainList.findIndex(c => c.model._id === domainName);
                    const domain = await Domain.buildFromModel(this, change.doc as DomainModel);
                    if (existingIndex === -1) {
                        domainList.push(domain);
                    } else {
                        domainList[existingIndex].close();
                        domainList[existingIndex] = domain;
                    }
                    const evt = new CustomEvent("domainListChange", { detail: domainList });
                    this.dispatchEvent(evt);
                } else {
                    // remove from classList without altering the array reference
                    const idx = domainList.findIndex(c => c.model._id === change.id);
                    if (idx !== -1) {
                        domainList[idx].close();
                        domainList.splice(idx, 1);
                        const evt = new CustomEvent("domainListChange", { detail: domainList });
                        this.dispatchEvent(evt);
                    }
                }
            })
        }

        fnLogger.info("Completed inital domains build");

        return domainList;
    };

    async incrementLastDocId() {
        return this.advanceLastDocId(1);
    }

    /**
     * Advances the document-id counter by `count` in one database write.
     *
     * Batch creation hands out `count` ids from the in-memory counter and commits them
     * here once, instead of a get+put round-trip per document.
     */
    async advanceLastDocId(count: number) {
        let docId = "lastDocId",
            _rev = await this.getDocRevision(docId);

        if (_rev) {
            this.lastDocId += count;
            await this.db.put({
                _id: "lastDocId",
                _rev: _rev,
                value: this.lastDocId
            });
            return this.lastDocId;
        }
        // throw new Error

    }

    // The idea of this method is to be called from within the server (like CLI command)
    // 
    async reset() {
        await this.destroyDb();
        // wait a few seconds
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.initialize(
            this.connection, this.options
        );
        await this.initdb()
        return this;
    }

    async destroyDb() {
        const fnLogger = logger.child({ method: "destroyDb" });
        try {
            this.db.destroy(null, () => {
                fnLogger.info("Destroyed db");
                return true;
            });
        } catch (e: any) {
            fnLogger.error(`Error while destroying db: ${e}`);
            return false;
        }
    }

    // This method is similar to destroyDb, but intended to be called from the client (not to destroy the main db)
    // TODO: Right now this allows to clear any db
    // there should be more restrictions
    static async clear(conn: string) {
        return new Promise((resolve, reject) => {
            try {
                let db = new PouchDB(conn)
                db.destroy(null, () => {
                    logger.info("clear - Destroyed db");
                    resolve(true);
                });
            } catch (e: any) {
                logger.error("clear - Error while destroying db" + e)
                reject(false)
            }
        })
    }

    addClass = async (classObj: Class) => {
        const fnLogger = logger.child({ method: "addClass", args: { class: classObj.name } });
        const classOrigin = await this.getClass(classObj.type);
        if (classOrigin == null) {
            fnLogger.error("Class originator not found", { classType: classObj.type });
            throw new Error(`Class originator ${classObj.type} not found in stack`);
        }
        let classModel = classObj.getModel();
        fnLogger.info("Got class model", { classModel })
        try {
            // Identified by name, the way `addDomain` already identifies a domain, rather
            // than by a minted id. A class name is the stack's real key for it - documents
            // carry it as `~class`, and `getClassModel` assumes one model per name - so
            // deriving the model's id from it is both stable and unique by construction.
            //
            // It also has to be stable across devices. Ids used to come from a counter, so
            // two devices creating the same class produced the same id and collided; they
            // are random now (ADR-0023), which would instead leave two models for one
            // class, two default policies, and both copies on both devices after a sync.
            // A name-derived id converges: the two writes are the same document.
            const result = await this.createDoc(
                classModel.name, classOrigin.getName(), classOrigin, classModel
            ) as ClassModel;
            fnLogger.info("Added class card", { result });
            await this.ensureDefaultPolicyForClass(result);
            return result;
        } catch (e) {
            fnLogger.error("Error adding class card", { error: e })
            const message = (e as Error)?.message || "Failed to add class card";
            throw new Error(message)
        }
        // let existingDoc = await this.getClassModel(classModel.name);
        // if ( existingDoc == null ) {
        //     let resultDoc = await this.createDoc(classModel.name, 'class', CLASS_SCHEMA, classModel);
        //     fnLogger.info("Result", {result: resultDoc});
        //     // TODO: Consider creating a design doc for easier filtering
        //     return resultDoc as ClassModel;
        // } else {
        //     return existingDoc;
        // } 
    }

    addDomain = async (domainObj: Domain) => {
        const fnLogger = logger.child({ method: "addDomain", args: { domain: domainObj.name } });
        let domainModel = domainObj.getModel();
        fnLogger.info("Got domain model", { domainModel })
        let existingDoc = await this.getDomainModel(domainModel.name);
        if (existingDoc == null) {
            let resultDoc = await this.createDoc(domainModel.name, 'domain', DOMAIN_SCHEMA, domainModel);
            fnLogger.info("Result", { result: resultDoc });
            // TODO: Consider creating a design doc for easier filtering
            return resultDoc as DomainModel;
        } else {
            return existingDoc;
        }
    }

    updateClass = async (classObj: Class) => {
        const fnLogger = logger.child({ method: "updateClass", args: { class: classObj.name } });
        let result = await this.createDoc(classObj.getId()!, 'class', classObj, classObj.getModel());
        fnLogger.info("Result", result)
        return result
    }

    addDesignDocumentPKs = async (className: string, pKs: string[], temp = false) => {
        const fnLogger = logger.child({ method: 'addDesignDocumentPKs', args: { className, pKs } });
        // Construct the compound key string dynamically
        const keyString = pKs.map(key => `doc.${key}`).join(', ');

        // The 'map' function as a string
        const mapCode = `function (doc) {
            const hasAllKeys = ${pKs.map(key => `doc.${key}`).join(' && ')};
            if (hasAllKeys && doc["~class"] === '${className}') {
            emit([${keyString}], doc._id);
            }
        }`;
        fnLogger.info("Generated map code", { code: mapCode });

        let designDocId = `_design/${className}-group`;
        if (temp) designDocId = `_design/${className}-group-temp`;
        const ddoc: {
            _id: string;
            views: {};
            _rev: undefined | string;
        } = {
            _id: designDocId,
            views: {
                'by_pKeys': {
                    map: mapCode
                }
            },
            _rev: undefined,
        };
        fnLogger.info("Prepared design document", { ddoc });

        try {
            // Use 'get' to check if the design doc already exists
            const existingDoc = await this.db.get(designDocId);
            ddoc._rev = existingDoc._rev; // Add _rev to update the existing doc
            await this.db.put(ddoc);
            fnLogger.info('Design document updated successfully.');
        } catch (err: any) {
            if (err.name === 'not_found') {
                // Doc doesn't exist, create it. The `_rev` key has to go rather than be
                // carried as `undefined` - PouchDB rejects that as an invalid rev format.
                await this.db.put(withoutEmptyRev(ddoc));
                fnLogger.info('Design document created successfully.');
            } else {
                fnLogger.error('Error saving design document:', err);
                throw err;
            }
        }
        return designDocId;
    }

    // TODO: consider refactoring to use ~class (before, create) triggers
    // and (before, update) triggers
    prepareDoc(
        _id: string,
        type: string,
        params: { [key: string]: string | number | boolean },
        metaKey: "~class"
    ): Document;
    prepareDoc(
        _id: string,
        type: string,
        params: { [key: string]: string | number | boolean },
        metaKey: "~domain"
    ): RelationDocument;
    prepareDoc(
        _id: string,
        type: string,
        params: { [key: string]: string | number | boolean },
        metaKey: "~class" | "~domain" = "~class"
    ): Document | RelationDocument {
        logger.info("prepareDoc - given args", { _id: _id, type: type, params: params });
        params["_id"] = _id;
        params[metaKey] = type;
        params["~createTimestamp"] = new Date().getTime();
        params["active"] = true;
        logger.info("prepareDoc - after elaborations", { params });
        return params as unknown as Document | RelationDocument;
    }

    /**
     * Creates or updates a single document in the database.
     * 
     * If `docId` is provided and the document exists, it will be updated.
     * If `docId` is `null`, a new ID will be auto-generated in the format `{type}-{incrementalId}`.
     * Access policies are enforced before writing.
     * 
     * @param docId - The document ID, or `null` to auto-generate
     * @param type - The class name (e.g., 'Task', 'User')
     * @param classObj - The Class instance or schema definition for validation
     * @param params - The document data to save
     * @returns The created or updated document
     * @throws Error if policy check fails or document type conflicts
     * 
     * @example
     * ```typescript
     * // Create with auto-generated ID
     * const task = await stack.createDoc(null, 'Task', taskClass, {
     *     title: 'New Task',
     *     isComplete: false
     * });
     * 
     * // Update existing document
     * await stack.createDoc('Task-123', 'Task', taskClass, {
     *     title: 'Updated Title'
     * });
     * ```
     */
    createDoc = async (docId: string | null, type: string, classObj: Class | ClassModel["schema"], params: {}) => {
        const fnLogger = logger.child({ method: "createDoc", args: { docId, type, params } });
        fnLogger.info("Creating document");
        let schema: ClassModel["schema"] = {};
        if (classObj instanceof Class) {
            schema = classObj.buildSchema();
        } else {
            schema = classObj;
        }
        let db = this.db,
            doc: Document | null = null,
            isNewDoc = false,
            newDocId = "";
        try {
            if (docId) {
                const existingDoc = await this.getDocument(docId) as unknown as Document;
                fnLogger.info("Retrieved doc", { existingDoc })
                // console.log("Existing doc", {existingDoc, params})
                if (existingDoc && existingDoc["~class"] === type) {
                    fnLogger.info("Assigning existing doc", { doc: existingDoc });
                    doc = { ...existingDoc };
                } else if (existingDoc && existingDoc["~class"] !== type) {
                    fnLogger.error("Existing document type differs");
                    throw new Error("createDoc - Existing document type differs");
                } else {
                    isNewDoc = true;
                    newDocId = docId;
                    doc = this.prepareDoc(newDocId, type, params, "~class") as Document;
                }
            } else {
                isNewDoc = true;
                newDocId = this.generateDocId(type);
                doc = this.prepareDoc(newDocId, type, params, "~class") as Document;
                fnLogger.info("Generated docId", { newDocId });
            }
            fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
            let doc_ = withoutEmptyRev({ ...doc, ...params, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
            if (type === "~User" || type === "User") {
                const groups = (doc_ as any).groupId;
                if (!groups || (Array.isArray(groups) && groups.length === 0)) {
                    (doc_ as any).groupId = ["Group-Default"];
                }
            }
            if (type === "~UserSession" || type === "UserSession") {
                let sessionGroups = (doc_ as any).groupId;
                if (!sessionGroups || (Array.isArray(sessionGroups) && sessionGroups.length === 0)) {
                    const sessionUserId = (doc_ as any).userId;
                    if (sessionUserId) {
                        const relatedUser = await this.getDocument(sessionUserId).catch(() => null) as any;
                        if (relatedUser?.groupId) {
                            sessionGroups = relatedUser.groupId;
                        }
                    }
                    if (!sessionGroups || (Array.isArray(sessionGroups) && sessionGroups.length === 0)) {
                        sessionGroups = ["Group-Default"];
                    }
                    (doc_ as any).groupId = sessionGroups;
                }
            }
            if (doc_["~class"]?.startsWith("Account-")) {
                // console.log("Doc after merge", { doc_ })
            }
            fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
            await this.policyEngine.ensureWriteAllowed(type, doc_ as Document);
            let response = await db.put(doc_);
            // Stamped from the response, not left as the pre-put draft. A caller cannot
            // otherwise tell a document that landed from one that did not - which is
            // exactly the ambiguity that made a colliding id look like a success. See
            // ADR-0023.
            doc = { ...doc_, _id: response.id, _rev: response.rev } as Document;
            fnLogger.info("Response after put", { "response": response });
            if (response.ok && isNewDoc) {
                await this.incrementLastDocId();
                docId = response.id;
            }
            else if (response.ok) {
                docId = response.id;
            }
            else {
                fnLogger.error("Error, check logs", { "response": response });
                throw new Error("createDoc - Error, check logs");
            }
        } catch (e: any) {
            // A conflict used to be swallowed here, and `doc` - the in-memory draft,
            // with no `_rev` - returned as though the write had succeeded. That is how a
            // colliding id turned into silent data loss: the caller got a
            // document-shaped value back and no reason to think anything was wrong.
            // Ids are random now, so a conflict means a genuine concurrent write to the
            // same id rather than an exhausted counter, and the caller has to hear it.
            // See ADR-0023.
            fnLogger.error("Problem while putting doc", {
                error: e?.message ?? String(e),
                name: e?.name,
                status: e?.status,
                docId: (doc as any)?._id,
            });
            throw e instanceof Error ? e : new Error(`createDoc - ${String(e)}`);
        }
        return doc;
    }

    /**
     * Creates or updates multiple documents in a single batch operation.
     * More efficient than calling {@link createDoc} multiple times.
     * 
     * @param docs - Array of document specifications with optional docId and params
     * @param type - The class name for all documents
     * @param classObj - The Class instance or schema definition for validation
     * @returns Array of created or updated documents
     * @throws Error if policy check fails for any document
     * 
     * @example
     * ```typescript
     * const tasks = await stack.createDocs([
     *     { docId: null, params: { title: 'Task 1' } },
     *     { docId: null, params: { title: 'Task 2' } },
     *     { docId: 'Task-existing', params: { title: 'Updated' } }
     * ], 'Task', taskClass);
     * ```
     */
    createDocs = async (docs: { docId: string | null, params: {} }[], type: string, classObj: Class | ClassModel["schema"]) => {
        const fnLogger = logger.child({ method: "createDocs", args: { docs } });

        let schema: ClassModel["schema"] = {};
        if (classObj instanceof Class) {
            schema = classObj.buildSchema();
        } else {
            schema = classObj;
        }
        fnLogger.info("Determined schema", { schema });

        let db = this.db;
        const documents: Document[] = [];
        let newDocsIds: string[] = [];
        // Advanced locally as ids are handed out, committed once after the write.
        // Reading `this.lastDocId + 1` per draft instead handed every generated
        // document in a batch the same id, so a batch of new documents collapsed
        // into one; and committing per document was two database round-trips each.
        let nextDocId = this.lastDocId;

        for (const draft of docs) {
            let { docId, params } = draft;
            let doc: Document | null = null;
            let isNewDoc = false;
            try {
                if (docId) {
                    const existingDoc = await this.getDocument(docId) as unknown as Document;
                    fnLogger.info("retrieved doc", { existingDoc })
                    if (existingDoc && existingDoc["~class"] === type) {
                        fnLogger.info("createDocs - assigning existing doc", { doc: existingDoc });
                        doc = { ...existingDoc };
                    } else if (existingDoc && existingDoc["~class"] !== type) {
                        throw new Error("createDocs - Existing document type differs");
                    } else {
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, type, params, "~class") as Document;
                    }
                } else {
                    docId = this.generateDocId(type);
                    doc = this.prepareDoc(docId, type, params, "~class") as Document;
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = withoutEmptyRev({ ...doc, ...params, _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
                fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                await this.policyEngine.ensureWriteAllowed(type, doc_ as Document);
                documents.push(doc_);
                if (isNewDoc) newDocsIds.push(docId);
            } catch (e: any) {
                fnLogger.error("createDocs - Problem while preparing doc", {
                    "error": e,
                    "document": doc
                });
                throw new Error("createDocs - Problem while preparing doc" + e);
            }
        }
        try {
            const response = await db.bulkDocs(documents);
            fnLogger.info("Response after bulkDocs", { "response": response });
            // Commit the counter once for the whole batch rather than once per document.
            // Ids handed to failed writes are skipped, never reused - uniqueness is what
            // the counter promises, not density.
            const newDocsCount = response.filter(res => res.id != null && newDocsIds.includes(res.id)).length;
            fnLogger.info(`Successfully created ${newDocsCount} new documents.`);
            if (newDocsIds.length > 0) {
                await this.advanceLastDocId(newDocsIds.length);
            }
        } catch (e: any) {
            fnLogger.error("createDocs - Problem while putting docs", {
                "error": e,
                "documents": documents
            });
            throw new Error("createDocs - Problem while putting docs" + e);
        }
        return documents;
    }

    /**
     * Creates a relation document linking two entities via a Domain.
     * Relation documents represent relationships between documents (e.g., 1:N, N:N).
     * 
     * @param docId - The relation document ID, or `null` to auto-generate
     * @param relationName - A descriptive name for this relation instance
     * @param domainObj - The Domain defining the relationship type
     * @param params - The relation parameters including source and target references
     * @returns The created relation document, or `null` on error
     * 
     * @example
     * ```typescript
     * const relation = await stack.createRelationDoc(
     *     null,
     *     'ProjectTask',
     *     projectTaskDomain,
     *     {
     *         sourceClass: 'Project',
     *         targetClass: 'Task',
     *         sourceId: 'Project-1',
     *         targetId: 'Task-42'
     *     }
     * );
     * ```
     */
    createRelationDoc = async (
        docId: string | null,
        relationName: string,
        domainObj: Domain,
        params: {
            sourceClass: string,
            targetClass: string,
            sourceId: string,
            targetId: string
        }): Promise<RelationDocument | null> => {
        const fnLogger = logger.child({ method: "createRelationDoc", args: { docId, relationName, params } });
        fnLogger.info("Creating relation document");
        let db = this.db,
            doc: RelationDocument | null = null,
            isNewDoc = false;
        try {
            if (docId) {
                const existingDoc = await this.db.get(docId) as RelationDocument;
                fnLogger.info("retrieved doc", { existingDoc })
                if (existingDoc && existingDoc["~domain"] === domainObj.name) {
                    fnLogger.info("Assigning existing doc", { doc: existingDoc });
                    doc = { ...existingDoc };
                } else if (existingDoc && existingDoc["~domain"] !== domainObj.name) {
                    fnLogger.error("Existing document type differs");
                    throw new Error("createDoc - Existing document type differs");
                } else {
                    fnLogger.warn("No relation document");
                    isNewDoc = true;
                    doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                }
            } else {
                docId = this.generateDocId(domainObj.name);
                doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                isNewDoc = true;
                fnLogger.info("Generated docId", docId);
            }
            fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
            const doc_ = withoutEmptyRev({ ...doc, ...params, _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
            fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
            let response = await db.put(doc_);
            fnLogger.info("Response after put", { "response": response });
            if (response.ok && isNewDoc) {
                await this.incrementLastDocId();
                docId = response.id;
            }
            else if (response.ok) {
                docId = response.id;
            }
            else {
                fnLogger.error("Error, check logs", { "response": response });
                throw new Error("createDoc - Error, check logs");
            }
        } catch (e: any) {
            // Rethrown, not swallowed. This used to log and fall through to `return doc`,
            // handing back the in-memory draft for a write that never landed - so a
            // relation refused by schema or cardinality validation was indistinguishable
            // from one that succeeded, and `Domain.addRelation` passed the phantom
            // straight back to the application. `createDoc`, `createDocs` and
            // `createRelationDocs` all rethrow; this was the one that did not.
            //
            // The message is unpacked rather than logged as `{ error: e }`: an Error's
            // `message` is not enumerable, so the nested form serialises to whatever
            // incidental properties the error happens to carry and loses the reason.
            fnLogger.error("Error while creating relation document", {
                error: e?.message ?? String(e),
                name: e?.name,
                status: e?.status,
            });

            // A conflict means the relation is already stored, which is the one outcome
            // the caller asked for anyway. `createDoc` treats it the same way.
            if (e?.name === "conflict") {
                fnLogger.info("Conflict - relation already present");
                return doc;
            }

            throw e instanceof Error ? e : new Error(`createRelationDoc - ${String(e)}`);
        }
        return doc;
    }

    /**
     * Creates multiple relation documents in a single batch operation.
     * More efficient than calling {@link createRelationDoc} multiple times.
     * 
     * @param docs - Array of relation specifications
     * @param relationName - A descriptive name for these relations
     * @param domainObj - The Domain defining the relationship type
     * @returns Array of created relation documents
     * 
     * @example
     * ```typescript
     * const relations = await stack.createRelationDocs([
     *     { docId: null, params: { sourceClass: 'Project', targetClass: 'Task', sourceId: 'Project-1', targetId: 'Task-1' } },
     *     { docId: null, params: { sourceClass: 'Project', targetClass: 'Task', sourceId: 'Project-1', targetId: 'Task-2' } }
     * ], 'ProjectTasks', projectTaskDomain);
     * ```
     */
    createRelationDocs = async (docs: {
        docId: string | null; params: {
            sourceClass: string;
            targetClass: string;
            sourceId: string;
            targetId: string;
        };
    }[], relationName: string, domainObj: Domain): Promise<RelationDocument[]> => {
        const fnLogger = logger.child({ method: "createRelationDocs", args: { docs, relationName } });

        let db = this.db;
        const documents: RelationDocument[] = [];
        let newDocsIds: string[] = [];
        // See createDocs: per-draft ids off a local counter, committed once below.
        let nextDocId = this.lastDocId;

        for (const draft of docs) {
            let { docId, params } = draft;
            let doc: RelationDocument | null = null;
            let isNewDoc = false;
            try {
                if (docId) {
                    const existingDoc = await db.get(docId) as RelationDocument;
                    fnLogger.info("retrieved doc", { existingDoc })
                    if (existingDoc && existingDoc["~domain"] === domainObj.name) {
                        fnLogger.info("createRelationDocs - assigning existing doc", { doc: existingDoc });
                        doc = { ...existingDoc };
                    } else if (existingDoc && existingDoc["~domain"] !== domainObj.name) {
                        throw new Error("createRelationDocs - Existing document type differs");
                    } else {
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                    }
                } else {
                    docId = this.generateDocId(domainObj.name);
                    doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = withoutEmptyRev({
                    ...doc,
                    ...params,
                    _id: docId,
                    _rev: doc._rev,
                    "~updateTimestamp": new Date().getTime()
                });
                fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                documents.push(doc_);
                if (isNewDoc) newDocsIds.push(docId);
            } catch (e: any) {
                fnLogger.error("createRelationDocs - Problem while preparing doc", {
                    "error": e,
                    "document": doc
                });
                throw new Error("createRelationDocs - Problem while preparing doc" + e);
            }
        }
        try {
            // console.log("Documents to be created", {documents});
            const response = await db.bulkDocs(documents);
            fnLogger.info("Response after bulkDocs", { "response": response });
            const newDocsCount = response.filter(res => res.id != null && newDocsIds.includes(res.id)).length;
            fnLogger.info(`Successfully created ${newDocsCount} new documents.`);
            if (newDocsIds.length > 0) {
                await this.advanceLastDocId(newDocsIds.length);
            }
        } catch (e: any) {
            fnLogger.error("createRelationDocs - Problem while putting docs", {
                "error": e,
                "documents": documents
            });
            throw new Error("createRelationDocs - Problem while putting docs" + e);
        }
        return documents;
    }

    /**
     * Sets the active param of a document to false
     * @param _id 
     * @returns Promise<boolean>
     */
    deleteDocument = async (_id: string): Promise<boolean> => {
        const fnLogger = logger.child({ method: "deleteDocument", args: { _id } });
        const doc = await this.db.get<Document>(_id);
        if (doc) {
            try {
                const targetClass = (doc as any)["~class"] as string;
                await this.policyEngine.ensureWriteAllowed(targetClass, doc);
                await this.db.put({ ...doc, active: false });
                return true;
            } catch (e: any) {
                fnLogger.error(`Error while deleting document: ${e}`, { document: doc });
                return false;
            }
        } else {
            fnLogger.error("Found no document with given id");
            return false;
        }
    }

    /**
     * Executes a SQL query against the local database.
     * Supports SELECT, JOIN, WHERE, ORDER BY, GROUP BY, and UNION operations.
     * 
     * @param sql - The SQL query string
     * @param params - Optional query parameters for prepared statements
     * @returns Object containing result rows and the parsed AST
     * 
     * @example
     * ```typescript
     * // Simple select
     * const { rows } = await stack.query('SELECT * FROM Task WHERE isComplete = false');
     * 
     * // Join with ordering
     * const { rows } = await stack.query(`
     *     SELECT t.title, u.username AS assignee
     *     FROM Task AS t
     *     JOIN User AS u ON u._id = t.assigneeId
     *     ORDER BY t.createdAt DESC
     * `);
     * 
     * // With parameters
     * const { rows } = await stack.query('SELECT * FROM Task WHERE priority = ?', 'high');
     * ```
     */
    /**
     * Replaces `?` placeholder nodes in a parsed AST with the caller's parameter values.
     *
     * Values are restricted to plain scalars: an object here could carry Mango
     * operators of its own and reach the database as part of a pushed-down selector,
     * changing what the query matches. Structured values belong in the document
     * model, not in a comparison.
     */
    private static bindQueryParams(node: unknown, params: any[]) {
        if (Array.isArray(node)) {
            for (const item of node) ClientStack.bindQueryParams(item, params);
            return;
        }
        if (!node || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node as { [key: string]: any })) {
            if (value && typeof value === "object" && (value as any).type === "placeholder") {
                const index = (value as any).index;
                if (index >= params.length) {
                    throw new Error(`Query expects at least ${index + 1} parameter(s), got ${params.length}`);
                }
                const bound = params[index];
                if (bound !== null && !["string", "number", "boolean"].includes(typeof bound)) {
                    throw new Error(`Query parameter ${index + 1} must be a string, number, boolean or null`);
                }
                (node as any)[key] = { type: "param", value: bound };
            } else {
                ClientStack.bindQueryParams(value, params);
            }
        }
    }

    query = async (sql: string, ...params: any[]) => {
        const fnLogger = logger.child({ method: "query", args: { sql, params } });
        fnLogger.info("Executing query");
        let astList: (SelectAST | UnionAST)[] = [];
        try {
            astList = parse(sql);
            ClientStack.bindQueryParams(astList, params);
            fnLogger.info("Produced AST", { astList });
        } catch (error: any) {
            error.ast = astList.length > 0 ? astList[0] : null;
            throw error;
        }

        // A UNION query is treated as a single execution, not a loop over ASTs.
        if (astList.length > 0) {
            try {
                const plan = createPlan(astList);
                const rows = await executePlan(this, plan, params);
                // The AST for the whole query (including unions) is the list
                fnLogger.info("Query executed successfully", { rows, astList });
                return { rows, ast: astList };
            } catch (error: any) {
                error.ast = astList; // Attach full AST list to error for debugging
                throw error;
            }
        }

        // Handle case where query is empty or only comments
        return { rows: [], ast: null };
    }

    /**
     * Executes a SQL query as an async stream of rows.
     *
     * The streaming counterpart to {@link query}: single-table plans without
     * aggregation, DISTINCT, ORDER BY, or subqueries stream row by row on top of
     * {@link findDocumentsIterator} - peak memory is one page regardless of result
     * size, and a LIMIT stops the underlying scan early. More complex plans execute
     * normally and yield from the materialized result, so the API is uniform.
     * Row order on the streaming path is `_id` order.
     *
     * @param sql - The SQL SELECT statement.
     * @param params - Values for `?` placeholders.
     *
     * @example
     * ```typescript
     * for await (const row of stack.queryStream("SELECT t.title FROM Task AS t WHERE t.done = FALSE;")) {
     *     render(row);
     * }
     * ```
     */
    queryStream = (sql: string, ...params: any[]): AsyncGenerator<{ [column: string]: any }, void, void> => {
        const astList = parse(sql);
        ClientStack.bindQueryParams(astList, params);
        const plan = createPlan(astList);
        return executePlanStream(this, plan, params);
    }
}



export default ClientStack