import NodePouchDB from "pouchdb-node";
import getLogger from "../../../utils/logger/";
import Class, { ClassModel } from "../Class";
// import Domain, { DomainModel } from "../Domain";
import { AttributeModel, AttributeTypeDecimal, 
    AttributeTypeForeignKey, 
    AttributeTypeInteger,
    AttributeTypeString
} from "../Attribute";
// import ReferenceAttribute, { AttributeTypeReference } from "../Reference";
import { decryptString } from "../../../utils/crypto";
import { importJsonFile } from "../datamodel";

const logger = getLogger().child({module: "Surfer"})

export const BASE_SCHEMA: AttributeModel[] = [
    { name: "_id", type: "string", config: { maxLength: 100 } },
    { name: "type", type: "string", config: { maxLength: 100 } },
    { name: "createTimestamp", type: "integer", config: { min: 0 } },
    { name: "updateTimestamp", type: "integer", config: { min: 0 } },
    { name: "description", type: "string", config: { maxLength: 1000 } }
]
export const CLASS_SCHEMA: (AttributeModel | {name: "schema", type: "attribute", config: {}})[] = [
    ...BASE_SCHEMA,
    { name: "schema", type: "attribute", config: { maxLength: 1000, isArray: true }},
    { name: "parentClass", type: "foreign_key", config: { isArray: false } },
]
const DOMAIN_SCHEMA: (AttributeModel | {name: "schema", type: "attribute", config: {}})[] = [
    { name: "schema", type: "attribute", config: { 
        isArray: true,
        defaultValue: [
            {
                name: "source",
                type: "foreign_key",
                config: {
                    isArray: false
                }
            },
            {
                name: "target",
                type: "foreign_key",
                config: {
                    isArray: false
                }
            }
        ]
    }},
    { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
    { name: "relation", type: "string", config: { maxLength: 100 , isArray: false } },
    { name: "sourceClass", type: "foreign_key", config: { isArray: true } },
    { name: "targetClass", type: "foreign_key", config: { isArray: true } },
    ...BASE_SCHEMA
]
export type Document = PouchDB.Core.ExistingDocument<{
    type: string;
    createTimestamp: number;
    updateTimestamp?: number | null;
    [key: string]: any
}>

// The idea is to make this patch object be processed
// storing the version of the patch and the documents contained in it
export interface Patch {
    version: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any
    }> | PouchDB.Core.Document<{[key: string]: any}>)[]
}

export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}

type SurferOptions = {
    plugins: PouchDB.Plugin[]
} & PouchDB.Configuration.DatabaseConfiguration 

type CachedClass = Class & {
    ttl: number
}

class Surfer {
    private db: PouchDB.Database<{}> = undefined;
    private lastDocId: number;
    private connection: string;
    private options: SurferOptions;
    private static appVersion: string = "0.0.1";
    private cache: {
        [className: string]: CachedClass
    }

    private constructor() {
        // Private constructor to prevent direct instantiation
    }

