// import express, {Express} from 'express'
// import { static as exStatic } from 'express';
// import * as dotenv from "dotenv";
// import cors from "cors";
// dotenv.config({ path: './.env' })
import createlogger from "../utils/logger";
// import test from '../../../server/src//utils/dbManager/test';
// import { generateJwtKeys, generatePswKeys } from '../../../server/src/utils/crypto';
import ClientStack from './stack';
// import { login, JWTAuthPayload, setupAdminUser } from '../../../server/src//utils/auth';
// import memoryAdapter from "pouchdb-adapter-memory"
// import cookieParser from 'cookie-parser';
// import jwt from 'jsonwebtoken';
import Class from "./class";
import Domain from './domain';
import { Trigger } from "./trigger";
// import AbstractClass from '../../shared/src//utils/stack/class';
import Attribute from './attribute';
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
class DocStack extends EventTarget {
    async addStack(config) {
        let stack;
        if (typeof config == "object" && config.name) {
            stack = await ClientStack.create(`db-${config.name}`, {
                // defaults to leveldb
                // adapter: 'memory', 
                plugins: [
                // https://www.npmjs.com/package/pouchdb-adapter-memory
                // memoryAdapter
                ]
            });
        }
        else if (typeof config === "string") {
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
            let window_ = window;
            if (window_.stacks) {
                window_.stacks.push(stack);
            }
            return stack;
        }
        // await setupAdminUser();
    }
    async resetAll() {
        try {
            for (const stack of this.stacks) {
                await stack.reset();
            }
        }
        catch (e) {
            throw new Error(e);
        }
    }
    getStacks() {
        return this.stacks;
    }
    getReadyState() {
        return this.readyState;
    }
    async reset() {
        try {
            await this.resetAll();
            await this.initStacks(this.config);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    constructor(...config) {
        super();
        //private app: Express;
        // private dbName: string;
        this.config = [];
        this.stacks = [];
        this.logger = createlogger().child({ module: "client" });
        this.initStacks = async (configs) => {
            for (const config of configs) {
                const stack = await this.addStack(config);
            }
            this.readyState = true;
            this.dispatchEvent(new CustomEvent("ready", {
                detail: {
                    stacks: this.stacks
                }
            }));
        };
        this.getStack = (name) => {
            return this.stacks.find(s => s.name == name || s.connection == name);
        };
        this.clearConnection = async (conn) => {
            const fnLogger = this.logger.child({ method: 'clearConnection' });
            try {
                // const conn = req.params.conn;
                if (!conn) {
                    throw new Error("Connection name not provided");
                }
                await ClientStack.clear(conn);
                fnLogger.info('Internal database cleared');
                // return res.status(200).json({ success: true, message: 'Internal database cleared' });
            }
            catch (e) {
                throw new Error(e);
                // return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        };
        this.export = async (stackName) => {
            const stack = this.getStack(stackName);
            if (stack) {
                const dump = await stack.dump();
                return dump;
            }
            else {
                throw new Error(`Did not find any stack for name '${stackName}'`);
            }
        };
        this.createClass = async (name, config) => {
            const fnLogger = this.logger.child({ method: 'createClass' });
            const { type, description } = config;
            fnLogger.info("Args", {
                name, config
            });
            try {
                const newClass = await Class.create(this.store, name, "class", description, {});
                fnLogger.info(`class '${name}' created successfully.`, { classModel: newClass.getModel() });
            }
            catch (e) {
                throw new Error(`Error during class '${name} creation. ${e}`);
            }
            fnLogger.info('Class created successfully');
        };
        this.createAttribute = async (className, params) => {
            const fnLogger = this.logger.child({ method: 'createAttribute' });
            const { name, type, description, config } = params;
            fnLogger.info(`Creating attribute for class '${className}'`, {
                name, type, config
            });
            try {
                // Loads the class object
                let classObj = await this.store.getClass(className);
                if (classObj) {
                    let newAttribute = await Attribute.create(classObj, name, type, description, config);
                    fnLogger.info(`Attribute '${name}' added to class '${className}'`, { attributeModel: newAttribute.getModel() });
                }
                else {
                    throw new Error(`Failed to retrieve Class '${className}'`);
                }
            }
            catch (e) {
                fnLogger.error(`Error during attribute '${name}' creation: ${e}`);
                throw new Error(`Error during attribute '${name}' creation: ${e}`);
            }
        };
        //this.dbName = (config && config.dbName) ? config.dbName : "docstack";
        // this.app = express();
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
}
export { ClientStack, Trigger, Class, Attribute, Domain };
export { DocStack };
//# sourceMappingURL=index.js.map