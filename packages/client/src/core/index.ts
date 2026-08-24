// import express, {Express} from 'express'
// import { static as exStatic } from 'express';
// import * as dotenv from "dotenv";
// import cors from "cors";
// dotenv.config({ path: './.env' })
import createlogger from "../utils/logger/index.js"
// import test from '../../../server/src//utils/dbManager/test';
// import { generateJwtKeys, generatePswKeys } from '../../../server/src/utils/crypto';
import ClientStack from './stack.js';
// import { login, JWTAuthPayload, setupAdminUser } from '../../../server/src//utils/auth';
// import memoryAdapter from "pouchdb-adapter-memory"
// import cookieParser from 'cookie-parser';
// import jwt from 'jsonwebtoken';
import Class from "./class.js";
import Domain from './domain.js';
import { Trigger } from "./trigger/index.js";
import { JobEngine } from "./job-engine/index.js";
// import AbstractClass from '../../shared/src//utils/stack/class';
import Attribute from './attribute.js';
import { AttributeType, ClientCredentials, DocstackReady, StackConfig, StackOptions } from "@docstack/shared";
import { DocStackSyncHandle } from './sync/index.js';
import type { DocStackSyncOptions } from './sync/index.js';
import type { Logger } from "../utils/logger/index.js";

// let envPath = process.env.ENVFILE || "./.env";
// envPath = resolve(process.cwd(), envPath);
// dotenv.config({ path: envPath });


// [TODO] Implement DocStack.type in "remote" | "local"
// When is remote, open a websocket (socket.io) connection to given remote
// implement cases in each of stack methods (queries and doc creation)
// to actually send and receive messages
// [TODO][HARD] Think about authentication mechanism
// Probably support same rest authentication (jwtToken)
// but also api tokens
// Remote connection that require auth can be opened but
// cannot send or receive messages until authentication
/**
 * The main entry point for the DocStack client library.
 * 
 * DocStack manages multiple {@link ClientStack} instances and provides
 * a unified interface for database operations, authentication, and
 * class/attribute creation.
 * 
 * The client emits a `ready` event when all stacks are initialized.
 * 
 * @example
 * ```typescript
 * // Initialize DocStack with a single database
 * const docstack = new DocStack({ name: 'my-app' });
 * 
 * // Wait for ready
 * docstack.addEventListener('ready', async () => {
 *     const stack = docstack.getStack('my-app');
 *     const taskClass = await stack.getClass('Task');
 * });
 * 
 * // Initialize with credentials for automatic authentication
 * const docstack = new DocStack({
 *     name: 'my-app',
 *     credentials: { username: 'admin', password: 'secret' }
 * });
 * ```
 * 
 * @extends EventTarget
 */
class DocStack extends EventTarget {
    /** Array of stack configurations used for initialization. */
    private config: StackConfig[] = [];
    /** Whether all stacks have been initialized and ready for use. */
    private readyState: boolean;
    /** The primary/default stack (first in the list). */
    private store!: ClientStack;
    /** Array of all initialized ClientStack instances. */
    stacks: ClientStack[] = [];
    /** The handle from the last {@link sync} call. */
    private syncHandle?: DocStackSyncHandle;
    private logger: Logger = createlogger().child({ module: "client" });

    /**
     * Splits a {@link StackConfig} into the connection string and the options a stack
     * is created with.
     *
     * Everything the caller passed is forwarded - including `adapter` and any
     * adapter-specific keys - so a stack can be opened on a transport other than the
     * default one.
     *
     * @param config - A stack name, or a full configuration object.
     * @returns The connection string and the resolved {@link StackOptions}.
     */
    private static resolveStackConfig(config: StackConfig): { connection: string; options: StackOptions } {
        if (typeof config === "string") {
            return { connection: `db-${config}`, options: { name: config } };
        }

        const { connection, ...rest } = config as { connection?: string } & StackOptions;
        const name = rest.name;
        if (!connection && !name) {
            throw new Error("A stack configuration needs either a 'name' or a 'connection'");
        }
        return {
            connection: connection || `db-${name}`,
            options: { ...rest, name: name || connection! },
        };
    }

