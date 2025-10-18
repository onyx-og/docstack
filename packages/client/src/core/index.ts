import PouchDB from "pouchdb";
import createLogger from "../utils/logger";
import Class from "./class";
import Domain from "./domain";
import { decryptString } from "../utils/crypto";
import { importJsonFile, countPatches } from "./datamodel";
import {
    Stack,
    StackOptions,
    CachedClass,
    ClassModelPropagationStart,
    ClassModelPropagationComplete,
    isClassModel,
    CachedDomain,
    DomainModel
} from "@docstack/shared";


import {SystemDoc, Patch, ClassModel, Document, AttributeModel, AttributeTypeDecimal, 
    AttributeTypeForeignKey, 
    AttributeTypeInteger,
    AttributeTypeString} from "@docstack/shared";
import { StackPlugin } from "../plugins/pouchdb";
import { domain } from "zod/v4/core/regexes.cjs";

const logger = createLogger().child({module: "stack"});

export const BASE_SCHEMA: ClassModel["schema"] = {
    "_id": { name: "_id", type: "string", config: { maxLength: 100, primaryKey: true } },
    "type": { name: "type", type: "string", config: { maxLength: 100 } },
    "createTimestamp": { name: "createTimestamp", type: "integer", config: { min: 0 } },
    "updateTimestamp": { name: "updateTimestamp", type: "integer", config: { min: 0 } },
    "description": { name: "description", type: "string", config: { maxLength: 1000 } },
    "active": { name: "active", type: "boolean", config: { defaultValue: true , primaryKey: true } }
}
export const CLASS_SCHEMA: ClassModel["schema"] = {
    ...BASE_SCHEMA,
    "type": { name: "type", type: "string", config: { defaultValue: "class"} },
    "schema": { name: "schema", type: "object", config: { maxLength: 1000, isArray: false }},
    "parentClass": { name: "parentClass", type: "foreign_key", config: { isArray: false } },
}
const DOMAIN_SCHEMA: ClassModel["schema"] = {
    ...BASE_SCHEMA,
    "type": { name: "type", type: "string", config: { defaultValue: "domain"} },
    "schema": { name: "schema", type: "object", config: { 
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
    }},
    // "parentDomain": { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
    "relation": { name: "relation", type: "enum", config: { isArray: false, values: [
        {value: "1:1"}, {value: "1:N"}, {value: "N:1"}, {value: "N:N"}
    ] } },
    "sourceClass": { name: "sourceClass", type: "foreign_key", config: { isArray: true } },
    "targetClass": { name: "targetClass", type: "foreign_key", config: { isArray: true } },
};
class ClientStack extends Stack {
    /* Initialized asynchronously */
    db!: PouchDB.Database<{}>;
    name!: string;
    /* Retrieved asynchronously */
    lastDocId!: number;
    /* Populated on async constructor */
    connection!: string;
    options?: StackOptions;
    appVersion: string = "0.0.1";
    /* Used to retrieve faster data */
    cache: {
        [className: string]: CachedClass | CachedDomain
    }
    patchCount!: number;

    listeners: PouchDB.Core.Changes<{}>[] = [];

    modelWorker: Worker | null = null;
    schemaVersion: string | undefined;
    patches: Patch[] = [];

    private constructor() {
        super();
        // Private constructor to prevent direct instantiation
        this.cache = {}
    }

    private async initialize(conn: string, options?: StackOptions) {
        // Store the connection string and options
        this.connection = conn;
        this.options = options;
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
        
        let Find: typeof import('pouchdb-find') =( await import('pouchdb-find')).default;


        // Load default plugins
        PouchDB.plugin(Find);
        PouchDB.plugin(StackPlugin(this));
        // Validation plugin
        if (options?.plugins) {
            for (let plugin of options.plugins) {
                PouchDB.plugin(plugin);
            }
        }
        this.db = new PouchDB(conn);
        this.cache = {
            // empty at init
        }
    }

    public getDb() {
        return this.db
    }

    public async getDbInfo() {
        return this.db.info();
    }

    public getDbName() {
        return this.db.name;
    }