    private async initialize(conn: string, options?: SurferOptions) {
        // Store the connection string and options
        this.connection = conn;
        this.options = options;
        let PouchDB: typeof import('pouchdb-core');
        let Find: typeof import('pouchdb-find');

        if (typeof window !== 'undefined') {
            // Running in a browser
            PouchDB = (await import('pouchdb-browser')).default;
            Find = (await import('pouchdb-find')).default;
        } else {
            // Running in Node.js
            PouchDB = (await import('pouchdb-node')).default;
            Find = (await import('pouchdb-find')).default;
        }

        // Load default plugins
        PouchDB.plugin(Find);
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

    // asynchronous factory method
    public static async create(conn: string, options?: SurferOptions): Promise<Surfer> {
        const surfer = new Surfer();
        await surfer.initialize(conn, options);
        await surfer.initdb()
        return surfer;
    }
    
    async getLastDocId() {
        let lastDocId = 0;
        try {
            let doc: { value: number, [key:string]: string | number} = await this.db.get("lastDocId");
            lastDocId = doc.value;
        } catch (e) {
            if (e.name === 'not_found') {
                logger.info("getLastDocId - not found", e)
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
        } catch (e) {
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
        let __patchDir = "../datamodel/patch"
        if (process.env.BUILDING) __patchDir = "patch"
        // [TODO] Load patches from files located in utils/dbManager/patch
        try {
            let patchCount = Number(process.env.PATCH_COUNT);
            logger.info(`loadPatches - preparing to load ${patchCount} patches`)
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
        } catch (e) {
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
        } catch (e) {
            logger.error("applyPatch - something went wrong", e)
            throw new Error(e);
        }
    }

    private async applyPatches(schemaVersion: string | undefined): Promise<string> {
        let _schemaVersion = schemaVersion;
        try {
            const allPatches = await this.loadPatches();
            // When schemaVersion is undefined uses index 0 (start from first)
            // or start from the index after the patch at which the system is at 
            const startingIndex = schemaVersion ? (allPatches.findIndex(patch => patch.version === schemaVersion)+1)
                : 0;
            logger.info(`applyPatches - Starting to apply patches from index ${startingIndex}`)
            if (startingIndex === -1 || startingIndex === allPatches.length) {
                logger.info("applyPatches - No patches to apply");
                return schemaVersion;
            }
            let patches = allPatches.slice(startingIndex);
            for (let patch of patches) {
                _schemaVersion = await this.applyPatch(patch);
            }
            logger.info("applyPatches - Successfully applied patches till version", {version: _schemaVersion});
        } catch (e) {
            logger.error("applyPatches - something went wrong", e)
        }
        return _schemaVersion;
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
                appVersion: Surfer.appVersion,
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
                appVersion: Surfer.appVersion,
                dbInfo: dbInfo,
                schemaVersion: schemaVersion,
                startupTime: (new Date()).valueOf()
            }
        }
        // Update systemDoc
        try {
            await this.db.put(_systemDoc);

        } catch(e) {
            logger.error("checkSystem - There was a problem while updating system", {error: e})
            throw new Error(e)
        }
        logger.info("checkSystem - updated system", {system: _systemDoc})
    }

    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb () {
        await this.initIndex();
        await this.checkSystem();
        return this;
    }

    // TODO: Make the caching time configurable, and implement regular cleaning of cache
    async getClass(className: string) {
        // Check if class is in cache and not expired
        if (this.cache[className] && Date.now() < this.cache[className].ttl) {
            logger.info("getClass -  retrieving class from cache", {ttl: this.cache[className].ttl})
            return this.cache[className];
        }
        const classObj = await Class.fetch(this, className);
        (classObj as CachedClass).ttl = Date.now() + 60000 // 1 minute expiration
        this.cache[className]
        return classObj;
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
        } catch (e) {
            logger.error("initdb -  something went wrong", e)
            throw new Error("initdb -  something went wrong"+e);
        }
    }

    // static async build( that: Surfer ) {
    //     let result = await that.initdb();
    //     return result;
    // }

    // TODO: Consider filtering returned properties
    async getDocument(docId: string) {
        let doc: PouchDB.Core.ExistingDocument<{}> | undefined = undefined;
        try {
            doc = await this.db.get(docId);
        } catch (e) {
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
            _rev = doc._rev;
        } catch (e) {
            logger.info("getDocRevision - error", e)
            throw new Error(e);
        }
        return _rev;
    }

    // Expects a selector like { type: { $eq: "class" } }
    async findDocuments( selector: any, fields = undefined, skip = undefined, limit = undefined ) {
        let indexFields = Object.keys(selector);
        let result: {
            docs: (PouchDB.Core.ExistingDocument<{}>)[] | undefined[],
            [key: string]: any
        } = {
            docs: []
        }
        try {
            let indexResult = await this.db.createIndex({
                index: { fields: indexFields }
            });
    
            let foundResult = await this.db.find({
                selector: selector,
                fields: fields,
                skip: skip,
                limit: limit
            });
    
            logger.info("findDocument - found", {
                result: foundResult,
                selector: selector,
            });
            result = { docs: foundResult.docs, selector, skip, limit };
            return result;
        } catch (e) {
            logger.info("findDocument - error",e);
            return {docs: [], error: e.toString(),selector, skip, limit};
        }
    }

    async findDocument( selector: any, fields = undefined, skip = undefined, limit = undefined ) {
        let result = await this.findDocuments(selector, fields, skip, limit);
        return result.docs.length > 0 ? result.docs[0] : null;
    }

