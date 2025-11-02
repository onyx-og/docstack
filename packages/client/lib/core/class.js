var _a;
import { Class as Class_ } from "@docstack/shared";
import createLogger from "../utils/logger";
import Attribute from "./attribute";
import { Trigger } from "./trigger";
import { z } from "zod";
/**
 * Refinement to check for a specific number of decimal places.
 * @param places The number of decimal places to validate.
 */
const hasDecimalPrecision = (places) => {
    return (value) => {
        const multiplier = Math.pow(10, places);
        return Math.abs(value * multiplier) % 1 === 0;
    };
};
class Class extends Class_ {
    constructor() {
        super();
        this.attributes = {};
        this.schema = {};
        this.schemaZOD = z.object({});
        this.state = "idle";
        this.logger = createLogger().child({ module: "class", className: this.name });
        this.triggers = [];
        // TODO: Test
        /*
        inheritAttributes( parentClass: Class ) {
            let parentAttributes = parentClass.getAttributes();
            for ( let attribute of parentAttributes ) {
                this.addAttribute(attribute);
            }
        } */
        this.build = () => {
            return new Promise(async (resolve, reject) => {
                let stack = this.getStack();
                if (stack) {
                    // if (parentClassName) this.setParentClass(parentClassName);
                    let classModel = await stack.addClass(this);
                    // Hydrate model
                    if (classModel) {
                        this.setModel(classModel);
                        this.logger.info("build - classModel", { classModel: classModel });
                        this.setId(classModel._id);
                        resolve(this);
                    }
                    else {
                        reject("unable to get classModel. Check logs");
                    }
                }
                else {
                    reject("Missing stack assignment");
                }
            });
        };
        this.init = (stack, name, type, description, schema = {}
        // parentClass: Class | null
        ) => {
            this.name = name;
            this.id = name;
            this.description = description;
            this.type = type;
            // this.attributes = [];
            // this.stack = null;
            // this.id = null;
            // if (schema) {
            //     this.schema = schema;
            // }
            this.setModel({
                type, _id: name, active: true,
                name, description,
                schema, triggers: [],
            });
            // this.parentClass = parentClass;
            if (stack) {
                this.stack = stack;
            }
            // TODO: Waiting for test of method
            // if (parentClass) this.inheritAttributes(parentClass);
        };
        this.uniqueCheck = async (doc) => {
            const fnLogger = this.logger.child({ method: "uniqueCheck", args: { doc } });
            const duplicate = await this.getByPrimaryKeys(doc);
            if (duplicate == null || duplicate._id == doc._id) {
                fnLogger.info("No duplicate found for doc");
                return true;
            }
            else {
                fnLogger.info("Duplicate found for doc", { duplicate });
                return false;
            }
        };
        this.bulkUniqueCheck = async (pKs) => {
            var _b;
            const fnLogger = this.logger.child({ method: "bulkUniqueCheck", args: { pKs } });
            const ddocId = await ((_b = this.stack) === null || _b === void 0 ? void 0 : _b.addDesignDocumentPKs(this.name, pKs, true));
            fnLogger.info(`Created temporary design document '${ddocId}'`);
            if (this.stack && ddocId) {
                try {
                    const result = await this.stack.db.query(`${ddocId}/by_pKeys`, {
                        group: true,
                        reduce: '_count'
                    });
                    const hasDuplicates = result.rows.some(row => row.value > 1);
                    if (hasDuplicates) {
                        // 3a. Rollback: new schema is invalid
                        fnLogger.error('Schema change invalid: new duplicates found.');
                        const finalTempDoc = await this.stack.db.get(ddocId);
                        await this.stack.db.remove(finalTempDoc);
                        return false; // Indicate failure
                    }
                    else {
                        // 3b. Execute: new schema is valid. Replace the live document.
                        fnLogger.info('Bulk unique check completed: no new duplicates found');
                        const finalTempDoc = await this.stack.db.get(ddocId);
                        // Clean up the temporary document
                        await this.stack.db.remove(finalTempDoc);
                        return true; // Indicate success
                    }
                }
                catch (err) {
                    console.error('Error during schema validation:', err);
                    // Ensure the temporary document is removed on error
                    try {
                        const finalTempDoc = await this.stack.db.get(ddocId);
                        await this.stack.db.remove(finalTempDoc);
                    }
                    catch (e) { /* ignore */ }
                    return false;
                }
            }
            else {
                fnLogger.error(`Was unable to create temporary design document to group by`);
                return false;
            }
        };
        this.validate = async (data) => {
            const fnLogger = this.logger.child({ method: "validate" });
            const result = await this.schemaZOD.safeParseAsync(data);
            fnLogger.debug("Got result", { result });
            if (result.success) {
                return true;
            }
            else {
                return false;
            }
        };
        // TODO Turn into method (after factory method instantiation refactory is done)
        this.setId = (id) => {
            this.id = id;
        };
        this.getName = () => {
            return this.name;
        };
        this.getStack = () => {
            return this.stack;
        };
        this.getDescription = () => {
            return this.description;
        };
        this.getType = () => {
            return this.type;
        };
        this.getId = () => {
            return this.id;
        };
        this.buildSchema = () => {
            let schema = {};
            Object.entries(this.attributes).forEach(t => {
                schema[t[0]] = t[1].model;
            });
            return schema;
        };
        this.getModel = () => {
            let triggers = [];
            for (const trigger of this.triggers) {
                triggers.push(trigger.model);
            }
            let model = {
                _id: this.getName(),
                name: this.getName(),
                description: this.getDescription(),
                type: this.getType(),
                schema: this.buildSchema(),
                triggers: triggers,
                active: true,
                _rev: this.model ? this.model._rev : "", // [TODO] Error prone
                createTimestamp: this.model ? this.model.createTimestamp : undefined,
            };
            return model;
        };
        // [TODO] Change into buildFromModel
        /**
         * It hydrates attributes and triggers from given model
         * @param model
         */
        this.setModel = (model) => {
            this.logger.info("setModel - got incoming model", { model: model });
            // Retreive current class model
            let currentModel = this.getModel();
            // Set model arg to the overwrite of the current model with the given one 
            model = Object.assign(currentModel, model);
            if (model.schema) {
                // model.schema = {...this.model.schema, ...model.schema};
                this.attributes = {};
                this.schemaZOD = z.object({});
                for (const [key, attrModel] of Object.entries(model.schema)) {
                    let attribute = new Attribute(this, attrModel.name, attrModel.type, attrModel.description, attrModel.config);
                    this.attributes[attrModel.name] = attribute;
                    this.schemaZOD = this.schemaZOD.extend({
                        [attrModel.name]: attribute.field
                    });
                }
            }
            if (model.triggers) {
                for (const trigger of model.triggers) {
                    let trigger_ = new Trigger(trigger, this);
                    this.triggers.push(trigger_);
                }
            }
            this.name = model.name;
            this.description = model.description;
            this.model = model;
            this.logger.info("setModel - model after processing", { model: model });
        };
        this.getPrimaryKeys = () => {
            return Object.values(this.attributes).filter(attr => attr.isPrimaryKey())
                .map(attr => attr.getName());
        };
        this.getAttributes = (...names) => {
            let attributes = {};
            for (const attribute of Object.values(this.attributes)) {
                if (names.length > 0) {
                    // filter with given names
                    for (let name of names) {
                        // match?
                        if (name != null && attribute.getName() == name) {
                            attributes[attribute.name] = attribute;
                        }
                    }
                }
                else {
                    // no filter provided add all
                    attributes[attribute.name] = attribute;
                }
            }
            return attributes;
        };
        this.hasAllAttributes = (...names) => {
            let result = false;
            let attributes = this.getAttributes(...names);
            for (let attribute of Object.values(attributes)) {
                result = names.includes(attribute.getName());
                if (!result)
                    break;
            }
            return result;
        };
        this.hasAnyAttributes = (...names) => {
            let result = false;
            let attributes = this.getAttributes(...names);
            for (let attribute of Object.values(attributes)) {
                result = names.includes(attribute.getName());
                if (result)
                    break;
            }
            return result;
        };
        // interface of hasAnyAttributes
        this.hasAttribute = (name) => {
            return this.hasAnyAttributes(name);
        };
        this.addAttribute = async (attribute) => {
            const fnLogger = this.logger.child({ method: "addAttribute", args: { attribute: attribute.name } });
            const attribute_ = attribute instanceof Attribute
                ? attribute : new Attribute(this, attribute.name, attribute.type, attribute.description, attribute.config);
            try {
                let name = attribute_.getName();
                if (!this.hasAttribute(name)) {
                    fnLogger.info("Adding attribute", { name: name, type: attribute_.getModel() });
                    this.attributes[name] = attribute_;
                    let attributeModel = attribute_.getModel();
                    fnLogger.info("Adding attribute to schema", { attributeModel: attributeModel });
                    // TODO: 
                    // this.schema[name] = attributeModel; // sometimes getting schema undefined
                    // update class on db
                    fnLogger.info("Checking for requirements before updating class on db", { stack: (this.stack != null), id: this.id });
                    if (this.stack && this.id) {
                        fnLogger.info("Updating class on db");
                        let res = await this.stack.updateClass(this);
                        return this;
                        // TODO: Check if this class has subclasses
                    }
                    else {
                        fnLogger.error("Class not updated on db because of missing stack or id");
                        return this;
                    }
                }
                else {
                    fnLogger.error("Attribute with name " + name + " already exists within this Class");
                    return this;
                }
            }
            catch (e) {
                fnLogger.error("Falied adding attribute because: ", e);
                return this;
            }
        };
        this.modifyAttribute = async (name, attribute) => {
            const fnLogger = this.logger.child({ method: "modifyAttribute", args: { name } });
            const originSchema = Object.assign({}, this.model.schema[name]), originAttr = this.attributes[name];
            const attribute_ = attribute instanceof Attribute
                ? attribute : new Attribute(this, attribute.name, attribute.type, attribute.description, attribute.config);
            try {
                fnLogger.info(`Attempting to change attribute definition.`);
                delete this.model.schema[name];
                delete this.attributes[name];
                this.schemaZOD = this.schemaZOD.omit({ [name]: true });
                return this.addAttribute(attribute_);
            }
            catch (e) {
                // Revert
                this.model.schema[name] = originSchema;
                this.attributes[name] = originAttr;
                fnLogger.error(`Failed at removing attribute from class.'`);
            }
            return this;
        };
        this.removeAttribute = async (name) => {
            const fnLogger = this.logger.child({ method: "removeAttribute", args: { name } });
            const originSchema = Object.assign({}, this.model.schema[name]), originAttr = this.attributes[name];
            try {
                fnLogger.info(`Attempting to remove attribute from class.`);
                delete this.model.schema[name];
                delete this.attributes[name];
                this.schemaZOD = this.schemaZOD.omit({ [name]: true });
                if (this.stack) {
                    this.stack.updateClass(this);
                }
                else
                    throw new Error("Missing stack, cannot perform updates.");
            }
            catch (e) {
                // Revert
                this.model.schema[name] = originSchema;
                this.attributes[name] = originAttr;
                fnLogger.error(`Failed at removing attribute from class.'`);
            }
            return this;
        };
        // TODO: modify to pass also the current class model
        // consider first fetching/updating the local class model
        this.addCard = async (params) => {
            const fnLogger = this.logger.child({ method: "addCard", args: { params } });
            if (!this.stack) {
                fnLogger.error("Stack is not defined");
                return null;
            }
            return await this.stack.createDoc(null, this.getName(), this, params);
        };
        this.addCards = async (paramsArray) => {
            const fnLogger = this.logger.child({ method: "addCards", args: { paramsArray } });
            if (!this.stack) {
                fnLogger.error("Stack is not defined");
                return [];
            }
            let addedCards = [];
            addedCards = await this.stack.createDocs(paramsArray.map(params => ({ docId: null, params })), this.getName(), this);
            return addedCards;
        };
        this.getByPrimaryKeys = async (params) => {
            const fnLogger = this.logger.child({ method: "getByPrimaryKeys" });
            // attempt to retrieve card by primary key
            let filter = {};
            let primaryKeys = this.getPrimaryKeys();
            fnLogger.info("Got primary keys", { primaryKeys });
            if (primaryKeys.length) {
                // executes a reducer function on each element of the primaryKeys array
                // that sets each primary key prop to the corresponding param value 
                primaryKeys.reduce((accumulator, currentValue) => accumulator[currentValue] = params[currentValue], filter);
                fnLogger.info("Defined filter", { filter });
                let cards = await this.getCards(filter, undefined, 0, 1);
                if (cards.length > 0) {
                    return cards[0];
                }
                else {
                    fnLogger.info("Did not find any documents with given primary key", { filter });
                    return null;
                }
            }
            else {
                fnLogger.info("Class has no field specified as primary key");
                return null;
            }
        };
        this.addOrUpdateCard = async (params, cardId) => {
            const fnLogger = this.logger.child({ method: "addOrUpdateCard", args: { params, cardId } });
            return new Promise(async (resolve, reject) => {
                if (cardId) {
                    fnLogger.info("Provided document's id, performing an update");
                    const res = await this.updateCard(cardId, params);
                    resolve(res);
                }
                else {
                    fnLogger.info("No document id provided, checking for PKs");
                    const card = await this.getByPrimaryKeys(params);
                    if (card == null) {
                        const res = await this.addCard(params);
                        resolve(res);
                    }
                    else {
                        fnLogger.error("Duplicate card by keys");
                        reject("Duplicate card by keys");
                    }
                }
            });
        };
        this.updateCard = async (cardId, params) => {
            return new Promise(async (resolve, reject) => {
                if (this.stack) {
                    const res = await this.stack.createDoc(cardId, this.getName(), this, params);
                    resolve(res);
                }
                else {
                    this.logger.info("no stack defined");
                    resolve(null);
                }
            });
        };
        this.deleteCard = async (cardId) => {
            const fnLogger = this.logger.child({ method: "deleteCard", args: { cardId } });
            if (this.stack) {
                const res = await this.stack.deleteDocument(cardId);
                return res;
            }
            else {
                fnLogger.error("Stack is not defined");
                return false;
            }
        };
        this.getCards = async (selector, fields, skip, limit) => {
            let _selector = Object.assign(Object.assign({}, selector), { type: this.name });
            this.logger.info("getCards - selector", { selector: _selector, fields, skip, limit });
            let docs = (await this.stack.findDocuments(_selector, fields, skip, limit)).docs;
            return docs;
        };
        this.addTrigger = async (name, model) => {
            const fnLogger = this.logger.child({ method: "addTrigger" });
            try {
                const trigger = new Trigger(model, this);
                this.triggers.push(trigger);
                if (this.stack) {
                    this.setModel(); // [TODO] Change to buildFromModel();
                    let res = await this.stack.updateClass(this);
                }
                else {
                    throw new Error(`Stack is not defined. Can't update class`);
                }
            }
            catch (e) {
                fnLogger.error(e);
            }
            return this;
        };
        this.removeTrigger = async (name) => {
            this.triggers = this.triggers.filter(t => t.name != name);
            return this;
        };
        // Private constructor to prevent direct instantiation
        /* Populated on async build */
        // this.id = null; 
    }
}
_a = Class;
Class.logger = createLogger().child({ module: "class" });
Class.get = (stack, name, type = "class", description, schema = {}) => {
    const class_ = new _a();
    _a.logger.info("Received schema", { schema });
    class_.init(stack, name, type, description, schema);
    // Add listener for new documents of this class type
    class_.stack.onClassDoc(name)
        .on("change", (change) => {
        console.log("onClassDoc", { change });
        const evt = new CustomEvent("doc", {
            detail: change
        });
        class_.dispatchEvent(evt);
    });
    return class_;
};
Class.create = async (stack, name, type = "class", description, schema = {}) => {
    const class_ = _a.get(stack, name, type, description, schema);
    await class_.build();
    return class_;
};
Class.buildFromModel = async (stack, classModel) => {
    _a.logger.info("buildFromModel - Instantiate from model", { classModel });
    // let parentClassModel = (classModel.parentClass ? await stack.getClassModel(classModel.parentClass) : null);
    // let parentClass = (parentClassModel ? await Class.buildFromModel(stack, parentClassModel) : null);
    // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
    if (classModel._rev) {
        let classObj = _a.get(stack, classModel.name, classModel.type, classModel.description, classModel.schema);
        return classObj;
    }
    else {
        let classObj = await _a.create(stack, classModel.name, classModel.type, classModel.type, classModel.schema);
        return classObj;
    }
};
// TODO: Decide return method
Class.fetch = async (stack, className) => {
    let classModel = await stack.getClassModel(className);
    if (classModel) {
        return _a.buildFromModel(stack, classModel);
    }
    else {
        return null;
        throw new Error("Class not found: " + className);
    }
};
export default Class;
//# sourceMappingURL=class.js.map