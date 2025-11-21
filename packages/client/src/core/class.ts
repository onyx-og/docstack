import { Class as Class_, DesignDocument, TriggerModel } from "@docstack/shared";
import createLogger from "../utils/logger";
// import ReferenceAttribute from '../Reference';
import {Stack, ClassModel, AttributeModel, Document} from "@docstack/shared";
import Attribute from "./attribute";
import { Logger } from 'winston';
import { Trigger } from "./trigger";
import {z} from "zod";
import clientLogger from "../utils/logger";

class Class extends Class_ {
    stack: Stack | undefined;
    /* Populated in init() */
    name!: string;
    /* Populated in init() */
    type!: ClassModel["~class"];
    description?: string;
    attributes: {[name: string]: Attribute} = {};
    schema: ClassModel["schema"] = {};
    schemaZOD: z.ZodObject = z.object({});
    id?: string;
    // parentClass: Class | null;
    model!: ClassModel;
    state: "busy" | "idle" = "idle"; 
    static logger: Logger = createLogger().child({module: "class"});
    logger!: Logger;
    triggers: Trigger[] = [];

    private constructor() {
        super();
        // Private constructor to prevent direct instantiation
        /* Populated on async build */
        // this.id = null; 
    }

    // TODO: Test
    /*
    inheritAttributes( parentClass: Class ) {
        let parentAttributes = parentClass.getAttributes();
        for ( let attribute of parentAttributes ) {
            this.addAttribute(attribute);
        }
    } */

    build = (): Promise<Class> => {
        return new Promise(async (resolve, reject) => {
            let stack = this.getStack();
            if ( stack ) {
                // if (parentClassName) this.setParentClass(parentClassName);
                let classModel = await stack.addClass(this);
                // Hydrate model
                if (classModel) {
                    this.setModel(classModel)
                    Class.logger.info("build - classModel", {classModel: classModel})
                    this.setId(classModel._id);
                    resolve(this);
                } else {
                    reject("unable to get classModel. Check logs");
                }
                
            } else {
                reject("Missing stack assignment");
            }
        })
    }

    init = (
        stack: Stack | null,
        id: string,
        name: string,
        type: ClassModel["~class"],
        description?: string,
        schema: ClassModel["schema"] = {}
        // parentClass: Class | null
    ) => {
        // this.parentClass = parentClass;
        if (stack) {
            this.stack = stack;
        }
        this.name = name;
        this.id = id;
        this.description = description;
        this.type = type;
        // this.attributes = [];
        // this.stack = null;
        // this.id = null;
        // if (schema) {
        //     this.schema = schema;
        // }
        this.setModel({
            "~class": type, _id: id, active: true,
            name, description,
            schema, triggers: [],
        });
       
        this.logger = clientLogger(stack).child({module: "class", className: this.name});
        // TODO: Waiting for test of method
        // if (parentClass) this.inheritAttributes(parentClass);
    }

    
    public static get = (
        stack: Stack,
        id: string,
        name: string,
        type: ClassModel["~class"],
        description?: string,
        schema: ClassModel["schema"] = {},
    ) => {
        const class_ = new Class();
        Class.logger.info("Received schema", {schema})
        class_.init(stack, id, name, type, description, schema);
        // Add listener for new documents of this class type
        class_.stack!.onClassDoc(name)
            .on("change", (change) => {
                const evt = new CustomEvent("doc", {
                    detail: change
                })
                class_.dispatchEvent(evt);
            })
        return class_;
    }

    public static create = async (
        stack: Stack,
        name: string,
        type: ClassModel["~class"],
        description?: string,
        schema: ClassModel["schema"] = {},
        // parentClass: Class | null = null
    ) => {
        const class_ = Class.get(stack, name, name, type, description, schema);
        await class_.build();
        return class_;
    }

    static buildFromModel = async (stack: Stack, classModel: ClassModel) => {
        Class.logger.info("buildFromModel - Instantiate from model", {classModel});
        // let parentClassModel = (classModel.parentClass ? await stack.getClassModel(classModel.parentClass) : null);
        // let parentClass = (parentClassModel ? await Class.buildFromModel(stack, parentClassModel) : null);

        // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
        if (classModel._rev) {
            let classObj: Class = Class.get(
                stack, classModel._id, classModel.name,
                classModel["~class"], classModel.description,
                classModel.schema
            )
            return classObj;
        } else {
            let classObj: Class = await Class.create(stack, classModel.name, classModel["~class"], classModel["~class"], classModel.schema);
            return classObj;
        }
    }