    // TODO: Understand why most classes are empty of attributes
    async getClassModel( className: string ) {
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
        } catch(e) {
            logger.info("getClassModel - error", e)
            throw new Error(e)
        }
    }

    /*
    async getDomainModel( domainName: string ) {
        let selector = {
            type: { $eq: "domain" },
            name: { $eq: domainName }
        }

        let response = await this.findDocument(selector)
        let result: DomainModel = response as DomainModel
        logger.info("getDomainModel - result", {result})
        return result;
    } */

    async getAllClassModels() {
        let selector = {
            type: { $eq: "class" }
        };
        let fields = ['_id', 'name', 'description'];

        let response = await this.findDocuments(selector, fields);
        let result: ClassModel[] = response.docs as ClassModel[];
        return result;
    }

    async getClassModels( classNames: string[] ) {
        let allClasses = await this.getAllClassModels();
        // TODO: Consider directly querying while applying the filter
        // let selector = {
        //     type: { $eq: "class" },
        //     $or: [ _id: { $eq: className}]
        // };
        let result = allClasses.filter( classObj => classNames.includes(classObj.name) );
        return result;
    }

    async incrementLastDocId() {
        let docId = "lastDocId",
            _rev = await this.getDocRevision(docId);
        await this.db.put({
            _id: "lastDocId",
            _rev: _rev,
            value: ++this.lastDocId
        });
        return this.lastDocId;
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
        return new Promise ( (resolve, reject) => {
            try {
                this.db.destroy(null, () => {
                    logger.info("reset - Destroyed db");
                    resolve(true);
                });
            } catch (e) {
                logger.error("reset - Error while destroying db"+e)
                reject(false)
            }
        })
    }

    // This method is similar to destroyDb, but intended to be called from the client (not to destroy the main db)
    // TODO: Right now this allows to clear any db
    // there should be more restrictions
    static async clear (conn: string) {
        return new Promise ( (resolve, reject) => {
            try {
                let db = new NodePouchDB(conn)
                db.destroy(null, () => {
                    logger.info("clear - Destroyed db");
                    resolve(true);
                });
            } catch (e) {
                logger.error("clear - Error while destroying db"+e)
                reject(false)
            }
        })
    }

    async addClass( classObj: Class ) {
        let classModel = classObj.getModel();
        logger.info("addClass - got class model", {classModel})
        let existingDoc = await this.getClassModel(classModel.name);
        if ( existingDoc == null ) {
            let resultDoc = await this.createDoc(classModel.name, 'class', classObj, classModel);
            logger.info("addClass - result", {result: resultDoc})
            return resultDoc as ClassModel;
        } else {
            return existingDoc;
        } 
    }

    // async addDomain( domainObj: Domain ) {
    //     let domainModel = domainObj.getModel();
    //     let existingDoc = await this.getDomainModel(domainModel.name);
    //     if ( existingDoc == null ) {
    //         let resultDoc = await this.createDoc(domainModel.name, domainObj, domainModel);
    //         logger.info("addClass - result", resultDoc)
    //         return resultDoc as DomainModel;
    //     } else {
    //         return existingDoc;
    //     }
    // }

    async updateClass(classObj: Class) {
        // logger.info("updateClass - classObj", classObj)
        let result = await this.createDoc(classObj.getId(), 'class', classObj, classObj.getModel());
        logger.info("updateClass - result", result)
        return result
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
    async validateObject(obj: any, type: string, attributeModels: AttributeModel[]): Promise<boolean> {
        logger.info("validateObject - given args", {obj: obj, attributeModels: attributeModels})
        let isValid = true;
        try {
            // attributeModels.forEach(async model => {
            for (let model of attributeModels) {
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
                                })
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
                    default:
                        logger.info("Probably an attribute? Huh", model)
                }
            }
        } catch (e) {
            logger.info("validateObject - error", e)
            return false;
        }
        
        logger.info("validateObject - result", {type, result: isValid})
        return isValid;
    }

    async validateObjectByType (obj: any, type: string, schema?: ClassModel["schema"]) {
        logger.info("validateObjectByType - given args", {obj, type, schema})
        let schema_: AttributeModel[] = [];
        
        switch (type) {
        case "class":
            schema_ = CLASS_SCHEMA as AttributeModel[];
            break;
        case "domain":
            schema_ = DOMAIN_SCHEMA as AttributeModel[]
            break;
        default:
            if (!schema) {
                try {
                    const classDoc = await this.getClassModel(type) as ClassModel;
                    schema_ = classDoc.schema;
                } catch (e) {
                    // if 404 validation failed because of missing class
                    logger.info("validateObjectByType - failed because of error",e)
                    return false;
                }
            }
        }
        
        return await this.validateObject(obj, type, schema_);
    }

    prepareDoc (_id: string, type: string, params: object) {
        logger.info("prepareDoc - given args", {_id: _id, type: type, params: params});
        params["_id"] = _id;
        params["type"] = type;
        params["createTimestamp"] = new Date().getTime();
        logger.info("prepareDoc - after elaborations", {params} );
        return params;
    }

    async createDoc(docId: string, type: string,classObj: Class, params) {
        let schema = classObj.buildSchema();
        logger.info("createDoc - args", {docId, type, params, schema});
        let db = this.db,
            doc: Document,
            isNewDoc = false;
        try {
            let validationRes = await this.validateObjectByType(params, type, schema);
            if  (!validationRes) {
                throw new Error("createDoc - Invalid object")
            }
            if (docId) {
                const existingDoc = await this.getDocument(docId) as Document;
                logger.info("retrieved doc", {existingDoc})
                if (existingDoc && existingDoc.type === type) {
                    logger.info("createDoc - assigning existing doc");
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
            const doc_ = {...doc, ...params, _id: docId, updateTimestamp: new Date().getTime()};
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
        } catch (e) {
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

export default Surfer