    /**
     * Opens a stack and adds it to this instance.
     *
     * Public because an application's set of databases is not always known at startup:
     * a workspace joined at runtime needs its own database, and its own replication
     * pair, without tearing down the stacks already open. Adding a stack that is
     * already open returns the existing instance rather than opening a second handle
     * on the same database.
     *
     * Dispatches `stack-added` with the new stack in `detail`.
     *
     * @param config - A stack name, or a full configuration object.
     * @returns The stack, initialized and ready.
     *
     * @example
     * ```typescript
     * const stack = await docstack.addStack({ name: `ws-${workspace.slug}`, patches });
     * await stack.sync({ remote: () => driveFor(workspace) });
     * ```
     */
    public addStack = async (config: StackConfig): Promise<ClientStack> => {
        const { connection, options } = DocStack.resolveStackConfig(config);

        const existing = this.getStack(options.name || connection);
        if (existing) {
            this.logger.child({ method: "addStack" }).info("Stack already open", { name: options.name });
            return existing;
        }

        const stack = await ClientStack.create(connection, options);
        this.stacks.push(stack);
        if (!this.store) this.store = stack;
        this.dispatchEvent(new CustomEvent("stack-added", { detail: { stack } }));
        return stack;
    }

    /**
     * Closes a stack and drops it from this instance.
     *
     * Closing cancels the stack's replication and releases its listeners; the data on
     * disk is left alone unless `destroy` is set, which is what leaving a workspace for
     * good looks like.
     *
     * Dispatches `stack-removed` with the stack's name in `detail`.
     *
     * @param name - The stack name or connection string.
     * @param options - `destroy: true` also deletes the underlying database.
     * @returns `true` if a stack was removed, `false` if there was none by that name.
     */
    public removeStack = async (name: string, options?: { destroy?: boolean }): Promise<boolean> => {
        const stack = this.getStack(name);
        if (!stack) return false;

        stack.close();
        this.stacks = this.stacks.filter(s => s !== stack);
        if (this.store === stack) this.store = this.stacks[0];

        if (options?.destroy) {
            await stack.destroyDb();
        }

        this.dispatchEvent(new CustomEvent("stack-removed", { detail: { name } }));
        return true;
    }

    /**
     * Starts replication for every open stack against one transport.
     *
     * The `remote` resolver is called once per stack, which is what makes a
     * database-per-workspace application a single call rather than a loop the
     * application has to keep in step with its own stack list.
     *
     * @param options - See {@link DocStackSyncOptions}. `stacks` narrows it to a subset.
     * @returns A handle holding every stack's replication.
     *
     * @example
     * ```typescript
     * const sync = await docstack.sync({
     *     remote: (stack) => new PouchDB(stack.name, { adapter: 'googledrive', accessToken }),
     * });
     * sync.addEventListener('status', () => render(sync.getStatus()));
     * ```
     */
    public sync = async (options: DocStackSyncOptions): Promise<DocStackSyncHandle> => {
        const { stacks: names, ...stackOptions } = options;
        const targets = names
            ? names.map(name => {
                const stack = this.getStack(name);
                if (!stack) throw new Error(`Stack '${name}' not found`);
                return stack;
            })
            : this.stacks;

        const handle = new DocStackSyncHandle();
        for (const stack of targets) {
            handle.add(stack.name, await stack.sync(stackOptions));
        }
        this.syncHandle = handle;
        return handle;
    }

    /**
     * Returns the handle from the last {@link sync} call, or `null`.
     */
    public getSyncHandle = (): DocStackSyncHandle | null => {
        return this.syncHandle || null;
    }

    /**
     * Stops replication on every stack.
     */
    public cancelSync = () => {
        if (this.syncHandle) this.syncHandle.cancel();
    }

    private initStacks = async (configs: StackConfig[]) => {
        // TODO: Consider changing to Promise.all for concurrency
        for (const config of configs) {
            await this.addStack(config);
        }

        this.readyState = true;
        // Readiness means "usable for what it currently permits", not "fully keyed": a
        // locked stack must still signal ready, or consumers wait forever on the event -
        // including the one that was about to supply the key. `locked` names the stacks
        // still waiting for one. See ADR-0018.
        this.dispatchEvent(new CustomEvent("ready", {
            detail: {
                stacks: this.stacks,
                locked: this.stacks.filter(stack => stack.isLocked()).map(stack => stack.name),
            }
        }))
    }

    /**
     * Resets all initialized stacks.
     * This clears the data in all stacks managed by this DocStack instance.
     * 
     * @throws Error if the reset operation fails for any stack.
     */
    async resetAll() {
        try {
            for (const stack of this.stacks) {
                await stack.reset();
            }
        } catch (e: any) {
            throw new Error(e);
        }
    }

