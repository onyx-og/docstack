"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_SCHEMA = void 0;
const pouchdb_node_1 = __importDefault(require("pouchdb-node"));
const pouchdb_find_1 = __importDefault(require("pouchdb-find"));
const server_logger_1 = __importDefault(require("../../../utils/logger/server-logger"));
const Class_1 = __importDefault(require("../Class"));
const Domain_1 = __importDefault(require("../Domain"));
const Reference_1 = __importDefault(require("../Reference"));
const logger = server_logger_1.default.child({ module: "Surfer" });
exports.BASE_SCHEMA = [
    { name: "name", type: "string", config: { maxLength: 100 } },
    { name: "type", type: "string", config: { maxLength: 100 } },
    { name: "createTimestamp", type: "integer", config: { min: 0 } },
    { name: "updateTimestamp", type: "integer", config: { min: 0 } },
    { name: "description", type: "string", config: { maxLength: 1000 } }
];
const CLASS_SCHEMA = [
    { name: "schema", type: "attribute", config: { maxLength: 1000, isArray: true } },
    { name: "parentClass", type: "foreign_key", config: { isArray: false } },
    ...exports.BASE_SCHEMA
];
const DOMAIN_SCHEMA = [
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
        } },
    { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
    { name: "relation", type: "string", config: { maxLength: 100, isArray: false } },
    { name: "sourceClass", type: "foreign_key", config: { isArray: true } },
    { name: "targetClass", type: "foreign_key", config: { isArray: true } },
    ...exports.BASE_SCHEMA
];
class Surfer {
    constructor(conn, options) {
        this.db = undefined;
        // load default plugins
        pouchdb_node_1.default.plugin(pouchdb_find_1.default);
        if (options.plugins) {
            for (let plugin of options.plugins) {
                pouchdb_node_1.default.plugin(plugin);
            }
        }
        this.db = new pouchdb_node_1.default(conn);
    }
    async getLastDocId() {
        let lastDocId = 0;
        try {
            let doc = await this.db.get("lastDocId");
            lastDocId = doc.value;
        }
        catch (e) {
            if (e.name === 'not_found') {
                return lastDocId;
            }
            logger.error("checkdb - something went wrong", { "error": e });
        }
        return lastDocId;
    }
    // Database initialization should be about making sure that all the documents
    // representing the base data model for this framework are present
    // perform tasks like applying patches, creating indexes, etc.
    async initdb() {
        this.db.info().then((info) => {
            logger.info("initdb - db info", info.backend_adapter, info.doc_count, info.update_seq);
        });
        await this.initIndex();
        return this;
    }
    async getClass(className) {
        let classObj = await Class_1.default.fetch(this, className);
        return classObj;
    }
    async getDomain(domainName) {
        let domainObj = await Domain_1.default.fetch(this, domainName);
        return domainObj;
    }
    async setSystem() {
        let dbInfo = await this.db.info();
        logger.info("setSystem - db info", dbInfo);
        let systemClass;
        try {
            systemClass = await this.getClass("System");
        }
        catch (e) {
            // system class does not exist
            // create it from base data model
            systemClass = await this.getClass("System"); // TEMP
        }
        let currentSystem = await systemClass.getCards({
            db_name: dbInfo.db_name,
            backend_adapter: dbInfo.backend_adapter,
        }, null, null, null);
        if (currentSystem.length == 0) {
            let systemDoc = {
                db_name: dbInfo.db_name,
                backend_adapter: dbInfo.backend_adapter,
                doc_count: dbInfo.doc_count,
                update_seq: dbInfo.update_seq,
                version: Surfer.version,
                patch: null
            };
            await systemClass.addCard(systemDoc);
        }
        else {
            let systemDoc = {
                doc_count: dbInfo.doc_count,
                update_seq: dbInfo.update_seq,
            };
            await systemClass.updateCard(currentSystem[0]._id, systemDoc);
        }
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
            throw new Error("initdb -  something went wrong" + e);
        }
    }
    static async build(that) {
        let result = await that.initdb();
        // dbManagerObj = await dbManagerObj.incrementLastDocId();
        return result;
    }
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
            _rev = doc._rev;
        }
        catch (e) {
            logger.info("getDocRevision - error", e);
            throw new Error(e);
        }
        return _rev;
    }
    async findDocuments(selector, fields = undefined, skip = undefined, limit = undefined) {
        let indexFields = Object.keys(selector);
        let result = {
            docs: []
        };
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
        }
        catch (e) {
            logger.info("findDocument - error", e);
            return { docs: [], error: e.toString(), selector, skip, limit };
        }
    }
    async findDocument(selector, fields = undefined, skip = undefined, limit = undefined) {
        let result = await this.findDocuments(selector, fields, skip, limit);
        return result.docs.length > 0 ? result.docs[0] : null;
    }
    // TODO: Do not confuse Class with Class models
    async getClassModel(className) {
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
    }
    async getDomainModel(domainName) {
        let selector = {
            type: { $eq: "domain" },
            name: { $eq: domainName }
        };
        let response = await this.findDocument(selector);
        let result = response;
        logger.info("getDomainModel - result", { result });
        return result;
    }
    async getAllClassModels() {
        let selector = {
            type: { $eq: "class" },
        };
        // TODO: parentClass may be interesting
        let fields = ['_id', 'name', 'description'];
        let response = await this.findDocuments(selector, fields);
        let result = response.docs;
        return result;
    }
    async getClassModels(classNames) {
        let allClasses = await this.getAllClassModels();
        let result = allClasses.filter(classObj => classNames.includes(classObj.name));
        return result;
    }
    async incrementLastDocId() {
        let docId = "lastDocId", _rev = await this.getDocRevision(docId);
        await this.db.put({
            _id: "lastDocId",
            _rev: _rev,
            value: ++this.lastDocId
        });
        return this.lastDocId;
    }
    static async clear(conn) {
        return new Promise((resolve, reject) => {
            try {
                let db = new pouchdb_node_1.default(conn);
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
    async addClass(classObj) {
        let classModel = classObj.getModel();
        logger.info("addClass - got class model", { classModel });
        let existingDoc = await this.getClassModel(classModel.name);
        if (existingDoc == null) {
            let resultDoc = await this.createDoc(classModel.name, classObj, classModel);
            logger.info("addClass - result", resultDoc);
            return resultDoc;
        }
        else {
            return existingDoc;
        }
    }
    async addDomain(domainObj) {
        let domainModel = domainObj.getModel();
        let existingDoc = await this.getDomainModel(domainModel.name);
        if (existingDoc == null) {
            let resultDoc = await this.createDoc(domainModel.name, domainObj, domainModel);
            logger.info("addClass - result", resultDoc);
            return resultDoc;
        }
        else {
            return existingDoc;
        }
    }
    async updateClass(classObj) {
        return await this.createDoc(classObj.getId(), classObj, classObj.getModel());
    }
    async updateDomain(domainObj) {
        return await this.createDoc(domainObj.getId(), domainObj, domainObj.getModel());
    }
    // You have an object and array of AttributeModels,
    // therefore each element of the array has an attribute name,
    // a type and a configuration
    // Based on the configuration apply various checks on the given object's
    // value at the corresponding attribute name
    async validateObject(obj, attributeModels) {
        logger.info("validateObject - given args", { obj: obj, attributeModels: attributeModels });
        let isValid = true;
        attributeModels.forEach(async (model) => {
            let value = obj[model.name];
            // Check if the property exists
            if (value === undefined && model.config.mandatory) {
                logger.info(`Property ${model.name} does not exist on the object.`);
                isValid = false;
                return;
            }
            if (!model.config.mandatory && value === undefined) {
                return;
            }
            // update object's value to the default value
            if (model.config.defaultValue && value === undefined) {
                obj[model.name] = model.config.defaultValue;
                value = obj[model.name];
            }
            switch (model.type) {
                case 'string':
                    if (!model.config.isArray && typeof value !== model.type) {
                        logger.info(`Property ${model.name} is not of type ${model.type}.`);
                        isValid = false;
                        return;
                    }
                    else if (model.config.isArray && !Array.isArray(value)) {
                        logger.info(`Property ${model.name} is not an array.`);
                        isValid = false;
                        return;
                    }
                    if (model.config) {
                        if (model.config.maxLength && value.length > model.config.maxLength) {
                            logger.info(`Property ${model.name} is longer than ${model.config.maxLength} characters.`);
                            isValid = false;
                            return;
                        }
                    }
                    break;
                case 'decimal':
                    // TODO: decide how to interpret decimal
                    if (model.config) {
                        if (model.config.min && value < model.config.min) {
                            logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                            isValid = false;
                            return;
                        }
                        if (model.config.max && value > model.config.max) {
                            logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                            isValid = false;
                            return;
                        }
                    }
                    break;
                case 'integer':
                    if (!model.config.isArray && typeof value !== 'number') {
                        logger.info(`Property ${model.name} is not of type ${model.type}.`);
                    }
                    else if (model.config.isArray && (!Array.isArray(value) || !value.every((v) => typeof v === 'number'))) {
                        logger.info(`Property ${model.name} is not an array.`);
                        isValid = false;
                        return;
                    }
                    if (model.config) {
                        if (model.config.min && value < model.config.min) {
                            logger.info(`Property ${model.name} is less than ${model.config.min}.`);
                            isValid = false;
                            return;
                        }
                        if (model.config.max && value > model.config.max) {
                            logger.info(`Property ${model.name} is greater than ${model.config.max}.`);
                            isValid = false;
                            return;
                        }
                    }
                    break;
                case "foreign_key":
                    model.config;
                    // check if foreign key corresponds to an existing document
                    let foreignKeyDoc = await this.getDocument(value);
                    if (foreignKeyDoc == null) {
                        logger.info(`Foreign key ${value} does not exist.`);
                        isValid = false;
                        return;
                    }
                    break;
                case "reference":
                    model.config;
                    var domain = await this.getDomain(model.config.domain);
                    if (domain == null) {
                        logger.info(`Reference domain ${model.config.domain} does not exist.`);
                        isValid = false;
                        return;
                    }
                    // check if the reference it points to exists
                    let reference = await this.getDocument(value);
                    if (reference == null) {
                        logger.info(`Reference ${value} does not exist.`);
                        isValid = false;
                        return;
                    }
                    switch (domain.relationType) {
                        case "one-to-one":
                            // check if the reference is unique
                            // based on the position of the reference
                            var selector = {
                                type: { $eq: domain.name },
                                [model.config.position]: { $eq: value }
                            };
                            var result = await this.findDocument(selector);
                            if (result) {
                                logger.info(`Reference ${value} is not unique.`);
                                isValid = false;
                                return;
                            }
                            break;
                        case "one-to-many":
                            // check if the reference is unique
                            // based on the position of the reference
                            var selector = {
                                type: { $eq: domain.name },
                                [model.config.position]: { $eq: value }
                            };
                            var result = await this.findDocument(selector);
                            if (result) {
                                logger.info(`Reference ${value} is not unique.`);
                                isValid = false;
                                return;
                            }
                            break;
                    }
                    break;
                default:
                    logger.info("Probably an attribute? Huh", model);
            }
        });
        logger.info("validateObject - result", { result: isValid });
        return isValid;
    }
    async validateObjectByType(obj, type, schema) {
        logger.info("validateObjectByType - given args", { obj, type, schema });
        if (!schema) {
            switch (type) {
                case "class":
                    schema = CLASS_SCHEMA;
                    break;
                case "domain":
                    schema = DOMAIN_SCHEMA;
                    break;
                default:
                    try {
                        const classDoc = await this.getClassModel(type);
                        schema = classDoc.schema;
                    }
                    catch (e) {
                        // if 404 validation failed because of missing class
                        logger.info("validateObjectByType - failed because of error", e);
                        return false;
                    }
            }
        }
        return await this.validateObject(obj, schema);
    }
    prepareDoc(_id, type, params) {
        logger.info("prepaerDoc - given args", { _id: _id, type: type, params: params });
        let doc = {
            _id: _id,
            _rev: undefined,
            type: type,
            createTimestamp: new Date().getTime(),
        };
        doc = Object.assign(doc, params);
        logger.info("prepareDoc - first eleboration", doc);
        // TODO: consider managin defaults in another way, pouchdb plugin for triggers
        // var defaults = { type: type, timestamp: new Date().toISOString() };
        // if ( _id != null ) defaults = Object.assign(defaults, { _id: _id});
        // doc = Object.assign(doc, defaults);
        logger.info("prepareDoc - after elaborations", { "doc": doc });
        return doc;
    }
    async createDoc(docId, classObj, params) {
        let type = classObj.name, schema = classObj.buildSchema();
        logger.info("createDoc - args", { docId, type, params, schema });
        let db = this.db, doc, isNewDoc = false;
        try {
            if (!(await this.validateObjectByType(params, type, schema))) {
                throw new Error("createDoc - Invalid object");
            }
            if (docId) {
                const existingDoc = await this.getDocument(docId);
                if (existingDoc && existingDoc.type === type) {
                    doc = existingDoc;
                }
                else if (existingDoc && existingDoc.type !== type) {
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
                logger.info("createDoc - generated docId", docId);
            }
            doc = Object.assign(doc, Object.assign(Object.assign({}, params), { _id: docId, updateTimestamp: new Date().getTime() }));
            logger.info("createDoc - doc after elaboration", doc);
            let response = await db.put(doc);
            logger.info("createDoc - Response after put", { "response": response });
            if (response.ok && isNewDoc) {
                this.incrementLastDocId();
                // let uploadedDoc = await db.get(response.id);
                // logger.info({"doc": uploadedDoc}, "createDoc - Uploaded doc")
                docId = response.id;
                // create relations if needed
                logger.info("createDoc - schema detail", { schema });
                for (const attributeModel of schema) {
                    if (attributeModel.type === "reference") {
                        let referenceAttr = new Reference_1.default(classObj, attributeModel.name, attributeModel.config);
                        await this.createRelationFromRef(referenceAttr, doc);
                    }
                }
            }
            else if (response.ok) {
                docId = response.id;
            }
            else {
                throw new Error("createDoc - error:" + response.ok);
            }
        }
        catch (e) {
            if (e.name === 'conflict') {
                logger.info("createDoc - conflict! Ignoring..");
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
            }
            else {
                logger.info("createDoc - Problem while putting doc", {
                    "error": e,
                    "document": doc
                });
                throw new Error("createDoc - Problem while putting doc" + e);
            }
        }
        return doc;
    }
    async createRelationFromRef(referenceAttr, doc) {
        let refValue = doc[referenceAttr.name];
        let domain = await this.getDomain(referenceAttr.domain);
        let referenceDoc = await this.getDocument(refValue);
        let refClassName = referenceDoc.type;
        let sourceClass = "", targetClass = "";
        let sourceId = "", targetId = "";
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
        }
        else if (referenceAttr.position === "target") {
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
        };
        return this.createDoc(null, domain, params);
    }
}
Surfer.version = "0.0.1";
exports.default = Surfer;
//# sourceMappingURL=index.js.map