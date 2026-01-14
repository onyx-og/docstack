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
} from "@docstack/shared";

import { SystemDoc, Patch, ClassModel, Document, RelationDocument } from "@docstack/shared";
import { StackPlugin } from "../plugins/pouchdb.js";

import { parse, createPlan, executePlan } from "./query-engine/index.js";
import type { SelectAST, UnionAST } from "./query-engine/index.js";
import { JobEngine } from "./job-engine/index.js";
import { PolicyEngine } from "./policy-engine/index.js";
import { CryptoEngine } from "./crypto-engine/index.js";
import { isEncryptedPayload } from "./crypto-engine/utils.js";

const logger = createLogger().child({ module: "stack" });

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

    listeners: PouchDB.Core.Changes<{}>[] = [];

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
        if (options?.name) {
            this.name = options?.name
        }
        const connRegExp = /(?<=db-).*/
        const match = conn.match(connRegExp);
        if (match) {
            this.name = match[0];
        } else {
            this.name = conn;
        }

        // PouchDB.plugin((await import('pouchdb-adapter-node-websql')).default);
        // PouchDB.plugin((await import('pouchdb-adapter-websql')).default);

        // Load default plugins
        PouchDB.plugin(PouchDBFind);
        PouchDB.plugin(StackPlugin(PouchDB, this));
        
        // Validation plugin
        if (options?.plugins) {
            for (let plugin of options.plugins) {
                PouchDB.plugin(plugin);
            }
        }
        this.db = new PouchDB(
            conn,
        );
        (this.db as any).bulkDocs = StackPlugin(PouchDB, this).bulkDocs;
        (this.db as any).bulkGet = StackPlugin(PouchDB, this).bulkGet;

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
    }

    /**
     * Returns the underlying PouchDB database instance.
     * @returns The PouchDB database
     */
    public getDb() {
        return this.db
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
    public setAuthSession(proof: AuthSessionProof) {
        this.authSession = proof;
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
     * Exports all documents from the database.
     * Useful for debugging or creating backups.
     * @returns All documents including their content
     */
    public dump = async () => {
        const all = await this.db.allDocs({ include_docs: true });
        return all;
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
            for (const patch of options.patches.filter(
                p => !patches.docs.find(
                    existing => existing.version === p.version
                    && existing.target === p.target
                )
            )) {
                await stack.applyPatch(patch);
            }
        }
        if (options?.credentials) {
            await stack.authenticate(options.credentials);
        }
        return stack;
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
        // TODO: Initially the wrappedDocumentKey is missing for the system user,
        // perhaps the documentKey hasn't been set yet? 
        const documentKey = await this.cryptoEngine.unwrapAndStoreDocumentKey(user.wrappedDocumentKey, derivedKey);

        const proof: AuthSessionProof = { session: sessionDoc, derivedKey, documentKey: documentKey ?? undefined };
        this.setAuthSession(proof);
        await this.ensureCryptoMarkerEncryption();
        return proof;
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
                const hydratedDocs = await Promise.all(patch.docs.map(async doc => {
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
        console.log("System doc rev", {systemDoc});
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
            console.log("Applied patches, new schema version:", schemaVersion);
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
            console.log("Got system doc", _systemDoc);
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

    onClassDoc = (className: string) => {
        const onClassDocListener = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            filter: (doc) => {
                return doc["~class"] == className;
            }
        });
        this.listeners.push(onClassDocListener);
        return onClassDocListener;
    }

    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb() {
        logger.warn("initdb - starting initialization", { "stackName": this.name });
        await this.ensureCryptoConfigDocument();
        logger.warn("initdb - crypto config ensured", { "stackName": this.name });
        await this.initIndex();
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

        if (!this.cryptoEngineDisabled && !this.cryptoEngine.getDocumentKey()) {
            const randomBytes = new Uint8Array(32);
            globalThis.crypto.getRandomValues(randomBytes);
            const documentKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            await this.cryptoEngine.setDocumentKey(documentKey);
            logger.info("Initialized new document key");
        }

        if (existing) {
            this.validateCryptoConfig(existing);
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
                this.validateCryptoConfig(current);
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

    private validateCryptoConfig(existing: { cryptoEngineDisabled?: boolean; encryptedMarker?: unknown }) {
        const storedDisabled = Boolean(existing.cryptoEngineDisabled);
        if (storedDisabled !== this.cryptoEngineDisabled) {
            throw new Error(
                storedDisabled
                    ? "Stack was initialized with crypto engine disabled; re-open it with disableCryptoEngine set to true."
                    : "Stack requires the crypto engine; remove disableCryptoEngine to continue."
            );
        }

        if (!storedDisabled && isEncryptedPayload((existing as any).encryptedMarker) && !this.cryptoEngine.isEnabled()) {
            throw new Error("Crypto engine must be enabled to access this stack because it contains encrypted data.");
        }
    }

    /**
     * Closes the stack and cleans up all resources.
     * Removes event listeners and terminates background workers.
     */
    close = () => {
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
    findDocuments = async <T extends Document | RelationDocument = Document>(selector: { [key: string]: any }, fields?: string[], skip?: number, limit?: number) => {
        const fnLogger = logger.child({ method: "findDocuments", args: { selector, fields, skip, limit } });

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
            if (limit) query["limit"] = limit;
            let foundResult = await this.db.find(query);
            if (selector.hasOwnProperty("username")) {
                console.log("Found result", { result: foundResult, selector })
            }

            fnLogger.info("Found", {
                result: foundResult,
                selector: selector,
            });
            const readableDocs: T[] = [];

            for (const doc of foundResult.docs as unknown as Document[]) {
                const canRead = await this.policyEngine.isReadableDocument(doc);
                if (!canRead) {
                    fnLogger.info("Based on policies, document is not readable", { docId: doc._id, docClass: doc["~class"] });
                    console.log("Based on policies, document is not readable", { docId: doc._id, docClass: doc["~class"] });
                    continue;
                }

                const encryptedKeys = this.cryptoEngine.identifyEncryptedKeys(doc as Document);
                const classObj = encryptedKeys.length || (fields && fields.length)
                    ? (await this.getClass(doc["~class"], true)) ?? undefined
                    : undefined;
                const processedDoc = await this.processReadableDocument(doc as Document, classObj, fields, encryptedKeys);
                if (processedDoc) {
                    readableDocs.push(processedDoc as unknown as T);
                }
            }

            result = { docs: readableDocs, selector, skip, limit };
            return result;
        } catch (e: any) {
            fnLogger.error("findDocument - error", e);
            throw e;
        }
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

        if (!visibleKeys.length) {
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
                        classList[existingIndex] = classObj;
                    }
                    const evt = new CustomEvent("classListChange", { detail: classList });
                    this.dispatchEvent(evt);
                } else {
                    // remove from classList without altering the array reference
                    const idx = classList.findIndex(c => c.model._id === change.id);
                    if (idx !== -1) {
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
                        domainList[existingIndex] = domain;
                    }
                    const evt = new CustomEvent("domainListChange", { detail: domainList });
                    this.dispatchEvent(evt);
                } else {
                    // remove from classList without altering the array reference
                    const idx = domainList.findIndex(c => c.model._id === change.id);
                    if (idx !== -1) {
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
        let docId = "lastDocId",
            _rev = await this.getDocRevision(docId);

        if (_rev) {
            await this.db.put({
                _id: "lastDocId",
                _rev: _rev,
                value: ++this.lastDocId
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
            const result = await classOrigin.addCard(classModel) as ClassModel;
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
                // Doc doesn't exist, create it
                await this.db.put(ddoc);
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
                newDocId = `${type}-${(this.lastDocId + 1)}`;
                doc = this.prepareDoc(newDocId, type, params, "~class") as Document;
                fnLogger.info("Generated docId", { newDocId });
            }
            fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
            let doc_ = { ...doc, ...params, _rev: doc._rev, "~updateTimestamp": new Date().getTime() };
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
            doc = doc_;
            // Find me
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
            if (e.name === 'conflict') {
                fnLogger.info("Conflict! Ignoring..");
                // TODO: Handle conflict!
            } else {
                fnLogger.info("Problem while putting doc", {
                    "error": e,
                    "document": doc
                })
                throw new Error("createDoc - Problem while putting doc" + e);
            }
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
                    docId = `${type}-${(this.lastDocId + 1)}`;
                    doc = this.prepareDoc(docId, type, params, "~class") as Document;
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = { ...doc, ...params, _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() };
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
            // Increment lastDocId based on number of new docs created
            const newDocsCount = response.filter(res => res.id != null && newDocsIds.includes(res.id)).length;
            fnLogger.info(`Successfully created ${newDocsCount} new documents.`);
            for (let i = 0; i < newDocsCount; i++) {
                await this.incrementLastDocId();
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
                docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                isNewDoc = true;
                fnLogger.info("Generated docId", docId);
            }
            fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
            const doc_ = { ...doc, ...params, _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() };
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
        } catch (e) {
            fnLogger.error("Error while creating relation document", { error: e });
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
                    docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                    doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = {
                    ...doc,
                    ...params,
                    _id: docId,
                    _rev: doc._rev,
                    "~updateTimestamp": new Date().getTime()
                };
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
            // Increment lastDocId based on number of new docs created
            const newDocsCount = response.filter(res => res.id != null && newDocsIds.includes(res.id)).length;
            fnLogger.info(`Successfully created ${newDocsCount} new documents.`);
            for (let i = 0; i < newDocsCount; i++) {
                await this.incrementLastDocId();
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
    query = async (sql: string, ...params: any[]) => {
        const fnLogger = logger.child({ method: "query", args: { sql, params } });
        fnLogger.info("Executing query");
        let astList: (SelectAST | UnionAST)[] = [];
        try {
            astList = parse(sql);
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
}



export default ClientStack