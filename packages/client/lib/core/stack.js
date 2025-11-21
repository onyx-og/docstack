import PouchDB from "pouchdb";
import createLogger from "../utils/logger";
import Class from "./class";
import Domain from "./domain";
import { getAllSystemPatches, getSystemPatches } from "./datamodel";
import { Stack, isClassModel, } from "@docstack/shared";
import { StackPlugin } from "../plugins/pouchdb";
import { parse, createPlan, executePlan } from "./query-engine";
const logger = createLogger().child({ module: "stack" });
export const BASE_SCHEMA = {
    "_id": { name: "_id", type: "string", config: { maxLength: 100, primaryKey: true } },
    "~class": { name: "~class", type: "string", config: { maxLength: 100 } },
    "~createTimestamp": { name: "~createTimestamp", type: "integer", config: { min: 0 } },
    "~updateTimestamp": { name: "~updateTimestamp", type: "integer", config: { min: 0 } },
    "description": { name: "description", type: "string", config: { maxLength: 1000 } },
    "active": { name: "active", type: "boolean", config: { defaultValue: true, primaryKey: true } }
};
export const CLASS_SCHEMA = Object.assign(Object.assign({}, BASE_SCHEMA), { "~class": { name: "~class", type: "string", config: { defaultValue: "class" } }, "schema": { name: "schema", type: "object", config: { maxLength: 1000, isArray: false } }, "parentClass": { name: "parentClass", type: "foreign_key", config: { isArray: false } } });
const DOMAIN_SCHEMA = Object.assign(Object.assign({}, BASE_SCHEMA), { "~class": { name: "~class", type: "string", config: { defaultValue: "domain" } }, "schema": { name: "schema", type: "object", config: {
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
                    return doc["~class"] == "~lock" && doc._id == `~lock-propagation-${className}`;
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
                "~class": `~Lock`,
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
                    return doc["~class"] == className;
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
            const fnLogger = logger.child({ method: "getClass", args: { className, fresh } });
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
        this.getClassModel = async (className) => {
            // TODO: understand whether to use name of _id field
            let selector = {
                type: { $in: ["class", "~self"] },
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
        // TODO: move listener to stack field, for easier un-registering
        // TODO: Change into getClass("Class").getCards()
        this.getClassModels = async (conf = {}) => {
            const { listen, filter, search } = conf;
            const selector = { type: { $eq: "class" } };
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
            const fields = ['_id', 'name', 'description', 'schema', 'type', '_rev'];
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
        };
        this.getClasses = async (conf) => {
            const classNames = conf.filter;
            const searchFilter = conf.search;
            const fnLogger = logger.child({ method: "getClasses" });
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
        this.getDomainModels = async (conf = {}) => {
            const { listen, filter, search } = conf;
            const selector = { type: { $eq: "domain" } };
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
            const fields = ['_id', 'name', 'description', 'schema', 'type', '_rev'];
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
        };
        this.getDomains = async (conf) => {
            const classNames = conf.filter;
            const searchFilter = conf.search;
            const fnLogger = logger.child({ method: "getDomains" });
            fnLogger.info("Requesting");
            const { list: domainModels, listener } = await this.getDomainModels({
                listen: true, filter: classNames, search: searchFilter
            });
            fnLogger.info("Received class models", { domainModels });
            const domainList = [];
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
                        const domain = await Domain.buildFromModel(this, change.doc);
                        if (existingIndex === -1) {
                            domainList.push(domain);
                        }
                        else {
                            domainList[existingIndex] = domain;
                        }
                        const evt = new CustomEvent("classListChange", { detail: domainList });
                        this.dispatchEvent(evt);
                    }
                    else {
                        // remove from classList without altering the array reference
                        const idx = domainList.findIndex(c => c.model._id === change.id);
                        if (idx !== -1) {
                            domainList.splice(idx, 1);
                            const evt = new CustomEvent("domainListChange", { detail: domainList });
                            this.dispatchEvent(evt);
                        }
                    }
                });
            }
            fnLogger.info("Completed inital domains build");
            return domainList;
        };
        this.addClass = async (classObj) => {
            const fnLogger = logger.child({ method: "addClass", args: { class: classObj.name } });
            const classOrigin = await this.getClass(classObj.type);
            if (classOrigin == null) {
                fnLogger.error("Class originator not found", { classType: classObj.type });
                throw new Error(`Class originator ${classObj.type} not found in stack`);
            }
            let classModel = classObj.getModel();
            fnLogger.info("Got class model", { classModel });
            try {
                const result = await classOrigin.addCard(classModel);
                return result;
            }
            catch (e) {
                fnLogger.error("Error adding class card", { error: e });
                throw new Error("Failed to add class card");
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
        };
        this.addDomain = async (domainObj) => {
            const fnLogger = logger.child({ method: "addDomain", args: { domain: domainObj.name } });
            let domainModel = domainObj.getModel();
            fnLogger.info("Got domain model", { domainModel });
            let existingDoc = await this.getDomainModel(domainModel.name);
            if (existingDoc == null) {
                let resultDoc = await this.createDoc(domainModel.name, 'domain', DOMAIN_SCHEMA, domainModel);
                fnLogger.info("Result", { result: resultDoc });
                // TODO: Consider creating a design doc for easier filtering
                return resultDoc;
            }
            else {
                return existingDoc;
            }
        };
        this.updateClass = async (classObj) => {
            const fnLogger = logger.child({ method: "updateClass", args: { class: classObj.name } });
            let result = await this.createDoc(classObj.getId(), 'class', classObj, classObj.getModel());
            fnLogger.info("Result", result);
            return result;
        };
        this.addDesignDocumentPKs = async (className, pKs, temp = false) => {
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
        this.createDoc = async (docId, type, classObj, params) => {
            const fnLogger = logger.child({ method: "createDoc", args: { docId, type, params } });
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
                let newDocId = `${type}-${(this.lastDocId + 1)}`;
                if (docId) {
                    const existingDoc = await this.getDocument(docId);
                    fnLogger.info("Retrieved doc", { existingDoc });
                    if (existingDoc && existingDoc["~class"] === type) {
                        fnLogger.info("Assigning existing doc", { doc: existingDoc });
                        doc = Object.assign({}, existingDoc);
                    }
                    else if (existingDoc && existingDoc["~class"] !== type) {
                        fnLogger.error("Existing document type differs");
                        throw new Error("createDoc - Existing document type differs");
                    }
                    else {
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, type, params);
                    }
                }
                else {
                    doc = this.prepareDoc(newDocId, type, params);
                    isNewDoc = true;
                    fnLogger.info("Generated docId", { newDocId });
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId || newDocId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
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
                        if (existingDoc && existingDoc["~class"] === type) {
                            fnLogger.info("createDocs - assigning existing doc", { doc: existingDoc });
                            doc = Object.assign({}, existingDoc);
                        }
                        else if (existingDoc && existingDoc["~class"] !== type) {
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
                    const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
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
                    if (existingDoc && existingDoc["~domain"] === domainObj.name) {
                        fnLogger.info("Assigning existing doc", { doc: existingDoc });
                        doc = Object.assign({}, existingDoc);
                    }
                    else if (existingDoc && existingDoc["~domain"] !== domainObj.name) {
                        fnLogger.error("Existing document type differs");
                        throw new Error("createDoc - Existing document type differs");
                    }
                    else {
                        fnLogger.warn("No relation document");
                        isNewDoc = true;
                        doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                    }
                }
                else {
                    docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                    doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                    isNewDoc = true;
                    fnLogger.info("Generated docId", docId);
                }
                fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
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
                        if (existingDoc && existingDoc["~domain"] === domainObj.name) {
                            fnLogger.info("createRelationDocs - assigning existing doc", { doc: existingDoc });
                            doc = Object.assign({}, existingDoc);
                        }
                        else if (existingDoc && existingDoc["~domain"] !== domainObj.name) {
                            throw new Error("createRelationDocs - Existing document type differs");
                        }
                        else {
                            isNewDoc = true;
                            doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                        }
                    }
                    else {
                        docId = `${domainObj.name}-${(this.lastDocId + 1)}`;
                        doc = this.prepareDoc(docId, domainObj.name, params, "~domain");
                        isNewDoc = true;
                        fnLogger.info("Generated docId", docId);
                    }
                    fnLogger.info("Doc BEFORE elaboration (i.e. merge)", { doc, params });
                    const doc_ = Object.assign(Object.assign(Object.assign({}, doc), params), { _id: docId, _rev: doc._rev, "~updateTimestamp": new Date().getTime() });
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
        this.query = async (sql, ...params) => {
            const fnLogger = logger.child({ method: "query", args: { sql, params } });
            fnLogger.info("Executing query");
            let astList = [];
            try {
                astList = parse(sql);
                fnLogger.info("Produced AST", { astList });
            }
            catch (error) {
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
                }
                catch (error) {
                    error.ast = astList; // Attach full AST list to error for debugging
                    throw error;
                }
            }
            // Handle case where query is empty or only comments
            return { rows: [], ast: null };
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
    // TODO: consider refactoring to use ~class (before, create) triggers
    // and (before, update) triggers
    prepareDoc(_id, type, params, metaKey = "~class") {
        logger.info("prepareDoc - given args", { _id: _id, type: type, params: params });
        params["_id"] = _id;
        params[metaKey] = type;
        params["~createTimestamp"] = new Date().getTime();
        params["active"] = true;
        logger.info("prepareDoc - after elaborations", { params });
        return params;
    }
}
export default ClientStack;
//# sourceMappingURL=stack.js.map