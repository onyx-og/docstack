// import express, {Express} from 'express'
// import { static as exStatic } from 'express';
// import * as dotenv from "dotenv";
// import cors from "cors";
// dotenv.config({ path: './.env' })
import createlogger from "../utils/logger/index"
// import test from '../../../server/src//utils/dbManager/test';
// import { generateJwtKeys, generatePswKeys } from '../../../server/src/utils/crypto';
import ClientStack from './stack';
// import { login, JWTAuthPayload, setupAdminUser } from '../../../server/src//utils/auth';
// import memoryAdapter from "pouchdb-adapter-memory"
// import cookieParser from 'cookie-parser';
// import jwt from 'jsonwebtoken';
import Class from "./class";
import Domain from './domain';
import { Trigger } from "./trigger/index";
import { JobEngine } from "./job-engine/index";
// import AbstractClass from '../../shared/src//utils/stack/class';
import Attribute from './attribute';
import { AttributeType, ClientCredentials, DocstackReady, StackConfig, StackOptions } from "@docstack/shared";
import { createLogger, Logger } from "winston";
// import { EventTarget } from 'node:events';

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
    private logger: Logger = createlogger().child({ module: "client" });

    private async addStack(config: StackConfig) {
        let stack: ClientStack | undefined;
        if (typeof config == "object" && config.name) {
            stack = await ClientStack.create(`db-${config.name}`, {
                // defaults to leveldb
                // adapter: 'memory',
                plugins: [
                    // https://www.npmjs.com/package/pouchdb-adapter-memory
                    // memoryAdapter
                ],
                patches: config.patches,
                credentials: (config as any).credentials,
                disableCryptoEngine: (config as StackOptions).disableCryptoEngine,
            });
        } else if (typeof config === "string") {
            stack = await ClientStack.create(`db-${config}`, {
                // defaults to leveldb
                // adapter: 'memory',
                plugins: [
                    // https://www.npmjs.com/package/pouchdb-adapter-memory
                    // memoryAdapter
                ]
            });
        }
        if (stack) {
            this.stacks.push(stack);
            // let window_ = window as Window & typeof globalThis & {
            //     stacks: ClientStack[]
            // }
            // if (window_.stacks) {
            //     window_.stacks.push(stack)
            // } 
            return stack;
        }
        // await setupAdminUser();
    }

    private initStacks = async (configs: StackConfig[]) => {
        // TODO: Consider changing to Promise.all for concurrency
        for (const config of configs) {
            const stack = await this.addStack(config);
        }

        this.readyState = true;
        this.dispatchEvent(new CustomEvent("ready", {
            detail: {
                stacks: this.stacks
            }
        }))
    }

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
export { DocStack };
