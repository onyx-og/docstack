"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Attribute_1 = __importDefault(require("../Attribute"));
// import DbManager from '..';
const server_logger_1 = __importDefault(require("../../../utils/logger/server-logger"));
const Reference_1 = __importDefault(require("../Reference"));
const logger = server_logger_1.default.child({ module: "Surfer" });
const CLASS_TYPE = "class";
const SUPERCLASS_TYPE = "superclass";
const CLASS_TYPES = [CLASS_TYPE, SUPERCLASS_TYPE];
class Class {
    // TODO: reorder type and title
    constructor(space = null, name, type = "class", title = name, parentClass = null) {
        this.name = name,
            this.title = title,
            this.type = type,
            this.attributes = [],
            this.space = null,
            this.id = null,
            this.parentClass = parentClass;
        if (space) {
            this.space = space;
        }
        if (parentClass)
            this.inheritAttributes(parentClass);
    }
    getPrimaryKeys() {
        return this.attributes.filter(attr => attr.isPrimaryKey())
            .map(attr => attr.getName());
    }
    inheritAttributes(parentClass) {
        let parentAttributes = parentClass.getAttributes();
        for (let attribute of parentAttributes) {
            this.addAttribute(attribute);
        }
    }
    static async build(classObj) {
        let space = classObj.getSpace();
        if (space) {
            // if (parentClassName) this.setParentClass(parentClassName);
            let classModel = await space.addClass(classObj);
            classObj.setModel(classModel);
            return classObj;
        }
        else {
            throw new Error("Missing db configuration");
        }
    }
    static async buildFromModel(space, classModel) {
        let parentClassModel = (classModel.parentClass ? await space.getClassModel(classModel.parentClass) : null);
        let parentClass = (parentClassModel ? await Class.buildFromModel(space, parentClassModel) : null);
        let classObj = new Class(space, classModel.name, classModel.type, classModel.type, parentClass);
        classObj.setModel(classModel);
        return classObj;
    }
    static async fetch(space, className) {
        let classModel = await space.getClassModel(className);
        if (classModel) {
            return Class.buildFromModel(space, classModel);
        }
        else {
            throw new Error("Domain not found: " + className);
        }
    }
    // static async fetch( space: Surfer, className: string ) {
    //     let classModel = await space.getClassModel(className);
    //     let classObj = new Class(space, classModel.name, classModel.type, classModel.description);
    //     classObj.setModel(classModel);
    //     return classObj;
    // }
    setId(id) {
        if (id)
            this.id = id;
        else
            throw Error("Missing id");
    }
    getName() {
        return this.name;
    }
    getSpace() {
        return this.space;
    }
    getTitle() {
        return this.title;
    }
    getType() {
        return this.type;
    }
    getId() {
        return this.id;
    }
    buildSchema() {
        let schema = [];
        for (let attribute of this.getAttributes()) {
            let attributeModel = attribute.getModel();
            schema.push(attributeModel);
        }
        this.schema = schema;
        return schema;
    }
    getModel() {
        let model = {
            _id: this.getName(),
            name: this.getName(),
            description: this.getTitle(),
            type: this.getType(),
            schema: this.buildSchema(),
            _rev: this.model ? this.model._rev : undefined,
            createTimestamp: this.model ? this.model.createTimestamp : undefined,
        };
        return model;
    }
    setModel(model) {
        logger.info("setModel - got incoming model", { model: model });
        let currentModel = this.getModel();
        model = Object.assign(currentModel, model);
        this.schema = this.schema || [];
        model.schema = [...model.schema, ...(this.schema)];
        // let _model = Object.assign(currentModel, {...model, schema: this.schema});
        logger.info("setModel - model after processing", { model: model });
        this.attributes = [];
        for (let attribute of model.schema) {
            this.addAttribute(attribute.name, attribute.type);
        }
        this.model = Object.assign(Object.assign({}, this.model), model);
        this.name = model.name;
        this.title = model.description;
    }
    getAttributes(...names) {
        let attributes = [];
        for (let attribute of this.attributes) {
            if (names.length > 0) {
                // filter with given names
                for (let name of names) {
                    // match?
                    if (name != null && attribute.getName() == name) {
                        return [attribute];
                    }
                }
            }
            else
                attributes.push(attribute); // no filter, add all
        }
        return attributes;
    }
    hasAllAttributes(...names) {
        let result = false;
        let attributes = this.getAttributes(...names);
        for (let attribute of attributes) {
            result = names.includes(attribute.getName());
            if (!result)
                break;
        }
        return result;
    }
    hasAnyAttributes(...names) {
        let result = false;
        let attributes = this.getAttributes(...names);
        for (let attribute of attributes) {
            result = names.includes(attribute.getName());
            if (result)
                break;
        }
        return result;
    }
    // interface of hasAnyAttributes
    hasAttribute(name) {
        return this.hasAnyAttributes(name);
    }
    async addReferenceAttribute(attribute) {
        return this.addAttribute(attribute);
    }
    async addAttribute(nameOrAttribute, type) {
        try {
            let attribute;
            if (typeof nameOrAttribute === 'string' && type) {
                attribute = new Attribute_1.default(this, nameOrAttribute, type);
            }
            else if (nameOrAttribute instanceof Reference_1.default) {
                let _attribute = nameOrAttribute;
                // check if the target domain exists
                let targetDomain = _attribute.domain;
                if (this.space && (await this.space.getDomain(targetDomain)) != null) {
                    attribute = _attribute;
                }
                else if (!this.space) {
                    throw new Error("Missing db configuration");
                }
                else {
                    throw new Error("Target domain not found: " + targetDomain);
                }
            }
            else if (nameOrAttribute instanceof Attribute_1.default) {
                attribute = nameOrAttribute;
            }
            else {
                throw new Error('Invalid arguments');
            }
            let name = attribute.getName();
            if (!this.hasAttribute(name)) {
                this.attributes.push(attribute);
                this.schema.push(attribute.getModel());
                // update class on db
                if (this.space && this.id) {
                    await this.space.updateClass(this);
                    // TODO: Check if this class has subclasses
                    // if ( this.class ) 
                }
                return this; // return class object
            }
            else
                throw Error("Attribute with name " + name + " already exists within this Class");
        }
        catch (e) {
            logger.info("Falied adding attribute because: ", e);
        }
    }
    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    async addCard(params) {
        return await this.space.createDoc(null, this, params);
    }
    async updateCard(cardId, params) {
        return await this.space.createDoc(cardId, this, params);
    }
    async getCards(selector, fields, skip, limit) {
        let _selector = Object.assign(Object.assign({}, selector), { type: this.name });
        logger.info("getCards - selector", { selector: _selector, fields, skip, limit });
        let docs = (await this.space.findDocuments(_selector, fields, skip, limit)).docs;
        return docs;
    }
}
exports.default = Class;
//# sourceMappingURL=index.js.map