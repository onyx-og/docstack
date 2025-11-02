import PouchDB from "pouchdb";
import createLogger from "../utils/logger";
import Class from "./class";
import Domain from "./domain";
import { decryptString } from "../utils/crypto";
import { getAllSystemPatches, getSystemPatches } from "./datamodel";
import { Stack, isClassModel, } from "@docstack/shared";
import { StackPlugin } from "../plugins/pouchdb";
const logger = createLogger().child({ module: "stack" });
export const BASE_SCHEMA = {
    "_id": { name: "_id", type: "string", config: { maxLength: 100, primaryKey: true } },
    "type": { name: "type", type: "string", config: { maxLength: 100 } },
    "createTimestamp": { name: "createTimestamp", type: "integer", config: { min: 0 } },
    "updateTimestamp": { name: "updateTimestamp", type: "integer", config: { min: 0 } },
    "description": { name: "description", type: "string", config: { maxLength: 1000 } },
    "active": { name: "active", type: "boolean", config: { defaultValue: true, primaryKey: true } }
};
export const CLASS_SCHEMA = Object.assign(Object.assign({}, BASE_SCHEMA), { "type": { name: "type", type: "string", config: { defaultValue: "class" } }, "schema": { name: "schema", type: "object", config: { maxLength: 1000, isArray: false } }, "parentClass": { name: "parentClass", type: "foreign_key", config: { isArray: false } } });
const DOMAIN_SCHEMA = Object.assign(Object.assign({}, BASE_SCHEMA), { "type": { name: "type", type: "string", config: { defaultValue: "domain" } }, "schema": { name: "schema", type: "object", config: {
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
        } }, 
    // "parentDomain": { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
    "relation": { name: "relation", type: "enum", config: { isArray: false, values: [
                { value: "1:1" }, { value: "1:N" }, { value: "N:1" }, { value: "N:N" }
            ] } }, "sourceClass": { name: "sourceClass", type: "foreign_key", config: { isArray: true } }, "targetClass": { name: "targetClass", type: "foreign_key", config: { isArray: true } } });
