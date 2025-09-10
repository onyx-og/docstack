import { Class as Class_, TriggerModel } from "@docstack/shared";
import logger from "../logger";
// import ReferenceAttribute from '../Reference';
import {Stack, ClassModel, AttributeModel, Document} from "@docstack/shared";
import Attribute from "./attribute";
import { Logger } from 'winston';
import { Trigger } from "./trigger/";
import * as z from "zod";

/**
 * Refinement to check for a specific number of decimal places.
 * @param places The number of decimal places to validate.
 */
const hasDecimalPrecision = (places: number) => {
  return (value: number) => {
    const multiplier = Math.pow(10, places);
    return Math.abs(value * multiplier) % 1 === 0;
  };
}
class Class extends Class_ {
    space: Stack | undefined;
    /* Populated in init() */
    name!: string;
    /* Populated in init() */
    type!: string;
    description?: string;
    attributes: {[name: string]: Attribute} = {};
    schema: ClassModel["schema"] = {};
    schemaZOD: z.ZodObject = z.object({});
    id?: string;
    // parentClass: Class | null;
    model!: ClassModel;
    state: "busy" | "idle" = "idle"; 
    static logger: Logger = logger.child({module: "class"});
    logger: Logger = logger.child({module: "class", className: this.name});
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
            let space = this.getSpace();
            if ( space ) {
                // if (parentClassName) this.setParentClass(parentClassName);
                let classModel = await space.addClass(this);
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
                reject("Missing db configuration");
            }
        })
    }

    init = (
        space: Stack | null,
        name: string,
        type: string,
        description?: string,
        schema: ClassModel["schema"] = {}
        // parentClass: Class | null
    ) => {
        this.name = name;
        this.description = description;
        this.type = type;
        // this.attributes = [];
        // this.space = null;
        // this.id = null;
        // if (schema) {
        //     this.schema = schema;
        // }
        this.setModel({
            type, _id: name, active: true,
            name, description,
            schema, triggers: [],
        })
        // this.parentClass = parentClass;
        if (space) {
            this.space = space;
        }
        // TODO: Waiting for test of method
        // if (parentClass) this.inheritAttributes(parentClass);
    }

    
    public static get = (
        space: Stack,
        name: string,
        type: string = "class",
        description?: string,
        schema: ClassModel["schema"] = {},
    ) => {
        const class_ = new Class();
        Class.logger.info("Received schema", {schema})
        class_.init(space, name, type, description, schema);
        // Add listener for new documents of this class type
        class_.space!.onClassDoc(name)
            .on("change", (change) => {
                console.log("onClassDoc", {change})
                const evt = new CustomEvent("doc", {
                    detail: change
                })
                class_.dispatchEvent(evt);
            })
        return class_;
    }

    public static create = async (
        space: Stack,
        name: string,
        type: string = "class",
        description?: string,
        schema: ClassModel["schema"] = {},
        // parentClass: Class | null = null
    ) => {
        const class_ = Class.get(space, name, type, description, schema);
        await class_.build();
        return class_;
    }

    static buildFromModel = async (space: Stack, classModel: ClassModel) => {
        Class.logger.info("buildFromModel - Instantiate from model", {classModel});
        // let parentClassModel = (classModel.parentClass ? await space.getClassModel(classModel.parentClass) : null);
        // let parentClass = (parentClassModel ? await Class.buildFromModel(space, parentClassModel) : null);

        // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
        if (classModel._rev) {
            let classObj: Class = Class.get(
                space, classModel.name, 
                classModel.type, classModel.description,
                classModel.schema
            )
            return classObj;
        } else {
            let classObj: Class = await Class.create(space, classModel.name, classModel.type, classModel.type, classModel.schema);
            return classObj;
        }
    }

    // TODO: Decide return method
    static fetch = async ( space: Stack, className: string ) => {
        let classModel = await space.getClassModel(className);
        if ( classModel ) {
            return Class.buildFromModel(space, classModel);
        } else {
            return null;
            throw new Error("Class not found: "+className);
        }
    }

    // Inside your Class class
    hydrateSchema = (rawSchema: { [name: string]: AttributeModel }):void => {
        const zodFields: Record<string, z.ZodTypeAny> = {};

        for (const fieldName in rawSchema) {
            const attributeModel = rawSchema[fieldName];
            const { type, config } = attributeModel;
            let zodField: z.ZodTypeAny;

            switch (type) {
                // ... existing cases for 'string', 'number', 'boolean', 'date' ...
                case 'string':
                    zodField = z.string();
                    if (config.maxLength !== undefined) {
                        zodField = (zodField as z.ZodString).max(config.maxLength);
                    }
                    break;

                case 'integer':
                    zodField = z.number();
                    break;

                case 'boolean':
                    zodField = z.boolean();
                    break;

                // case 'date':
                //     zodField = z.coerce.date();
                //     break;

                // New case for 'foreign_key'
                case 'foreign_key':
                    if (!config.foreignKeyClass) {
                        throw new Error(
                            `Attribute '${fieldName}' of type 'foreign_key' is missing a 'foreignKeyClass' in its config.`
                        );
                    }

                    const foreignClass = config.foreignKeyClass;

                    // The base schema for a foreign key is always a string
                    const baseSchema = z.string();

                    // We apply the refine to the base schema
                    zodField = baseSchema.refine(
                        // The input is either a string or a string[] depending on 'isArray'
                        async (documentIdOrIds) => {
                            // Normalize the input into an array for easy processing
                            const idsToValidate = Array.isArray(documentIdOrIds) ? documentIdOrIds : [documentIdOrIds];

                            // Return true if the array is empty (no ids to validate)
                            if (idsToValidate.length === 0) {
                                return true;
                            }

                            try {
                                const stack = this.getSpace();
                                if (stack) {
                                    // Create an array of promises for each database lookup
                                    const promises = idsToValidate.map(id => stack.db.get!(id));

                                    // Await all promises. Promise.all rejects on the first error.
                                    await Promise.all(promises);

                                    // If we reach here, all documents were found
                                    return true;
                                } else throw new Error("Missing stack connection");
                            } catch (error: any) {
                                // Catching a 404 error means a document was not found
                                if (error.status === 404) {
                                    return false;
                                }
                                // For other errors, let them be thrown
                                throw error;
                            }
                        },
                        {
                            message: `One or more documents not found in class '${foreignClass}'.`,
                        }
                    );
                    break;

                default:
                    throw new Error(`Unsupported schema type: '${type}' for field '${fieldName}'`);
            }

            // These rules are applied regardless of the type, and in the correct order
            if (config.mandatory !== true) {
                zodField = zodField.optional();
            }
            if (config.isArray === true) {
                zodField = z.array(zodField);
            }

            zodFields[fieldName] = zodField;
        }

        this.schemaZOD = z.object(zodFields);
    }

    // TODO Turn into method (after factory method instantiation refactory is done)
    setId = ( id: string ) => {
        this.id = id;
    } 

    getName = () => {
        return this.name;
    }

    getSpace = () => {
        return this.space;
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
            _id:this.getName(),
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
            for (const [attributeName, attributeModel] of Object.entries(model.schema)) {
                let attribute = new Attribute(
                    this, attributeName, attributeModel.type, attributeModel.config
                );
                this.attributes[attributeName] = attribute;
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


    addAttribute = async (attribute: Attribute): Promise<Class> => {
        try {
            let name = attribute.getName();
            if (!this.hasAttribute(name)) {
                Class.logger.info("addAttribute - adding attribute", {name: name, type: attribute.getModel()});
                this.attributes[name] = attribute;
                let attributeModel = attribute.getModel();
                Class.logger.info("addAttribute - adding attribute to schema", {attributeModel: attributeModel});
                // TODO: 
                // this.schema[name] = attributeModel; // sometimes getting schema undefined
                // update class on db
                Class.logger.info("addAttribute - checking for requirements before updating class on db", {space: (this.space != null), id: this.id})
                if (this.space && this.id) {
                    Class.logger.info("addAttribute - updating class on db")
                    let res = await this.space.updateClass(this);
                    return this;
                    // TODO: Check if this class has subclasses
                } else {
                    Class.logger.error("addAttribute - class not updated on db because of missing space or id")
                    return this;
                }
            } else { 
                Class.logger.error("Attribute with name " + name + " already exists within this Class");
                return this;
            }
        } catch (e) {
            Class.logger.error("Falied adding attribute because: ", e)
            return this;
        }
    }

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    addCard = async (params: {[key:string]: any}) => {
        return await this.space!.createDoc(null, this.getName(), this, params);
    }

    addOrUpdateCard = async (params: {[key:string]: any}, cardId?: string) => {
        const fnLogger = Class.logger.child({method: "addOrUpdateCard", args: {params, cardId}});
        return new Promise<Document | null>( async (resolve, reject) => {
            if (cardId) {
                fnLogger.info("Provided document's id, performing an update");
                const res = await this.updateCard(cardId, params);
                resolve(res);
            } else {
                fnLogger.info("No document id provided, checking for PKs");
                // attempt to retrieve card by primary key
                let filter: {[key: string]:any} = {}
                let primaryKeys = this.getPrimaryKeys();
                // debugger;
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
                        reject("Other card with same PK found");
                    } else {
                        const res = await this.addCard(params);
                        resolve(res);
                    }
                } else {
                    // No primary keys defined => always adds new document
                    const res = await this.addCard(params);
                    resolve(res);
                }
            }
        });
        
    }

    updateCard = async (cardId: string, params: {[key:string]: any}) => {
        return new Promise<Document | null>( async (resolve, reject) => {
            if (this.space) {
                const res = await this.space.createDoc(cardId, this.getName(), this, params);
                resolve(res)
            } else {
                Class.logger.info("no stack defined");
                resolve(null);
            }
        })
    }

    deleteCard = async (cardId: string) => {
        const fnLogger = Class.logger.child({method: "deleteCard", args: {cardId}});
        if (this.space) {
            const res = await this.space.deleteDocument(cardId);
            return res;
        } else {
            fnLogger.error("Stack is not defined");
            return false;
        }
    }

    getCards = async (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => {
        let _selector = { ...selector, type: this.name };
        Class.logger.info("getCards - selector", {selector: _selector, fields, skip, limit})
        let docs = (await this.space!.findDocuments(_selector, fields, skip, limit)).docs
        return docs;
    }

    addTrigger = async (name: string, model: TriggerModel) => {
        const fnLogger = logger.child({method: "addTrigger"});
        try {
            const trigger = new Trigger(model, this);
            this.triggers.push(trigger);
            if (this.space) {
                this.setModel(); // [TODO] Change to buildFromModel();
                let res = await this.space.updateClass(this);
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