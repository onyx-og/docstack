import express, {Express} from 'express'
import { static as exStatic } from 'express';
import * as dotenv from "dotenv";
import cors from "cors";
dotenv.config({ path: './.env' })
import getLogger, {logRequest} from "./utils/logger"
import test from './utils/dbManager/test';
import { generateJwtKeys, generatePswKeys } from './utils/crypto';
import Surfer from './utils/dbManager/Surfer';
import { login, JWTAuthPayload, setupAdminUser } from './utils/auth';
// import memoryAdapter from "pouchdb-adapter-memory"
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import Class from './utils/dbManager/Class';
import { setPatchCount } from './utils/dbManager/datamodel';
import Attribute from './utils/dbManager/Attribute';
import { EventEmitter } from 'node:events';

class CouchSurfer extends EventEmitter {
    private app: Express;
    private dbName: string;
    private readyState: boolean; 
    private surfer: Surfer;

    private async initInstance(dbName: string) {
        // TODO instead of fixed "db-test" allow the configuration of "test" part
        const surfer = await Surfer.create(`db-${dbName}`, {
            // defaults to leveldb
            // adapter: 'memory', 
            plugins: [
            // https://www.npmjs.com/package/pouchdb-adapter-memory
            // memoryAdapter
            ]
        });
        this.surfer = surfer;
        globalThis.surfer = this.surfer;
        await setupAdminUser();
        this.readyState = true;
        this.emit('ready') // TODO: consider wether to provide args
    }

    async resetDb() {
        try {
            await this.surfer.reset();
        } catch (e) {
            throw new Error(e);
        }
    }

    public getSurfer() {
        return this.surfer;
    }

    public getReadyState() {
        return this.readyState;
    }
    async reset() {
        try {
            await this.resetDb();
            await this.initInstance(this.dbName);
        } catch (e) {
            throw new Error(e); 
        }
    }

    constructor(config?: {
        dbName: string;
    }) {
        super();
        this.dbName = (config && config.dbName) ? config.dbName : "couchsurfer";
        const logger = getLogger().child({module: "express"})
        this.app = express();
        this.readyState = false;

        this.app.use(logRequest)
        // Enable CORS for all routes
        if (process.env.NODE_ENV === 'development') {
            this.app.use(cors({
                origin: 'http://localhost:8080',
                // Replace with the origin of webpack dev server
                methods: ['GET', 'POST'], 
                credentials: true,
            }));
        }
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
                    const UserSessionClass = await this.surfer.getClass("UserSession");
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

        // TODO: Serve the dashboard to a specific route, i.e.: admin 
        // this.app.use(exStatic('./dist'));

        // TODO: Serve the static files from the build folder
        // of the UI application
        // this.app.get('*', (req, res) => {
        //     const templatePath = resolve(__dirname, './dist', 'index.html');
        //     res.sendFile(templatePath);
        // });

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

        this.app.get('/api/private/reset', async (req, res) => {
            try {
                await this.reset();
                return res.status(200).json({ success: true, message: 'Internal database reset' });
            } catch (e) {
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        });

        this.app.get('/api/private/clear:conn', async (req, res) => {
            try {
                const conn = req.params.conn;
                if (!conn) {
                    throw new Error("Connection name not provided");
                }
                await Surfer.clear(conn);
                return res.status(200).json({ success: true, message: 'Internal database cleared' });
            } catch (e) {
                logger.error("Error during database clear", e);
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
        });

        this.app.get('/api/private/test', (req, res) => {
            return res.status(200).json({ message: 'Hello from the server! This is a private route' });
        });

        this.app.post('/api/private/create-class/:name', async (req, res) => {
            const { name } = req.params;
            const { type, description } = req.query;
            logger.info("create-class - received request", {
                params: req.params,
                query: req.query
            })

            try {
                const newClass = await Class.create(
                    this.surfer, name, type as string, description as string
                );
                logger.info("create-class", `class '${name}' created successfully.`,
                    {classModel: newClass.getModel()}
                )
            } catch (e) {
                logger.error(`Error during class '${name} creation`, e);
                return res.status(500).json({ success: false, error: 'An error occurred' });
            }
            
            return res.status(200).json({ success: true, message: 'Class created successfully' });
        })

        this.app.put('/api/private/create-attribute/:name', async (req, res) => {
            const className = req.params.name;
            const { name, type, config } = req.body;
            logger.info(`create-attribute - for class '${className}'`, {
                name, type, config
            });

            try {
                // Loads the class object
                let classObj = await this.surfer.getClass(className);
                let newAttribute = await Attribute.create(classObj, name, type, config);
                logger.info(`create-attribute - Attribute '${name}' added to class '${className}'`, 
                    {attributeModel: newAttribute.getModel()}
                );
            } catch (e) {
                logger.error(`Error during attribute '${name}' creation`, e)
            }
        })

        // const port = process.env.SERVER_PORT || 5000;

        // const server = this.app.listen(port, () => logger.info(`Listening on port ${port}`));

        // Procedure that should run once only
        // can be considered "setup procedures"
        generatePswKeys()
        generateJwtKeys()

        // Server "startup procedures"
        setPatchCount()
        // setTimeout(test, 1000)
        this.initInstance(this.dbName)
        this.on("ready", () => logger.info("CouchSurfer successfully initialized"))
    }

    public getApp() {
        return this.app;
    }
}

export { Surfer, Class, Attribute, getLogger }
export {CouchSurfer};