class ClientStack extends Stack {
    constructor() {
        super();
        this.appVersion = "0.0.1";
        this.patches = getAllSystemPatches();
        this.listeners = [];
        this.modelWorker = null;
        this.dump = async () => {
            const all = await this.db.allDocs({ include_docs: true });
            return all;
        };
        this.setListeners = () => {
            const fnLogger = logger.child({ method: "setListeners" });
            // Listening for class model propagation
            this.addEventListener('class-model-propagation-pending', this.onClassModelPropagationStart);
            this.addEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete);
            fnLogger.info("Setting up class model worker");
            this.modelWorker = new Worker(require("../workers/dataModel"), { type: "module" });
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
        };
        /**
         * @description Clears all listeners from the Stack
         */
        this.removeAllListeners = () => {
            this.removeEventListener('class-model-propagation-pending', this.onClassModelPropagationStart);
            this.removeEventListener('class-model-propagation-complete', this.onClassModelPropagationComplete);
            this.listeners = [];
        };
        /**
         * @description When a class model propagation starts write the ~lock document to the database.
         * It prevents any further modifications on the class data model
         * @param event
         */
        this.onClassModelPropagationStart = (event) => {
            const className = event.detail.className;
            const fnLogger = logger.child({ method: "onClassModelPropagationStart", className });
            this.addClassLock(className).then(() => {
                fnLogger.info(`Lock created successfully for class: '${className}'`);
            }).catch(error => {
                fnLogger.error(`Error creating lock for '${className}': ${error}`);
            });
        };
        /**
         * @description When a class model propagation comes to completion remove the corresponding
         * ~lock from the database
         * @param event
         */
        this.onClassModelPropagationComplete = (event) => {
            const fnLogger = logger.child({ method: "onClassModelPropagationComplete", args: { event } });
            const className = event.detail.className;
            this.clearClassLock(className).then(() => {
                fnLogger.info(`Lock removed successfully for class: '${className}'`);
            }).catch(error => {
                fnLogger.error(`Error removing lock for '${className}': ${error}`);
            });
            ;
        };
        /**
         * @returns PouchDB.Core.Changes<{}>
         */
        this.onClassModelChanges = () => {
            const fnLogger = logger.child({ listener: "classModelChanges" });
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
                }
                else if (doc && isClassModel(doc) && !doc.active) {
                    const className = doc.name;
                    fnLogger.info(`Class was deleted. Removing from '${className} from cache.'`);
                } // else
            });
            return classModelChanges;
        };
        this.onClassLock = (className) => {
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
        };
        this.addClassLock = async (className) => {
            const fnLogger = logger.child({ method: "addClassLock", args: { className } });
            try {
                const existing = await this.db.get(`~lock-propagation-${className}`);
                let _rev = undefined;
                if (existing) {
                    _rev = existing._rev;
                }
                const response = await this.db.put({
                    _id: `~lock-propagation-${className}`,
                    type: `~Lock`,
                    _rev
                });
                fnLogger.info(`Adding class lock response`, { response });
                return response.ok;
            }
            catch (e) {
                fnLogger.error(`Error while adding class lock: ${e}`);
                return false;
            }
        };
        this.clearClassLock = async (className) => {
            const fnLogger = logger.child({ method: "clearClassLock", args: { className } });
            try {
                const doc = await this.db.get(`~lock-propagation-${className}`);
                fnLogger.info(`Fetched class lock`, { document: doc });
                const response = await this.db.remove(doc);
                fnLogger.info(`Removing class lock response`, { response });
                return response.ok;
            }
            catch (e) {
                fnLogger.error(`Error while adding class lock: ${e}`);
                return false;
            }
        };
        this.onClassDoc = (className) => {
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
        };
        this.close = () => {
            this.removeAllListeners();
            if (this.modelWorker)
                this.modelWorker.terminate();
        };
        // TODO: Make the caching time configurable, and implement regular cleaning of cache
        this.getClass = async (className, fresh = false) => {
            const fnLogger = logger.child({ method: "getDomain", args: { className, fresh } });
            if (!fresh) {
                // Check if class is in cache and not expired
                if (this.cache[className] && Date.now() < this.cache[className].ttl) {
                    fnLogger.info("Retrieving class from cache", { ttl: this.cache[className].ttl });
                    return this.cache[className];
                }
            }
            const classObj = await Class.fetch(this, className);
            if (classObj) {
                classObj.ttl = Date.now() + 60000 * 15; // 15 minutes expiration
                this.cache[className] = classObj;
            }
            return classObj;
        };
        this.getDomain = async (domainName, fresh = false) => {
            const fnLogger = logger.child({ method: "getDomain", args: { domainName, fresh } });
            if (!fresh) {
                if (this.cache[domainName] && Date.now() < this.cache[domainName].ttl) {
                    fnLogger.info("Retrieving domain from cache", { ttl: this.cache[domainName].ttl });
                    return this.cache[domainName];
                }
            }
            const domainObj = await Domain.fetch(this, domainName);
            if (domainObj) {
                domainObj.ttl = Date.now() + 60000 * 15; // 15 minutes expiration
                this.cache[domainName] = domainObj;
            }
            return domainObj;
        };
        // Expects a selector like { type: { $eq: "class" } }
        this.findDocuments = async (selector, fields, skip, limit) => {
            const fnLogger = logger.child({ method: "findDocuments", args: { selector, fields, skip, limit } });
            // By default request for only active documents
            if (!selector.hasOwnProperty("active")) {
                selector["active"] = true;
            }
            let indexFields = Object.keys(selector);
            fnLogger.info("Produced index fields from selector", { indexFields });
            let result = {
                docs: []
            };
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
                result = { docs: foundResult.docs, selector, skip, limit };
                return result;
            }
            catch (e) {
                fnLogger.error("findDocument - error", e);
                return { docs: [], error: e.toString(), selector, skip, limit };
            }
        };
        // TODO: Understand why most classes are empty of attributes
        this.getClassModel = async (className) => {
            let selector = {
                type: { $eq: "class" },
                name: { $eq: className }
            };
            try {
                let response = await this.findDocument(selector);
                if (response == null)
                    return null;
                let result = response;
                logger.info("getClassModel - result", { result: result });
                return result;
            }
            catch (e) {
                logger.info("getClassModel - error", e);
                throw new Error(e);
            }
        };
        this.getDomainModel = async (domainName) => {
            let selector = {
                type: { $eq: "domain" },
                name: { $eq: domainName }
            };
            try {
                let response = await this.findDocument(selector);
                if (response == null)
                    return null;
                let result = response;
                logger.info("getDomainModel - result", { result: result });
                return result;
            }
            catch (e) {
                logger.info("getDomainModel - error", e);
                throw new Error(e);
            }
        };
        this.getClasses = async (conf) => {
            const classNames = conf.filter;
            const searchFilter = conf.search;
            const fnLogger = logger.child({ method: "getAllClasses" });
            fnLogger.info("Requesting");
            const { list: classModels, listener } = await this.getClassModels({
                listen: true, filter: classNames, search: searchFilter
            });
            fnLogger.info("Received class models", { classModels });
            const classList = [];
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
                        const classObj = await Class.buildFromModel(this, change.doc);
                        if (existingIndex === -1) {
                            classList.push(classObj);
                        }
                        else {
                            classList[existingIndex] = classObj;
                        }
                        const evt = new CustomEvent("classListChange", { detail: classList });
                        this.dispatchEvent(evt);
                    }
                    else {
                        // remove from classList without altering the array reference
                        const idx = classList.findIndex(c => c.model._id === change.id);
                        if (idx !== -1) {
                            classList.splice(idx, 1);
                            const evt = new CustomEvent("classListChange", { detail: classList });
                            this.dispatchEvent(evt);
                        }
                    }
                });
            }
            fnLogger.info("Completed inital classes build");
            return classList;
        };
        this.addClass = async (classObj) => {
            let classModel = classObj.getModel();
            logger.info("addClass - got class model", { classModel });
            let existingDoc = await this.getClassModel(classModel.name);
            if (existingDoc == null) {
                let resultDoc = await this.createDoc(classModel.name, 'class', CLASS_SCHEMA, classModel);
                logger.info("addClass - result", { result: resultDoc });
                // TODO: Consider creating a design doc for easier filtering
                return resultDoc;
            }
            else {
                return existingDoc;
            }
        };
        this.addDomain = async (domainObj) => {
            let domainModel = domainObj.getModel();
            logger.info("addDomain - got domain model", { domainModel });
            let existingDoc = await this.getDomainModel(domainModel.name);
            if (existingDoc == null) {
                let resultDoc = await this.createDoc(domainModel.name, 'domain', DOMAIN_SCHEMA, domainModel);
                logger.info("addDomain - result", { result: resultDoc });
                // TODO: Consider creating a design doc for easier filtering
                return resultDoc;
            }
            else {
                return existingDoc;
            }
        };
        this.updateClass = async (classObj) => {
            // logger.info("updateClass - classObj", classObj)
            let result = await this.createDoc(classObj.getId(), 'class', classObj, classObj.getModel());
            logger.info("updateClass - result", result);
            return result;
        };
        this.addDesignDocumentPKs = async (className, pKs, temp = false) => {
            const fnLogger = logger.child({ method: 'addDesignDocumentPKs', args: { className, pKs } });
            // Construct the compound key string dynamically
            const keyString = pKs.map(key => `doc.${key}`).join(', ');
            // The 'map' function as a string
            const mapCode = `function (doc) {
            const hasAllKeys = ${pKs.map(key => `doc.${key}`).join(' && ')};
            if (hasAllKeys && doc.type === '${className}') {
            emit([${keyString}], doc._id);
            }
        }`;
            fnLogger.info("Generated map code", { code: mapCode });
            let designDocId = `_design/${className}-group`;
            if (temp)
                designDocId = `_design/${className}-group-temp`;
            const ddoc = {
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
            }
            catch (err) {
                if (err.name === 'not_found') {
                    // Doc doesn't exist, create it
                    await this.db.put(ddoc);
                    fnLogger.info('Design document created successfully.');
                }
                else {
                    fnLogger.error('Error saving design document:', err);
                    throw err;
                }
            }
            return designDocId;
        };
        this.validateObjectByType = async (obj, type, schema) => {
            const fnLogger = logger.child({ method: "validateObjectByType", args: { obj, type, schema } });
            let schema_ = {};
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
                            const classDoc = await this.getClassModel(type);
                            schema_ = classDoc.schema;
                        }
                        catch (e) {
                            // if 404 validation failed because of missing class
                            fnLogger.error(`Failed because of error: ${e}`);
                            return false;
                        }
                    }
            }
            if (schema_)
                return await this.validateObject(obj, type, schema_);
            else
                throw new Error(`Unable to retrieve schema to validate object against`);
        };
        this.createDoc = async (docId, type, classObj, params) => {
            const fnLogger = logger.child({ method: "createDoc", args: { docId, type, params, classObj } });
            fnLogger.info("Creating document");
            let schema = {};
            if (classObj instanceof Class) {
                schema = classObj.buildSchema();
            }
            else {
                schema = classObj;
            }
            let db = this.db, doc = null, isNewDoc = false;
            try {
                if (docId) {
                    const existingDoc = await this.getDocument(docId);
                    fnLogger.info("Retrieved doc", { existingDoc });
                    if (existingDoc && existingDoc.type === type) {
                        fnLogger.info("Assigning existing doc", { doc: existingDoc });
                        doc = Object.assign({}, existingDoc);
                    }
                    else if (existingDoc && existingDoc.type !== type) {
                        fnLogger.error("Existing document type differs");
                        throw new Error("createDoc - Existing document type differs");
                    }
                    else {
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, type, params);
                    }
                }
                else {
                    docId = `${type}-${(this.lastDocId + 1)}`;
                    doc = this.prepareDoc(docId, type, params);
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, updateTimestamp: new Date().getTime() });
                fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                let response = await db.put(doc_);
                fnLogger.info("Response after put", { "response": response });
                if (response.ok && isNewDoc) {
                    this.incrementLastDocId();
                    docId = response.id;
                }
                else if (response.ok) {
                    docId = response.id;
                }
                else {
                    fnLogger.error("Error, check logs", { "response": response });
                    throw new Error("createDoc - Error, check logs");
                }
            }
            catch (e) {
                if (e.name === 'conflict') {
                    fnLogger.info("Conflict! Ignoring..");
                    // TODO: Handle conflict!
                }
                else {
                    fnLogger.info("Problem while putting doc", {
                        "error": e,
                        "document": doc
                    });
                    throw new Error("createDoc - Problem while putting doc" + e);
                }
            }
            return doc;
        };
        this.createDocs = async (docs, type, classObj) => {
            const fnLogger = logger.child({ method: "createDocs", args: { docs } });
            let schema = {};
            if (classObj instanceof Class) {
                schema = classObj.buildSchema();
            }
            else {
                schema = classObj;
            }
            fnLogger.info("Determined schema", { schema });
            let db = this.db;
            const documents = [];
            let newDocsIds = [];
            for (const draft of docs) {
                let { docId, params } = draft;
                let doc = null;
                let isNewDoc = false;
                try {
                    if (docId) {
                        const existingDoc = await this.getDocument(docId);
                        fnLogger.info("retrieved doc", { existingDoc });
                        if (existingDoc && existingDoc.type === type) {
                            fnLogger.info("createDocs - assigning existing doc", { doc: existingDoc });
                            doc = Object.assign({}, existingDoc);
                        }
                        else if (existingDoc && existingDoc.type !== type) {
                            throw new Error("createDocs - Existing document type differs");
                        }
                        else {
                            isNewDoc = true;
                            doc = this.prepareDoc(docId, type, params);
                        }
                    }
                    else {
                        docId = `${type}-${(this.lastDocId + 1)}`;
                        doc = this.prepareDoc(docId, type, params);
                        isNewDoc = true;
                        fnLogger.info("Generated docId", docId);
                    }
                    fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                    const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, updateTimestamp: new Date().getTime() });
                    fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                    documents.push(doc_);
                    if (isNewDoc)
                        newDocsIds.push(docId);
                }
                catch (e) {
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
            }
            catch (e) {
                fnLogger.error("createDocs - Problem while putting docs", {
                    "error": e,
                    "documents": documents
                });
                throw new Error("createDocs - Problem while putting docs" + e);
            }
            return documents;
        };
        this.createRelationDoc = async (docId, relationName, domainObj, params) => {
            const fnLogger = logger.child({ method: "createRelationDoc", args: { docId, relationName, params } });
            fnLogger.info("Creating relation document");
            let db = this.db, doc = null, isNewDoc = false;
            try {
                if (docId) {
                    const existingDoc = await this.db.get(docId);
                    fnLogger.info("retrieved doc", { existingDoc });
                    if (existingDoc && existingDoc.type === domainObj.name) {
                        fnLogger.info("Assigning existing doc", { doc: existingDoc });
                        doc = Object.assign({}, existingDoc);
                    }
                    else if (existingDoc && existingDoc.type !== domainObj.name) {
                        fnLogger.error("Existing document type differs");
                        throw new Error("createDoc - Existing document type differs");
                    }
                    else {
                        fnLogger.warn("No relation document");
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, domainObj.name, params);
                    }
                }
                else {
                    docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                    doc = this.prepareDoc(docId, domainObj.name, params);
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, updateTimestamp: new Date().getTime() });
                fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                let response = await db.put(doc_);
                fnLogger.info("Response after put", { "response": response });
                if (response.ok && isNewDoc) {
                    this.incrementLastDocId();
                    docId = response.id;
                }
                else if (response.ok) {
                    docId = response.id;
                }
                else {
                    fnLogger.error("Error, check logs", { "response": response });
                    throw new Error("createDoc - Error, check logs");
                }
            }
            catch (e) {
                fnLogger.error("Error while creating relation document", { error: e });
            }
            return doc;
        };
        this.createRelationDocs = async (docs, relationName, domainObj) => {
            const fnLogger = logger.child({ method: "createRelationDocs", args: { docs, relationName } });
            let db = this.db;
            const documents = [];
            let newDocsIds = [];
            for (const draft of docs) {
                let { docId, params } = draft;
                let doc = null;
                let isNewDoc = false;
                try {
                    if (docId) {
                        const existingDoc = await db.get(docId);
                        fnLogger.info("retrieved doc", { existingDoc });
                        if (existingDoc && existingDoc.type === domainObj.name) {
                            fnLogger.info("createRelationDocs - assigning existing doc", { doc: existingDoc });
                            doc = Object.assign({}, existingDoc);
                        }
                        else if (existingDoc && existingDoc.type !== domainObj.name) {
                            throw new Error("createRelationDocs - Existing document type differs");
                        }
                        else {
                            isNewDoc = true;
                            doc = this.prepareDoc(docId, domainObj.name, params);
                        }
                    }
                    else {
                        docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                        doc = this.prepareDoc(docId, domainObj.name, params);
                        isNewDoc = true;
                        fnLogger.info("Generated docId", docId);
                    }
                    fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                    const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, updateTimestamp: new Date().getTime() });
                    fnLogger.info("Doc AFTER elaboration (i.e. merge)", { doc_ });
                    documents.push(doc_);
                    if (isNewDoc)
                        newDocsIds.push(docId);
                }
                catch (e) {
                    fnLogger.error("createRelationDocs - Problem while preparing doc", {
                        "error": e,
                        "document": doc
                    });
                    throw new Error("createRelationDocs - Problem while preparing doc" + e);
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
            }
            catch (e) {
                fnLogger.error("createRelationDocs - Problem while putting docs", {
                    "error": e,
                    "documents": documents
                });
                throw new Error("createRelationDocs - Problem while putting docs" + e);
            }
            return documents;
        };
        /**
         * Sets the active param of a document to false
         * @param _id
         * @returns Promise<boolean>
         */
        this.deleteDocument = async (_id) => {
            const fnLogger = logger.child({ method: "deleteDocument", args: { _id } });
            const doc = await this.db.get(_id);
            if (doc) {
                try {
                    await this.db.put(Object.assign(Object.assign({}, doc), { active: false }));
                    return true;
                }
                catch (e) {
                    fnLogger.error(`Error while deleting document: ${e}`, { document: doc });
                    return false;
                }
            }
            else {
                fnLogger.error("Found no document with given id");
                return false;
            }
        };
        // Private constructor to prevent direct instantiation
        this.cache = {};
    }
    async initialize(conn, options) {
        // Store the connection string and options
        this.connection = conn;
        this.options = options;
        if (options === null || options === void 0 ? void 0 : options.name) {
            this.name = options === null || options === void 0 ? void 0 : options.name;
        }
        const connRegExp = /(?<=db-).*/;
        const match = conn.match(connRegExp);
        if (match) {
            this.name = match[0];
        }
        else {
            this.name = conn;
        }
        let Find = (await import('pouchdb-find')).default;
        // Load default plugins
        PouchDB.plugin(Find);
        PouchDB.plugin(StackPlugin(this));
        // Validation plugin
        if (options === null || options === void 0 ? void 0 : options.plugins) {
            for (let plugin of options.plugins) {
                PouchDB.plugin(plugin);
            }
        }
        this.db = new PouchDB(conn);
        this.cache = {
        // empty at init
        };
    }
    getDb() {
        return this.db;
    }
    async getDbInfo() {
        return this.db.info();
    }
    getDbName() {
        return this.db.name;
    }
    // asynchronous factory method
    static async create(conn, options) {
        const store = new ClientStack();
        await store.initialize(conn, options);
        await store.initdb();
        return store;
    }
    async getLastDocId() {
        let lastDocId = 0;
        try {
            let doc = await this.db.get("lastDocId");
            lastDocId = doc.value;
        }
        catch (e) {
            if (e.name === 'not_found') {
                logger.info("getLastDocId - not found. Must be first initialization.");
                return lastDocId;
            }
            logger.error("checkdb - something went wrong", { "error": e });
        }
        return lastDocId;
    }
    async getSystem() {
        try {
            let doc = await this.db.get("~system");
            return doc;
        }
        catch (e) {
            if (e.name === 'not_found') {
                logger.info("get System - not found", e);
                return null;
            }
            logger.error("getSystem - something went wrong", { "error": e });
            throw new Error(e);
        }
    }
    async loadPatches(schemaVersion) {
        const fnLogger = logger.child({ method: "loadPatches" });
        try {
            fnLogger.info("loadPatches - loading patches");
            const patches = getSystemPatches(schemaVersion || "0.0.0");
            fnLogger.info(`loadPatches - loaded ${patches.length} patches`, { patches });
            return patches;
        }
        catch (e) {
            fnLogger.error("loadPatches - something went wrong", e);
            throw new Error(e);
        }
    }
    async applyPatch(patch) {
        const fnLogger = logger.child({ method: "applyPatch", args: { patch } });
        try {
            fnLogger.info("Attempting to apply patch", { patch });
            const hydratedDocs = await Promise.all(patch.docs.map(async (doc) => {
                if (doc._rev === "auto") {
                    delete doc._rev;
                    const existingDoc = await this.db.get(doc._id);
                    if (existingDoc) {
                        doc._rev = existingDoc._rev;
                    }
                }
                return doc;
            }));
            await this.db.bulkDocs(hydratedDocs);
            fnLogger.info("Successfully applied patch", { version: patch.version });
            return patch.version;
        }
        catch (e) {
            fnLogger.error("Something went wrong", e);
            throw new Error(e);
        }
    }
    async applyPatches(schemaVersion) {
        const fnLogger = logger.child({ method: "applyPatches", args: { schemaVersion } });
        let _schemaVersion = schemaVersion;
        try {
            const patches = await this.loadPatches(_schemaVersion);
            for (let patch of patches) {
                _schemaVersion = await this.applyPatch(patch);
            }
            if (_schemaVersion) {
                fnLogger.info("Successfully applied patches till version", { version: _schemaVersion });
                this.schemaVersion = _schemaVersion;
                return _schemaVersion;
            }
            else {
                fnLogger.info("No patches were provided or applied");
                throw new Error("applyPatches - No patches were provided or applied");
            }
        }
        catch (e) {
            fnLogger.error("Something went wrong", e);
            throw new Error(e);
        }
    }
    // Method that verifies wether the system information are updated
    // applies patches too
    // TODO: Test if works corrrectly with multiple patch files
    async checkSystem() {
        let systemDoc = await this.getSystem();
        let _systemDoc;
        const dbInfo = await this.getDbInfo();
        logger.info("checkSystem - current system doc", { system: systemDoc });
        if (!systemDoc) {
            _systemDoc = {
                _id: "~system",
                appVersion: this.appVersion,
                dbInfo: dbInfo,
                schemaVersion: undefined,
                startupTime: (new Date()).valueOf()
            };
            // schemaVersion will be added after applying patches
            let schemaVersion = await this.applyPatches(_systemDoc.schemaVersion);
            _systemDoc.schemaVersion = schemaVersion;
        }
        else {
            logger.info("checkSystem - system doc already exists. Checking for updates", systemDoc);
            // apply patches if needed
            let schemaVersion = await this.applyPatches(systemDoc.schemaVersion);
            _systemDoc = Object.assign(Object.assign({}, systemDoc), { appVersion: this.appVersion, dbInfo: dbInfo, schemaVersion: schemaVersion, startupTime: (new Date()).valueOf() });
        }
        // Update systemDoc
        try {
            await this.db.put(_systemDoc);
        }
        catch (e) {
            logger.error("checkSystem - There was a problem while updating system", { error: e });
            throw new Error(e);
        }
        logger.info("checkSystem - updated system", { system: _systemDoc });
    }
    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb() {
        await this.initIndex();
        await this.checkSystem();
        this.setListeners();
        return this;
    }
    async initIndex() {
        try {
            let lastDocId = await this.getLastDocId();
            // logger.info("initdb - res", res)
            if (!lastDocId) {
                lastDocId = Number(lastDocId);
                // logger.info("initdb - initializing db")
                let response = await this.db.put({
                    _id: "lastDocId",
                    value: ++lastDocId
                });
                if (response.ok)
                    this.lastDocId = lastDocId;
                else
                    throw new Error("Got problem while putting doc" + response);
            }
            else {
                logger.info("initdb - db already initialized, consider purge");
            }
            this.lastDocId = Number(lastDocId);
        }
        catch (e) {
            logger.error("initdb -  something went wrong", e);
            throw new Error(e);
        }
    }
    // static async build( that: ClientStack ) {
    //     let result = await that.initdb();
    //     return result;
    // }
    // TODO: Consider filtering returned properties
    async getDocument(docId) {
        let doc = undefined;
        try {
            doc = await this.db.get(docId);
        }
        catch (e) {
            if (e.name === 'not_found') {
                logger.info("getDocument - not found", e);
                return null;
            }
            logger.info("getDocument - error", e);
            throw new Error(e);
        }
        return doc;
    }
    async getDocRevision(docId) {
        let _rev = null;
        try {
            let doc = await this.getDocument(docId);
            if (doc)
                _rev = doc._rev;
        }
        catch (e) {
            logger.info("getDocRevision - error", e);
            throw new Error(e);
        }
        return _rev;
    }
    async findDocument(selector, fields = undefined, skip = undefined, limit = undefined) {
        let result = await this.findDocuments(selector, fields, skip, limit);
        return result.docs.length > 0 ? result.docs[0] : null;
    }
    // TODO: move listener to stack field, for easier un-registering
    async getClassModels(conf = {}) {
        const { listen, filter, search } = conf;
        const selector = { type: { $eq: "class" } };
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
        const result = response.docs;
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
    async incrementLastDocId() {
        let docId = "lastDocId", _rev = await this.getDocRevision(docId);
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
        await this.initialize(this.connection, this.options);
        await this.initdb();
        return this;
    }
    async destroyDb() {
        const fnLogger = logger.child({ method: "destroyDb" });
        try {
            this.db.destroy(null, () => {
                fnLogger.info("Destroyed db");
                return true;
            });
        }
        catch (e) {
            fnLogger.error(`Error while destroying db: ${e}`);
            return false;
        }
    }
    // This method is similar to destroyDb, but intended to be called from the client (not to destroy the main db)
    // TODO: Right now this allows to clear any db
    // there should be more restrictions
    static async clear(conn) {
        return new Promise((resolve, reject) => {
            try {
                let db = new PouchDB(conn);
                db.destroy(null, () => {
                    logger.info("clear - Destroyed db");
                    resolve(true);
                });
            }
            catch (e) {
                logger.error("clear - Error while destroying db" + e);
                reject(false);
            }
        });
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
    async validateObject(obj, type, schema) {
        logger.info("validateObject - given args", { obj, schema });
        let isValid = true;
        try {
            // schema.forEach(async model => {
            for (let model of Object.values(schema)) {
                let value = obj[model.name];
                logger.info("validateObject - model", { model, value });
                // Check if the property exists
                if (value === undefined && model.config.mandatory) {
                    let message = `Property ${model.name} does not exist on the object.`;
                    logger.error(message);
                    throw new Error(message);
                }
                if (!model.config.mandatory && value === undefined) {
                    let message = `Property ${model.name} is not mandatory and does not exist on the object. Skipping validation of this attribute`;
                    logger.info(message);
                    continue;
                }
                // update object's value to the default value
                if (model.config.defaultValue && value === undefined) {
                    logger.info(`Property ${model.name} is missing, setting to default value.`);
                    obj[model.name] = model.config.defaultValue;
                    value = obj[model.name];
                }
                switch (model.type) {
                    case 'string':
                        if (!model.config.isArray && typeof value !== model.type) {
                            logger.info(`Property ${model.name} is not of type ${model.type}.`);
                            return false;
                        }
                        else if (model.config.isArray && !Array.isArray(value)) {
                            logger.info(`Property ${model.name} is not an array.`);
                            return false;
                        }
                        if (model.config) {
                            if (model.config.maxLength && value.length > model.config.maxLength) {
                                logger.info(`Property ${model.name} is longer than ${model.config.maxLength} characters.`);
                                return false;
                            }
                            if (model.config.encrypted) {
                                // Check if incoming string is encrypted
                                let decryptedString = decryptString(value);
                                console.log("decryptedString", decryptedString);
                                if (decryptedString === null) {
                                    logger.info(`Property ${model.name} is not encrypted correctly.`);
                                    return false;
                                }
                            }
                            if (model.config.primaryKey) {
                                logger.info("primaryKey check", { type, model, value });
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
                        if (model.config) {
                            if (model.config.min && value < model.config.min) {
                                logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                                return false;
                            }
                            if (model.config.max && value > model.config.max) {
                                logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                                return false;
                            }
                        }
                        break;
                    case 'integer':
                        if (!model.config.isArray && typeof value !== 'number') {
                            logger.info(`Property ${model.name} is not of type ${model.type}.`);
                        }
                        else if (model.config.isArray && (!Array.isArray(value) || !value.every((v) => typeof v === 'number'))) {
                            logger.info(`Property ${model.name} is not an array.`);
                            return false;
                        }
                        if (model.config) {
                            if (model.config.min && value < model.config.min) {
                                logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                                return false;
                            }
                            if (model.config.max && value > model.config.max) {
                                logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                                return false;
                            }
                        }
                        break;
                    case "foreign_key":
                        model.config;
                        // check if foreign key corresponds to an existing document
                        let foreignKeyDoc = await this.getDocument(value);
                        if (foreignKeyDoc == null) {
                            logger.info(`Foreign key ${value} does not exist.`);
                            return false;
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
                        throw new Error("Unexpected type received");
                }
            }
        }
        catch (e) {
            logger.info("validateObject - error", e);
            return false;
        }
        logger.info("validateObject - result", { type, result: isValid });
        return isValid;
    }
    prepareDoc(_id, type, params) {
        logger.info("prepareDoc - given args", { _id: _id, type: type, params: params });
        params["_id"] = _id;
        params["type"] = type;
        params["createTimestamp"] = new Date().getTime();
        params["active"] = true;
        logger.info("prepareDoc - after elaborations", { params });
        return params;
    }
}
export default ClientStack;
//# sourceMappingURL=stack.js.map