    public dump = async () => {
        const all = await this.db.allDocs({include_docs: true});
        return all;
    }

    // asynchronous factory method
    public static async create(conn: string, options?: StackOptions): Promise<ClientStack> {
        const store = new ClientStack();
        await store.initialize(conn, options);
        await store.initdb()
        return store;
    }
    
    async getLastDocId() {
        let lastDocId = 0;
        try {
            let doc: { value: number, [key:string]: string | number} = await this.db.get("lastDocId");
            lastDocId = doc.value;
        } catch (e: any) {
            if (e.name === 'not_found') {
                logger.info("getLastDocId - not found. Must be first initialization.")
                return lastDocId
            }
            logger.error("checkdb - something went wrong", {"error": e});
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
            logger.error("getSystem - something went wrong", {"error": e});
            throw new Error(e);
        }
    }

    // TODO Parametrize the URL in a way that during the build procedure
    // it get substituted with the correct path for the build configuration
    private async loadPatches(): Promise<Patch[]> {
        let __patchDir = "patch"
        if (process.env.BUILDING) __patchDir = "patch"
        // [TODO] Load patches from files located in utils/dbManager/patch
        try {
            let patchCount = Number(this.patchCount);
            logger.info(`loadPatches - preparing to load ${patchCount} patches`);
            let patches = await Promise.all(
                Array.from({ length: patchCount }).map(
                  (_, index) => {
                    var _index = `${index}`.padStart(3, '0')
                    var importFilePath = `${__patchDir}/patch-${_index}.json`
                    logger.info("loadPatches - loading patch from path", {path: importFilePath})
                    return importJsonFile(importFilePath)
                    // return import(importFilePath)
                  },
                ),
            )
            patches = patches.map( (patch) => {
                logger.info("loadPatches - Parsing patch", {patch})
                return patch;
            })
            logger.info("loadPatches - Successfully loaded patches");
            logger.info("loadPatches - patches", {patches})
            return patches;
        } catch (e: any) {
            logger.error("loadPatches - something went wrong", e)
            throw new Error(e);
        }
    }

    // TODO: Consider storing applied patches in a Class like "Patch"
    // this would help keeping track of the application date of patches
    // and eventually provide a better way to discern which patch to apply or not
    private async applyPatch(patch: Patch): Promise<string> {
        try {
            logger.info("applyPatch - attempting to apply patch", {patch})
            await this.db.bulkDocs(patch.docs);
            logger.info("applyPatch - Successfully applied patch", {version: patch.version});
            return patch.version;
        } catch (e: any) {
            logger.error("applyPatch - something went wrong", e)
            throw new Error(e);
        }
    }

    private async applyPatches(schemaVersion: string | undefined): Promise<string> {
        let _schemaVersion = schemaVersion;
        try {
            this.patchCount = countPatches();
            const allPatches = await this.loadPatches();
            this.patches = allPatches;
            // When schemaVersion is undefined uses index 0 (start from first)
            // or start from the index after the patch at which the system is at 
            const startingIndex = schemaVersion ? (allPatches.findIndex(patch => patch.version === schemaVersion)+1)
                : 0;
            logger.info(`applyPatches - Starting to apply patches from index ${startingIndex}`)
            if (startingIndex === -1 || startingIndex === allPatches.length) {
                logger.info("applyPatches - No patches to apply");
                this.schemaVersion = schemaVersion;
                return schemaVersion!; // [TODO] Error prone
            }
            let patches = allPatches.slice(startingIndex);
            for (let patch of patches) {
                _schemaVersion = await this.applyPatch(patch);
            }
            logger.info("applyPatches - Successfully applied patches till version", {version: _schemaVersion});
            this.schemaVersion = _schemaVersion;
            return _schemaVersion!; // [TODO] Error prone
        } catch (e: any) {
            logger.error("applyPatches - something went wrong", e);
            throw new Error(e);
        }
    }