    static fetchById = async ( stack: Stack, classId: string ) => {
        try {
            let classModel = await stack.db.get<ClassModel>(classId);
            const classObj = await Class.buildFromModel(stack, classModel);
            return classObj;
        } catch (error) {
            throw new Error(`Class not found: ${classId}`);
        }
    }

    static fetch = async ( stack: Stack, className: string ) => {
        let classModel = await stack.getClassModel(className);
        if ( classModel ) {
            // console.log("Fetched class model", {classModel});
            return Class.buildFromModel(stack, classModel);
        } else {
            throw new Error("Class not found: "+className);
        }
    }

    uniqueCheck = async (doc: Document): Promise<boolean> => {
        const fnLogger = this.logger.child({method: "uniqueCheck", args: {doc}});
        const duplicate = await this.getByPrimaryKeys(doc);
        if (duplicate == null || duplicate._id == doc._id) {
            fnLogger.info("No duplicate found for doc");
            return true;
        } else {
            fnLogger.info("Duplicate found for doc", {duplicate});
            return false;
        }
    };

    bulkUniqueCheck = async (pKs: string[]): Promise<boolean> => {
        const fnLogger = this.logger.child({method: "bulkUniqueCheck", args: {pKs}});
        const ddocId = await this.stack?.addDesignDocumentPKs(this.name, pKs, true);
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
                } else {
                    // 3b. Execute: new schema is valid. Replace the live document.
                    fnLogger.info('Bulk unique check completed: no new duplicates found');
                    const finalTempDoc = await this.stack.db.get(ddocId) as DesignDocument;

                    // Clean up the temporary document
                    await this.stack.db.remove(finalTempDoc);
                    return true; // Indicate success
                }
            } catch (err) {
                console.error('Error during schema validation:', err);
                // Ensure the temporary document is removed on error
                try {
                    const finalTempDoc = await this.stack.db.get(ddocId);
                    await this.stack.db.remove(finalTempDoc);
                } catch(e: any) { /* ignore */ }
                return false;
            }
        } else {
            fnLogger.error(`Was unable to create temporary design document to group by`);
            return false;
        }
        
    }

    validate = async (data: {[key: string]: any}): Promise<boolean> => {
        const fnLogger = this.logger.child({method: "validate"});
        const result = await this.schemaZOD.safeParseAsync(data);
        fnLogger.debug("Got result", {result});
        if (result.success) {
            return true
        } else {
            return false;
        }
    }

    // TODO Turn into method (after factory method instantiation refactory is done)
    setId = ( id: string ) => {
        this.id = id;
    } 

    getName = () => {
        return this.name;
    }

    getStack = () => {
        return this.stack;
    }

    getDescription = () => {
        return this.description;
    }

    getType = () => {
        return this.type;
    }

    getId = () => {
        return this.id;
    }

    buildSchema = () => {
        let schema: ClassModel["schema"] = {};
        Object.entries(this.attributes).forEach(t => {
            schema[t[0]] = t[1].model
        });
        return schema;
    }

    getModel = () => {
        let triggers: ClassModel["triggers"] = [];
        for (const trigger of this.triggers) {
            triggers.push(trigger.model);
        }
        let model: ClassModel = {
            _id:this.id!,
            name: this.getName(),
            description: this.getDescription(),
            "~class": this.getType(),
            schema: this.buildSchema(),
            triggers: triggers,
            active: true,
            _rev: this.model ? this.model._rev : "", // [TODO] Error prone
            "~createTimestamp": this.model ? this.model["~createTimestamp"] : undefined,
        };
        return model;
    }

    // [TODO] Change into buildFromModel
    /**
     * It hydrates attributes and triggers from given model
     * @param model 
     */
    setModel = ( model?: ClassModel ) => {
        Class.logger.info("setModel - got incoming model", {model: model});
        // Retreive current class model
        let currentModel = this.getModel();
        // Set model arg to the overwrite of the current model with the given one 
        model = Object.assign(currentModel, model);
        if (model.schema) {
            // model.schema = {...this.model.schema, ...model.schema};
            this.attributes = {};
            this.schemaZOD = z.object({});
            for (const [key, attrModel] of Object.entries(model.schema)) {
                let attribute = new Attribute(
                    this, attrModel.name, attrModel.type, attrModel.description, attrModel.config
                );
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
        this.type = model["~class"];
        this.model = model;
        Class.logger.info("setModel - model after processing",{ model: model})
    }

    getPrimaryKeys = () => {
        return Object.values(this.attributes).filter( attr => attr.isPrimaryKey() )
            .map( attr => attr.getName() );
    }

    getAttributes = ( ...names: string[] ) => {
        let attributes: typeof this.attributes = {};
        for ( const attribute of Object.values(this.attributes) ) {
            if ( names.length > 0 ) {
                // filter with given names
                for ( let name of names ) {
                    // match?
                    if ( name != null && attribute.getName() == name ) {
                        attributes[attribute.name] = attribute;
                    } 
                }
            } else {
                // no filter provided add all
                attributes[attribute.name] = attribute;
            }
        }
        return attributes
    }

    hasAllAttributes = ( ...names: string[] ) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of Object.values(attributes) ) {
            result = names.includes(attribute.getName())
            if ( !result ) break;
        }
        return result;
    }

    hasAnyAttributes = ( ...names: string[] ) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of Object.values(attributes) ) {
            result = names.includes(attribute.getName())
            if ( result ) break;
        }
        return result;
    }

    // interface of hasAnyAttributes
    hasAttribute = ( name: string ) => {
        return this.hasAnyAttributes( name )
    }


    addAttribute = async (attribute: Attribute | AttributeModel): Promise<Class> => {
        const fnLogger = this.logger.child({method: "addAttribute", args: {attribute: attribute.name}});
        const attribute_ = attribute instanceof Attribute 
            ? attribute : new Attribute(
                this, attribute.name, attribute.type, 
                attribute.description, attribute.config
            );
        try {
            let name = attribute_.getName();
            console.log("Adding attribute", {className: this.name, attribute: name})
            if (!this.hasAttribute(name)) {
                fnLogger.info("Adding attribute", {name: name, type: attribute_.getModel()});
                this.attributes[name] = attribute_;
                let attributeModel = attribute_.getModel();
                fnLogger.info("Adding attribute to schema", {attributeModel: attributeModel});
                const currentSchema = this.model.schema ?? {};
                this.model.schema = {
                    ...currentSchema,
                    [name]: attributeModel
                };
                this.schemaZOD = this.schemaZOD.extend({
                    [name]: attribute_.field
                });
                // TODO:
                // this.schema[name] = attributeModel; // sometimes getting schema undefined
                // update class on db
                fnLogger.info("Checking for requirements before updating class on db", {stack: (this.stack != null), id: this.id})
                if (this.stack && this.id) {
                    debugger;
                    fnLogger.info("Updating class on db")
                    let res = await this.stack.updateClass(this);
                    return this;
                    // TODO: Check if this class has subclasses
                } else {
                    fnLogger.error("Class not updated on db because of missing stack or id")
                    return this;
                }
            } else { 
                fnLogger.error("Attribute with name " + name + " already exists within this Class");
                return this;
            }
        } catch (e) {
            fnLogger.error("Falied adding attribute because: ", e)
            return this;
        }
    }

    modifyAttribute = async (name: string, attribute: Attribute | AttributeModel): Promise<Class> => {
        const fnLogger = this.logger.child({method: "modifyAttribute", args: {name}});
        const originSchema = {...this.model.schema[name]},
            originAttr = this.attributes[name];
        const attribute_ = attribute instanceof Attribute 
            ? attribute : new Attribute(
                this, attribute.name, attribute.type, 
                attribute.description, attribute.config
            );
        try {
            fnLogger.info(`Attempting to change attribute definition.`);
            delete this.model.schema[name];
            delete this.attributes[name];
            this.schemaZOD = this.schemaZOD.omit({[name]: true});
            return this.addAttribute(attribute_);
        } catch (e: any) {
            // Revert
            this.model.schema[name] = originSchema;
            this.attributes[name] = originAttr;
            fnLogger.error(`Failed at removing attribute from class.'`);
        }
        return this;
    }

    removeAttribute = async (name: string): Promise<Class> => {
        const fnLogger = this.logger.child({method: "removeAttribute", args: {name}});
        const originSchema = {...this.model.schema[name]},
            originAttr = this.attributes[name];
        try {
            fnLogger.info(`Attempting to remove attribute from class.`);
            delete this.model.schema[name];
            delete this.attributes[name];
            this.schemaZOD = this.schemaZOD.omit({[name]: true});
            if (this.stack) {
                this.stack.updateClass(this);
            } else throw new Error("Missing stack, cannot perform updates.");
        } catch (e: any) {
            // Revert
            this.model.schema[name] = originSchema;
            this.attributes[name] = originAttr;
            fnLogger.error(`Failed at removing attribute from class.'`);
        }
        return this;
    };

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    addCard = async (params: {[key:string]: any}) => {
        const fnLogger = this.logger.child({method: "addCard", args: {params}});
        if (!this.stack) {
            fnLogger.error("Stack is not defined");
            return null;
        }
        return await this.stack.createDoc(null, this.getName(), this, params);
    }

    addCards = async (paramsArray: {[key:string]: any}[]) => {
        const fnLogger = this.logger.child({method: "addCards", args: {paramsArray}});
        if (!this.stack) {
            fnLogger.error("Stack is not defined");
            return [];
        }
        let addedCards: Document[] = [];
        addedCards = await this.stack.createDocs(
            paramsArray.map(params => ({docId: null, params})), this.getName(), this
        );
        return addedCards;
    }
    
    getByPrimaryKeys = async (params: {[key: string]: any}): Promise<Document | null> => {
        const fnLogger = this.logger.child({method: "getByPrimaryKeys"});
        // attempt to retrieve card by primary key
        let filter: {[key: string]:any} = {}
        let primaryKeys = this.getPrimaryKeys();
        fnLogger.info("Got primary keys", {primaryKeys});
        if (primaryKeys.length) {
            // executes a reducer function on each element of the primaryKeys array
            // that sets each primary key prop to the corresponding param value 
            primaryKeys.reduce(
                (accumulator, currentValue) => accumulator[currentValue] = params[currentValue],
                filter,
            );
            fnLogger.info("Defined filter", {filter});
            let cards = await this.getCards(filter, undefined, 0, 1);
            if (cards.length > 0) {
                return cards[0];
            } else {
                fnLogger.info("Did not find any documents with given primary key", {filter});
                return null;
            }
        } else {
            fnLogger.info("Class has no field specified as primary key");
            return null;
        }
    }

    addOrUpdateCard = async (params: {[key:string]: any}, cardId?: string) => {
        const fnLogger = this.logger.child({method: "addOrUpdateCard", args: {params, cardId}});
        return new Promise<Document | null>( async (resolve, reject) => {
            if (cardId) {
                fnLogger.info("Provided document's id, performing an update");
                const res = await this.updateCard(cardId, params);
                resolve(res);
            } else {
                fnLogger.info("No document id provided, checking for PKs");
                const card = await this.getByPrimaryKeys(params);
                if (card == null) {
                    const res = await this.addCard(params);
                    resolve(res);
                } else {
                    fnLogger.error("Duplicate card by keys");
                    reject("Duplicate card by keys");
                }
            }
        });
        
    }

    updateCard = async (cardId: string, params: {[key:string]: any}) => {
        return new Promise<Document | null>( async (resolve, reject) => {
            if (this.stack) {
                const res = await this.stack.createDoc(cardId, this.getName(), this, params);
                resolve(res)
            } else {
                Class.logger.info("no stack defined");
                resolve(null);
            }
        })
    }

    deleteCard = async (cardId: string) => {
        const fnLogger = this.logger.child({method: "deleteCard", args: {cardId}});
        if (this.stack) {
            const res = await this.stack.deleteDocument(cardId);
            return res;
        } else {
            fnLogger.error("Stack is not defined");
            return false;
        }
    }

    getCards = async (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => {
        let _selector = { ...selector, type: this.name };
        this.logger.info("getCards - selector", {selector: _selector, fields, skip, limit})
        let docs = (await this.stack!.findDocuments(_selector, fields, skip, limit)).docs
        return docs;
    }

    addTrigger = async (name: string, model: TriggerModel) => {
        const fnLogger = this.logger.child({method: "addTrigger"});
        try {
            const trigger = new Trigger(model, this);
            this.triggers.push(trigger);
            if (this.stack) {
                this.setModel(); // [TODO] Change to buildFromModel();
                let res = await this.stack.updateClass(this);
            } else {
                throw new Error(`Stack is not defined. Can't update class`);
            }
        } catch (e) {
            fnLogger.error(e);
        }
        return this;
    }

    removeTrigger = async (name: string) => {
        this.triggers = this.triggers.filter(t => t.name != name)
        return this;
    }
}

export default Class;