    /**
     * Returns all initialized stacks.
     * @returns Array of ClientStack instances
     */
    public getStacks() {
        return this.stacks;
    }

    /**
     * Gets a stack by its name or connection string.
     * 
     * @param name - The stack name or connection identifier
     * @returns The matching ClientStack, or `undefined` if not found
     * 
     * @example
     * ```typescript
     * const stack = docstack.getStack('my-app');
     * if (stack) {
     *     const users = await stack.query('SELECT * FROM User');
     * }
     * ```
     */
    public getStack = (name: string) => {
        return this.stacks.find(s => s.name == name || s.connection == name);
    }

    /**
     * Authenticates a user on a specific stack.
     * 
     * @param name - The stack name to authenticate against
     * @param credentials - The user's login credentials
     * @returns The authentication session proof
     * @throws Error if the stack is not found
     * 
     * @example
     * ```typescript
     * const proof = await docstack.authenticateStack('my-app', {
     *     username: 'user@example.com',
     *     password: 'password123'
     * });
     * ```
     */
    public async authenticateStack(name: string, credentials: ClientCredentials) {
        const stack = this.getStack(name);
        if (!stack) {
            throw new Error(`Stack '${name}' not found`);
        }
        return stack.authenticate(credentials);
    }

    /**
     * Returns whether all stacks have been initialized.
     * @returns `true` if ready, `false` otherwise
     */
    public getReadyState() {
        return this.readyState;
    }
    /**
     * Resets all stacks and re-initializes them.
     * Useful for testing or clearing all data.
     */
    async reset() {
        try {
            await this.resetAll();
            await this.initStacks(this.config);
        } catch (e: any) {
            throw new Error(e);
        }
    }

    /**
     * Clears the connection data for a specific stack connection string.
     * 
     * @param conn - The connection string or name to clear.
     * @throws Error if the connection name is missing or the operation fails.
     */
    public clearConnection = async (conn: string) => {
        const fnLogger = this.logger.child({ method: 'clearConnection' });
        try {
            // const conn = req.params.conn;
            if (!conn) {
                throw new Error("Connection name not provided");
            }
            await ClientStack.clear(conn);
            fnLogger.info('Internal database cleared');
            // return res.status(200).json({ success: true, message: 'Internal database cleared' });
        } catch (e: any) {
            throw new Error(e);
            // return res.status(500).json({ success: false, error: 'An error occurred' });
        }
    }

    /**
     * Exports all documents from a stack.
     * 
     * @param stackName - The name of the stack to export
     * @returns All documents from the stack
     * @throws Error if the stack is not found
     */
    public export = async (stackName: string) => {
        const stack = this.getStack(stackName);
        if (stack) {
            const dump = await stack.dump();
            return dump;
        } else {
            throw new Error(`Did not find any stack for name '${stackName}'`);
        }
    }

    /**
     * Creates a new Class in the specified stack.
     * 
     * @param stackName - The name of the stack to create the class in
     * @param name - The class name
     * @param config - Configuration with type and description
     * @throws Error if the stack is not found
     * 
     * @example
     * ```typescript
     * await docstack.createClass('my-app', 'Product', {
     *     type: 'class',
     *     description: 'Product catalog items'
     * });
     * ```
     */
    public createClass = async (stackName: string, name: string, config: {
        type: string,
        description: string
    }) => {
        const fnLogger = this.logger.child({ method: 'createClass' });
        const stack = this.getStack(stackName);
        if (!stack) {
            throw new Error(`Stack '${stackName}' not found`);
        }
        const { type, description } = config;
        fnLogger.info("Args", {
            stackName, name, config
        })

        try {
            const newClass = await Class.create(
                stack, name, "class", description as string,
                {}
            );
            fnLogger.info(`class '${name}' created successfully.`,
                { classModel: newClass.getModel() }
            )
        } catch (e: any) {
            throw new Error(`Error during class '${name}' creation. ${e}`);
        }

        fnLogger.info('Class created successfully');
    }