    // Method that verifies wether the system information are updated
    // applies patches too
    // TODO: Test if works corrrectly with multiple patch files
    async checkSystem() {
        let systemDoc = await this.getSystem();
        let _systemDoc: SystemDoc;
        const dbInfo = await this.getDbInfo();
        logger.info("checkSystem - current system doc", {system: systemDoc})
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
            _systemDoc.schemaVersion = schemaVersion;
        } else {
            logger.info("checkSystem - system doc already exists. Checking for updates", systemDoc)
            // apply patches if needed
            let schemaVersion = await this.applyPatches(systemDoc.schemaVersion);
            _systemDoc = { ...systemDoc,
                appVersion: this.appVersion,
                dbInfo: dbInfo,
                schemaVersion: schemaVersion,
                startupTime: (new Date()).valueOf()
            }
        }
        // Update systemDoc
        try {
            await this.db.put(_systemDoc);

        } catch(e: any) {
            logger.error("checkSystem - There was a problem while updating system", {error: e})
            throw new Error(e)
        }
        logger.info("checkSystem - updated system", {system: _systemDoc})
    }

    setListeners = () => {
        const fnLogger = logger.child({method: "setListeners"});

        // Listening for class model propagation
        this.addEventListener('class-model-propagation-pending', this.onClassModelPropagationStart as EventListener);
        this.addEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete as EventListener);

        fnLogger.info("Setting up class model worker");
        this.modelWorker = new Worker(require("../workers/dataModel"), {type: "module"});

        fnLogger.info("Setting up class model changes listener");
        const classModelChanges = this.onClassModelChanges();

        this.modelWorker.onmessage = (event) => {
            const { status, className, message } = event.data;
            
            this.dispatchEvent(new CustomEvent('class-model-propagation-complete', {
                detail: { className: className, success: status === 'success', message }
            }));

            if (status === 'error') {
                fnLogger.error(`Model worker error for class '${className}': ${message}`);
            }
        };

        // Store listener for later
        this.listeners.push(classModelChanges);
    }

    /**
     * @description Clears all listeners from the Stack
     */
    removeAllListeners = () => {
        this.removeEventListener('class-model-propagation-pending', this.onClassModelPropagationStart as EventListener);
        this.removeEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete as EventListener);
        this.listeners = [];
    }

    /**
     * @description When a class model propagation starts write the ~lock document to the database.
     * It prevents any further modifications on the class data model
     * @param event
     */
    onClassModelPropagationStart = (event: CustomEvent<ClassModelPropagationStart>) => {
        const className = event.detail.className;
        const fnLogger = logger.child({method: "onClassModelPropagationStart", className});
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
        const fnLogger = logger.child({method: "onClassModelPropagationComplete", args: {event}});
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
        const fnLogger = logger.child({listener: "classModelChanges"});

        const classModelChanges = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true,
            filter: (doc) => {
                return doc.type == "class";
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
                return doc.type == "~lock" && doc._id == `~lock-propagation-${className}`;
            }
        });
        this.listeners.push(classLockListener);
        return classLockListener;
    }

    addClassLock = async (className: string) => {
        const fnLogger = logger.child({method: "addClassLock", args: {className}});
        try {
            const existing = await this.db.get(`~lock-propagation-${className}`);
            let _rev: string | undefined = undefined;
            if (existing) {
                _rev = existing._rev;
            }
            const response = await this.db.put({
                _id: `~lock-propagation-${className}`,
                type: `~Lock`,
                _rev
            });
            fnLogger.info(`Adding class lock response`, {response});
            return response.ok;
        } catch (e: any) {
            fnLogger.error(`Error while adding class lock: ${e}`);
            return false;
        }
    }

    clearClassLock = async (className: string) => {
        const fnLogger = logger.child({method: "clearClassLock", args: {className}});
        try {
            const doc = await this.db.get(`~lock-propagation-${className}`);
            fnLogger.info(`Fetched class lock`, {document: doc});
            const response = await this.db.remove(doc);
            fnLogger.info(`Removing class lock response`, {response});
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
                return doc.type == className;
            }
        });
        this.listeners.push(onClassDocListener);
        return onClassDocListener;
    }

    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb () {
        await this.initIndex();
        await this.checkSystem();
        this.setListeners();
        return this;
    }

    close = () => {
        this.removeAllListeners();
        if (this.modelWorker) this.modelWorker.terminate();
    }

    // TODO: Make the caching time configurable, and implement regular cleaning of cache
    getClass = async (className: string, fresh =  false): Promise<Class | null> => {
        const fnLogger = logger.child({method: "getDomain", args: {className, fresh}});
        if (!fresh) {
            // Check if class is in cache and not expired
            if (this.cache[className] && Date.now() < this.cache[className].ttl) {
                fnLogger.info("Retrieving class from cache", {ttl: this.cache[className].ttl})
                return this.cache[className] as Class;
            }
        }
        
        const classObj = await Class.fetch(this, className);
        if (classObj) {
            (classObj as CachedClass).ttl = Date.now() + 60000 * 15; // 15 minutes expiration
            this.cache[className] = classObj as CachedClass;
        }
        return classObj;
    }

    getDomain = async (domainName: string, fresh =  false): Promise<Domain | null> => {
        const fnLogger = logger.child({method: "getDomain", args: {domainName, fresh}});
        if (!fresh) {
            if (this.cache[domainName] && Date.now() < this.cache[domainName].ttl) {
                fnLogger.info("Retrieving domain from cache", {ttl: this.cache[domainName].ttl});
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

    async initIndex () {
        try {
            let lastDocId: number = await this.getLastDocId();
            // logger.info("initdb - res", res)
            if (!lastDocId) {
                lastDocId = Number(lastDocId);
                // logger.info("initdb - initializing db")
                let response = await this.db.put({
                    _id: "lastDocId",
                    value: ++lastDocId
                });
                if (response.ok) this.lastDocId = lastDocId;
                else throw new Error("Got problem while putting doc"+ response);
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

    // TODO: Consider filtering returned properties
    async getDocument(docId: string) {
        let doc: PouchDB.Core.ExistingDocument<{}> | undefined = undefined;
        try {
            doc = await this.db.get(docId);
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

    // Expects a selector like { type: { $eq: "class" } }
    findDocuments = async ( selector: {[key: string]: any}, fields?: string[], skip?: number, limit?: number ) => {
        const fnLogger = logger.child({method: "findDocuments", args: {selector, fields, skip, limit}});

        // By default request for only active documents
        if (!selector.hasOwnProperty("active")) {
            selector["active"] = true;
        }

        let indexFields = Object.keys(selector);
        fnLogger.info("Produced index fields from selector", {indexFields});

        let result: {
            docs: Document[],
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
    
            let foundResult = await this.db.find({
                selector: selector,
                fields: fields,
                skip: skip,
                limit: limit
            });
    
            fnLogger.info("Found", {
                result: foundResult,
                selector: selector,
            });
            result = { docs: foundResult.docs as unknown as Document[], selector, skip, limit };
            return result;
        } catch (e: any) {
            fnLogger.error("findDocument - error",e);
            return {docs: [], error: e.toString(),selector, skip, limit};
        }
    }

    async findDocument( selector: any, fields = undefined, skip = undefined, limit = undefined ) {
        let result = await this.findDocuments(selector, fields, skip, limit);
        return result.docs.length > 0 ? result.docs[0] : null;
    }

    // TODO: Understand why most classes are empty of attributes
    getClassModel = async ( className: string ) => {
        let selector = {
            type: { $eq: "class" },
            name: { $eq: className }
        };

        try {
            let response = await this.findDocument(selector);
            if (response == null) return null;
            let result: ClassModel = response as ClassModel
            logger.info("getClassModel - result", {result: result})
            return result;
        } catch(e: any) {
            logger.info("getClassModel - error", e)
            throw new Error(e)
        }
    }

    getDomainModel = async ( domainName: string ) => {
        let selector = {
            type: { $eq: "domain" },
            name: { $eq: domainName }
        };

        try {
            let response = await this.findDocument(selector);
            if (response == null) return null;
            let result: DomainModel = response as DomainModel
            logger.info("getDomainModel - result", {result: result})
            return result;
        } catch(e: any) {
            logger.info("getDomainModel - error", e)
            throw new Error(e)
        }
    }

    // TODO: move listener to stack field, for easier un-registering
    async getClassModels(conf: { listen?: boolean, filter?: string[], search?: string } = {}) {
        const {listen, filter, search} = conf;
        const selector: {[field: string]: object} = { type: { $eq: "class" } };
        if (Array.isArray(filter) && filter.length > 0) {
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
        const fields = ['_id', 'name', 'description', 'schema'];

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

        return {
            list: result,
            listener
        };
    }

    getClasses = async (conf: {filter?: string[], search?: string}) => {
        const classNames = conf.filter;
        const searchFilter = conf.search;
        const fnLogger = logger.child({ method: "getAllClasses" });
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
                debugger;
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
                    const evt = new CustomEvent("classListChange", {detail: classList});
                    this.dispatchEvent(evt);
                } else {
                    // remove from classList without altering the array reference
                    const idx = classList.findIndex(c => c.model._id === change.id);
                    if (idx !== -1) {
                        classList.splice(idx, 1);
                        const evt = new CustomEvent("classListChange", {detail: classList});
                        this.dispatchEvent(evt);
                    }
                }
            })
        }

        fnLogger.info("Completed inital classes build");

        return classList;
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
        const fnLogger = logger.child({method: "destroyDb"});
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
    static async clear (conn: string) {
        return new Promise ( (resolve, reject) => {
            try {
                let db = new PouchDB(conn)
                db.destroy(null, () => {
                    logger.info("clear - Destroyed db");
                    resolve(true);
                });
            } catch (e: any) {
                logger.error("clear - Error while destroying db"+e)
                reject(false)
            }
        })
    }

    addClass = async ( classObj: Class ) => {
        let classModel = classObj.getModel();
        logger.info("addClass - got class model", {classModel})
        let existingDoc = await this.getClassModel(classModel.name);
        if ( existingDoc == null ) {
            let resultDoc = await this.createDoc(classModel.name, 'class', CLASS_SCHEMA, classModel);
            logger.info("addClass - result", {result: resultDoc});
            // TODO: Consider creating a design doc for easier filtering
            return resultDoc as ClassModel;
        } else {
            return existingDoc;
        } 
    }

    addDomain = async ( domainObj: Domain ) => {
        let domainModel = domainObj.getModel();
        logger.info("addDomain - got domain model", {domainModel})
        let existingDoc = await this.getDomainModel(domainModel.name);
        if ( existingDoc == null ) {
            let resultDoc = await this.createDoc(domainModel.name, 'domain', DOMAIN_SCHEMA, domainModel);
            logger.info("addDomain - result", {result: resultDoc});
            // TODO: Consider creating a design doc for easier filtering
            return resultDoc as DomainModel;
        } else {
            return existingDoc;
        } 
    }

    updateClass = async (classObj: Class) => {
        // logger.info("updateClass - classObj", classObj)
        let result = await this.createDoc(classObj.getId()!, 'class', classObj, classObj.getModel());
        logger.info("updateClass - result", result)
        return result
    }

    addDesignDocumentPKs = async (className: string, pKs: string[], temp = false) => {
        const fnLogger = logger.child({method: 'addDesignDocumentPKs', args: {className, pKs}});
         // Construct the compound key string dynamically
        const keyString = pKs.map(key => `doc.${key}`).join(', ');

        // The 'map' function as a string
        const mapCode = `function (doc) {
            const hasAllKeys = ${pKs.map(key => `doc.${key}`).join(' && ')};
            if (hasAllKeys && doc.type === '${className}') {
            emit([${keyString}], doc._id);
            }
        }`;
        fnLogger.info("Generated map code", {code: mapCode});

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
        fnLogger.info("Prepared design document", {ddoc});

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

    // async updateDomain(domainObj: Domain) {
    //     return this.createDoc(domainObj.getId(), domainObj, domainObj.getModel());
    // }

    // You have an object and array of AttributeModels,
    // therefore each element of the array has an attribute name,
    // a type and a configuration
    // Based on the configuration apply various checks on the given object's
    // value at the corresponding attribute name

    // [TODO] Implement also for attributes of type different from string
    // [TODO] Implement primary key check for combination of attributes and not just one
    async validateObject(obj: any, type: string, schema: ClassModel["schema"]): Promise<boolean> {
        logger.info("validateObject - given args", {obj, schema})
        let isValid = true;
        try {
            // schema.forEach(async model => {
            for (let model of Object.values(schema)) {
                let value = obj[model.name];
                logger.info("validateObject - model", {model, value})
                // Check if the property exists
                if (value === undefined && model.config.mandatory) {
                    let message = `Property ${model.name} does not exist on the object.`
                    logger.error(message);
                    throw new Error(message);
                }
    
                if ( !model.config.mandatory && value === undefined ) {
                    let message = `Property ${model.name} is not mandatory and does not exist on the object. Skipping validation of this attribute`
                    logger.info(message);
                    continue;
                }
    
                // update object's value to the default value
                if (model.config.defaultValue && value === undefined) {
                    logger.info(`Property ${model.name} is missing, setting to default value.`);
                    obj[model.name] = model.config.defaultValue;
                    value = obj[model.name];
                }
            
                switch(model.type) {
                    case 'string':
                        if (!model.config.isArray && typeof value !== model.type) {
                            logger.info(`Property ${model.name} is not of type ${model.type}.`);
                            return false
                        } else if (model.config.isArray && !Array.isArray(value)) {
                            logger.info(`Property ${model.name} is not an array.`);
                            return false
                        }
                        if (model.config as AttributeTypeString["config"]) {
                            if  (model.config.maxLength && value.length > model.config.maxLength) {
                                logger.info(`Property ${model.name} is longer than ${model.config.maxLength} characters.`);
                                return false
                            }
    
                            if (model.config.encrypted) {
                                // Check if incoming string is encrypted
                                let decryptedString = decryptString(value);
                                console.log("decryptedString", decryptedString)
                                if (decryptedString === null) {
                                    logger.info(`Property ${model.name} is not encrypted correctly.`);
                                    return false
                                }
                            }
    
                            if (model.config.primaryKey) {
                                logger.info("primaryKey check", {type, model, value})
                                // Check if the value is unique
                                let duplicates = await this.findDocuments({
                                    "type": { $eq: type },
                                    [model.name]: { $eq: value }
                                });
                                if (duplicates.docs.length > 0) {
                                    logger.info(`A card with property ${model.name} already exists.`, duplicates);
                                    throw new Error(`A card with property ${model.name} already exists.`);
                                }
                            }
                        } 
                    break;
                    case 'decimal':
                        // TODO: decide how to interpret decimal
                        if (model.config as AttributeTypeDecimal["config"] ) {
                            if (model.config.min && value < model.config.min) {
                                logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                                return false
                            }
                            if (model.config.max && value > model.config.max) {
                                logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                                return false
                            }
                        }
    
                    break;
                    case 'integer':
                        if (!model.config.isArray && typeof value !== 'number') {
                            logger.info(`Property ${model.name} is not of type ${model.type}.`);
                        } else if (model.config.isArray && (
                                !Array.isArray(value) || !value.every((v) => typeof v === 'number')
                            )){
                            logger.info(`Property ${model.name} is not an array.`);
                            return false
                        }
                        if (model.config as AttributeTypeInteger["config"] ) {
                            if (model.config.min && value < model.config.min) {
                                logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                                return false
                            }
                            if (model.config.max && value > model.config.max) {
                                logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                                return false
                            }
                        }
    
                    break;
                    case "foreign_key":
                        model.config as AttributeTypeForeignKey["config"]
                        // check if foreign key corresponds to an existing document
                        let foreignKeyDoc = await this.getDocument(value);
                        if (foreignKeyDoc == null) {
                            logger.info(`Foreign key ${value} does not exist.`);
                            return false
                        }
                    break;
                    /*
                    case "reference":
                        model.config as AttributeTypeReference["config"]
                        var domain = await this.getDomain(model.config.domain)
                        if (domain == null) {
                            logger.info(`Reference domain ${model.config.domain} does not exist.`);
                            return false
                        }
                        // check if the reference it points to exists
                        let reference = await this.getDocument(value)
                        if (reference == null) {
                            logger.info(`Reference ${value} does not exist.`);
                            return false
                        }
                        switch (domain.relationType) {
                            case "one-to-one":
                                // check if the reference is unique
                                // based on the position of the reference
                                var selector = {
                                    type: { $eq: domain.name },
                                    [model.config.position]: { $eq: value }
                                }
                                var result = await this.findDocument(selector)
                                if (result) {
                                    logger.info(`Reference ${value} is not unique.`);
                                    return false
                                }
                            break;
                            case "one-to-many":
                                // check if the reference is unique
                                // based on the position of the reference
                                var selector = {
                                    type: { $eq: domain.name },
                                    [model.config.position]: { $eq: value }
                                    
                                }
                                var result = await this.findDocument(selector)
                                if (result) {
                                    logger.info(`Reference ${value} is not unique.`);
                                    return false
                                }
                                break;
                        }
    
                    break;
                    */
                    case "object":
                        logger.info("Missing json validation. Skipping for now.");
                    break;
                    default:
                        throw new Error("Unexpected type received")
                }
            }
        } catch (e: any) {
            logger.info("validateObject - error", e)
            return false;
        }
        
        logger.info("validateObject - result", {type, result: isValid})
        return isValid;
    }

    validateObjectByType = async (obj: any, type: string, schema?: ClassModel["schema"]) => {
        const fnLogger = logger.child({method: "validateObjectByType", args: {obj, type, schema}});
        let schema_: ClassModel["schema"] = {}
        
        switch (type) {
        case "class":
            schema_ = CLASS_SCHEMA;
            break;
        case "domain":
            schema_ = DOMAIN_SCHEMA;
            break;
        default:
            if (!schema) {
                try {
                    const classDoc = await this.getClassModel(type) as ClassModel;
                    schema_ = classDoc.schema;
                } catch (e: any) {
                    // if 404 validation failed because of missing class
                    fnLogger.error(`Failed because of error: ${e}`)
                    return false;
                }
            }
        }
        if (schema_) return await this.validateObject(obj, type, schema_);
        else throw new Error(`Unable to retrieve schema to validate object against`);
    }

    prepareDoc (_id: string, type: string, params: {[key: string] : string | number | boolean}) {
        logger.info("prepareDoc - given args", {_id: _id, type: type, params: params});
        params["_id"] = _id;
        params["type"] = type;
        params["createTimestamp"] = new Date().getTime();
        params["active"] = true;
        logger.info("prepareDoc - after elaborations", {params} );
        return params;
    }

    createDoc = async (docId: string | null, type: string, classObj: Class | ClassModel["schema"], params: {}) => {
        let schema: ClassModel["schema"] = {};
        if (classObj instanceof Class) {
            schema = classObj.buildSchema();
        } else {
            schema = classObj;
        }
        // [TODO] Custom triggers goes here
        logger.info("createDoc - args", {docId, type, params, schema});
        let db = this.db,
            doc: Document | null = null,
            isNewDoc = false;
        try {
            // let validationRes = await this.validateObjectByType(params, type, schema);
            // if  (!validationRes) {
            //     throw new Error("createDoc - Invalid object")
            // }
            if (docId) {
                const existingDoc = await this.getDocument(docId) as unknown as Document;
                logger.info("retrieved doc", {existingDoc})
                if (existingDoc && existingDoc.type === type) {
                    logger.info("createDoc - assigning existing doc", {doc: existingDoc});
                    doc = {...existingDoc};
                } else if (existingDoc && existingDoc.type !== type) {
                    throw new Error("createDoc - Existing document type differs");
                } else {
                    isNewDoc = true;
                    doc = this.prepareDoc(docId, type, params) as Document;
                }
            } else {
                docId = `${type}-${(this.lastDocId+1)}`;
                doc = this.prepareDoc(docId, type, params) as Document;
                isNewDoc = true;
                logger.info("createDoc - generated docId", docId);
            }
            logger.info("createDoc - doc BEFORE elaboration (i.e. merge)", {doc, params});
            const doc_ = {...doc, ...params, _id: docId, _rev: doc._rev, updateTimestamp: new Date().getTime()};
            logger.info("createDoc - doc AFTER elaboration (i.e. merge)", {doc_})
            let response = await db.put(doc_);
            logger.info("createDoc - Response after put",{"response": response});
            if (response.ok && isNewDoc) {
                this.incrementLastDocId();
                // let uploadedDoc = await db.get(response.id);
                // logger.info({"doc": uploadedDoc}, "createDoc - Uploaded doc")
                docId = response.id;
                // create relations if needed
                // logger.info("createDoc - schema detail", {schema})
                /*
                for (const attributeModel of schema) {
                    if (attributeModel.type === "reference") {
                        let referenceAttr = new ReferenceAttribute(classObj, attributeModel.name, attributeModel.config as AttributeTypeReference["config"]);
                        await this.createRelationFromRef(referenceAttr, doc);
                    }
                } */
            }
            else if (response.ok) {
                docId = response.id;
            }
            else {
                throw new Error("createDoc - error:"+response.ok)
            }
        } catch (e: any) {
            if (e.name === 'conflict') {
                logger.info("createDoc - conflict! Ignoring..")
                // try {
                //     let error_response = await db.get(docId).then((_doc) => {   
                //         doc = Object.assign(_doc, doc);
                //         doc.updateTimestamp = new Date().getTime();
                //         doc._rev = _doc._rev;
                //         return db.put(doc);
                //     })
                //     logger.info("createDoc - Response after conflict put",{"response": error_response});
                // } catch (e) {
                //     logger.info("another error",e)
                // }
                
                // conflict!
              } else {
                logger.info("createDoc - Problem while putting doc", {
                    "error": e,
                    "document": doc
                })
                throw new Error("createDoc - Problem while putting doc"+e);
            }
        }
        // Note that doc don't contain the _rev field. This approach enforce the use of 
        // retreiving the document from the database to get the _rev field
        return doc;
    }

    /**
     * Sets the active param of a document to false
     * @param _id 
     * @returns Promise<boolean>
     */
    deleteDocument = async (_id: string): Promise<boolean> => {
        const fnLogger = logger.child({method: "deleteDocument", args: {_id}});
        const doc = await this.db.get(_id);
        if (doc) {
            try {
                await this.db.put({...doc, active: false});
                return true;
            } catch (e: any) {
                fnLogger.error(`Error while deleting document: ${e}`,{document: doc});
                return false;
            }
        } else {
            fnLogger.error("Found no document with given id");
            return false;
        }
    }

    /*
    async createRelationFromRef (referenceAttr: ReferenceAttribute, doc: Document) {
        let refValue = doc[referenceAttr.name];
        let domain = await this.getDomain(referenceAttr.domain);
        let referenceDoc = await this.getDocument(refValue) as Document;
        let refClassName = referenceDoc.type;

        let sourceClass: string = "", targetClass: string = "";
        let sourceId: string = "", targetId: string = "";
        if (domain.targetClass.includes(doc.type)) {
            targetClass = doc.type;
        }
        if (domain.sourceClass.includes(doc.type)) {
            targetClass = doc.type;
        }
        if (referenceAttr.position === "source") {
            if (domain.targetClass.includes(doc.type)) {
                targetClass = doc.type;
            }
            if (domain.sourceClass.includes(refClassName)) {
                sourceClass = refClassName;
            }
            sourceId = doc._id;
            targetId = refValue;
        } else if (referenceAttr.position === "target") {
            if (domain.sourceClass.includes(doc.type)) {
                sourceClass = doc.type;
            }
            if (domain.targetClass.includes(refClassName)) {
                targetClass = refClassName;
            }
            sourceId = refValue;
            targetId = doc._id;
        }
        let params = {
            source: sourceId,
            target: targetId,
            sourceClass: sourceClass,
            targetClass: targetClass,
        }

        return this.createDoc(null, domain, params);
    } */
}



export default ClientStack