    /**
     * Creates a new Attribute on a Class in the specified stack.
     * 
     * @param stackName - The name of the stack containing the class
     * @param className - The class to add the attribute to
     * @param params - Attribute configuration
     * @throws Error if the stack or class is not found
     * 
     * @example
     * ```typescript
     * await docstack.createAttribute('my-app', 'Product', {
     *     name: 'price',
     *     type: 'number',
     *     description: 'Product price in cents'
     * });
     * ```
     */
    public createAttribute = async (stackName: string, className: string, params: {
        name: string, type: AttributeType["type"], description?: string, config?: {}
    }) => {
        const fnLogger = this.logger.child({ method: 'createAttribute' });
        const stack = this.getStack(stackName);
        if (!stack) {
            throw new Error(`Stack '${stackName}' not found`);
        }
        const { name, type, description, config } = params;
        fnLogger.info(`Creating attribute for class '${className}' in stack '${stackName}'`, {
            name, type, config
        });

        try {
            // Loads the class object
            let classObj = await stack.getClass(className);
            if (classObj) {
                let newAttribute = await Attribute.create(classObj, name, type, description, config);
                fnLogger.info(`Attribute '${name}' added to class '${className}'`,
                    { attributeModel: newAttribute.getModel() }
                );
            } else {
                throw new Error(`Failed to retrieve Class '${className}'`);
            }

        } catch (e: any) {
            fnLogger.error(`Error during attribute '${name}' creation: ${e}`);
            throw new Error(`Error during attribute '${name}' creation: ${e}`);
        }
    }

    /**
     * Creates a new DocStack client instance.
     * Initializes all configured stacks asynchronously.
     * Listen for the `ready` event to know when initialization is complete.
     * 
     * @param config - One or more stack configurations
     * 
     * @example
     * ```typescript
     * const docstack = new DocStack(
     *     { name: 'primary-db' },
     *     { name: 'backup-db' }
     * );
     * 
     * docstack.addEventListener('ready', () => {
     *     console.log('All stacks ready!');
     * });
     * ```
     */
    constructor(...config: StackConfig[]) {
        super();
        this.readyState = false;
        const fnLogger = this.logger.child({ method: "constructor" });

        /*
        this.app.use(logRequest)
        // Enable CORS for all routes
        if (process.env.NODE_ENV === 'development') {
            logger.info("Development environment. Enabling CORS for :8080");
            this.app.use(cors({
                origin: 'http://localhost:8080',
                // Replace with the origin of webpack dev server
                methods: ['GET', 'POST'], 
                credentials: true,
            }));
        }
        */
        /*
        // Use built-in middleware for parsing JSON and URL-encoded data
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(cookieParser());
        this.app.use((req, res, next) => {
            if (!this.readyState) {
                return res.status(503); // Service Unavailable.
            }
            // Server is ready to receive requests
            next()
        })
        */
        /*
        this.app.use('/api/private', (req, res, next) => {
            const token = req.cookies.jwtToken
            if (!token) {
                logger.error("No token provided")
                return res.status(403).json({
                    success: false,
                    message: 'No token provided',
                });
            }
            const secretKey = process.env.JWT_PUBLIC_KEY;
            if (!secretKey || secretKey === '') {
                logger.error("No secret key found")
                return res.status(500).json({
                    success: false,
                    message: 'No secret key found',
                });
            }
            jwt.verify(token, secretKey, async (err, payload: JWTAuthPayload) => {
                if (err) {
                    logger.error("Invalid token", err)
                    return res.status(403).json({
                        success: false,
                        message: 'Invalid token',
                    });
                } else {
                    // Check whether the session is still valid
                    const { sessionId } = payload;
                    const UserSessionClass = await this.store.getClass("UserSession");
                    const sessionCards = await UserSessionClass.getCards({
                        sessionId: { $eq: sessionId },
                        sessionStatus: { $eq: "active" }
                    }, null, 0, 1);
                    if (sessionCards.length === 0) {
                        return res.status(403).json({
                            success: false,
                            message: 'Session expired',
                        });
                    }
                    // TODO: Consider passing the session card to the next middleware
                    next();
                }
            });
        })
        */
        // TODO: Serve the dashboard to a specific route, i.e.: admin 
        // this.app.use(exStatic('./dist'));

        // TODO: Serve the static files from the build folder
        // of the UI application
        // this.app.get('*', (req, res) => {
        //     const templatePath = resolve(__dirname, './dist', 'index.html');
        //     res.sendFile(templatePath);
        // });

        /*
        this.app.post('/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const { responseCode, body, token } = await login(username, password);
                // Append also the token to the response
                let cookieOptions = {}
                if (process.env.NODE_ENV === 'development') {
                    cookieOptions = { sameSite: 'None', secure: true, maxAge: 1000 * 60 * 15 };
                    logger.warn("Development mode: setting cookie options to SameSite=None; Secure=true for JWT token");
                } else cookieOptions = { sameSite: 'Strict', httpOnly: true, maxAge: 1000 * 60 * 15 };

                res.cookie('jwtToken', token, cookieOptions);
                return res.status(responseCode).json(body);
            } catch (error) {
                console.error("Error during login", error);
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        });
        */

        /* 
        this.app.get('/api/private/reset', async (req, res) => {
            try {
                await this.reset();
                return res.status(200).json({ success: true, message: 'Internal database reset' });
            } catch (e) {
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        });
        */
        /*
        this.app.get('/api/private/clear:conn', async (req, res) => {
            try {
                const conn = req.params.conn;
                if (!conn) {
                    throw new Error("Connection name not provided");
                }
                await ClientStack.clear(conn);
                return res.status(200).json({ success: true, message: 'Internal database cleared' });
            } catch (e) {
                logger.error("Error during database clear", e);
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        });
        */
        /*
        this.app.get('/api/private/test', (req, res) => {
            return res.status(200).json({ message: 'Hello from the server! This is a private route' });
        });
        */
        /*
        this.app.post('/api/private/create-class/:name', async (req, res) => {
            const { name } = req.params;
            const { type, description } = req.query;
            logger.info("create-class - received request", {
                params: req.params,
                query: req.query
            })

            try {
                const newClass = await Class.create(
                    this.store, name, type as string, description as string
                );
                logger.info("create-class", `class '${name}' created successfully.`,
                    {classModel: newClass.getModel()}
                )
            } catch (e) {
                logger.error(`Error during class '${name} creation: ${e}`);
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
            
            return res.status(200).json({ success: true, message: 'Class created successfully' });
        })
        */
        /*
        this.app.put('/api/private/create-attribute/:name', async (req, res) => {
            const className = req.params.name;
            const { name, type, config } = req.body;
            logger.info(`create-attribute - for class '${className}'`, {
                name, type, config
            });

            try {
                // Loads the class object
                let classObj = await this.store.getClass(className);
                let newAttribute = await Attribute.create(classObj, name, type, config);
                logger.info(`create-attribute - Attribute '${name}' added to class '${className}'`, 
                    {attributeModel: newAttribute.getModel()}
                );
            } catch (e) {
                logger.error(`Error during attribute '${name}' creation: ${e}`)
            }
        })
        */
        // const port = process.env.SERVER_PORT || 5000;

        // const server = this.app.listen(port, () => logger.info(`Listening on port ${port}`));

        // Procedure that should run once only
        // can be considered "setup procedures"
        //generatePswKeys()
        // generateJwtKeys()

        // Server "startup procedures"
        // setTimeout(test, 1000)
        // Kept so `reset()` has the configurations to rebuild from.
        this.config = config;
        this.initStacks(config);
        this.addEventListener("ready", () => fnLogger.info("DocStack client successfully initialized"));
    }

    // public getApp() {
    //     return this.app;
    // }
}

/**
 * Core exports from the DocStack client library.
 * 
 * @module @docstack/client
 */
export { ClientStack, Trigger, Class, Attribute, Domain, JobEngine };
export {
    StackSyncHandle,
    DocStackSyncHandle,
    SyncSchemaMismatchError,
    SYNC_META_DOC_ID,
    readRemoteSchemaVersion,
    publishSchemaVersion,
    createReplicationFilter,
    isInternalDoc,
    resolveInternalClasses,
    createClassFilter,
    hasClassRules,
    DATA_MODEL_CLASSES,
    withFilterIdentity,
    describeFilter,
    INTERNAL_DOC_IDS,
    INTERNAL_DOC_ID_PREFIXES,
    INTERNAL_DOC_CLASSES,
    OPTIONAL_INTERNAL_DOC_CLASSES,
} from "./sync/index.js";
export type {
    SyncDirection,
    SyncState,
    SyncStatus,
    StackSyncOptions,
    DocStackSyncOptions,
    RemoteResolver,
    SyncMetaDoc,
    InternalDocFilterOptions,
    ClassFilterOptions,
} from "./sync/index.js";
export { StackWriteGuardError } from "./guarded-db.js";
export { StackLockedError } from "../plugins/pouchdb.js";
/**
 * Key-identity helpers, for applications that re-key a database.
 *
 * `deriveKeyId` names a key the same way stored payloads do, so an application can tell
 * which of its keys a field belongs to without holding any of them.
 */
export { deriveKeyId, isEncryptedPayload } from "./crypto-engine/index.js";
export type { EncryptedPayload } from "./crypto-engine/index.js";
export { DocStack };
