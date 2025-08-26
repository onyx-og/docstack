import { Class as Class_ } from "@docstack/shared";
import {serverLogger} from "../logger";
// import ReferenceAttribute from '../Reference';
import {Stack, ClassModel, AttributeModel, Document} from "@docstack/shared";
import Attribute from "./attribute";
import { Logger } from 'winston';

class Class extends Class_ {
    space: Stack | null = null;
    /* Populated in init() */
    name!: string;
    /* Populated in init() */
    type!: string;
    description?: string;
    attributes: Attribute[] = [];
    schema!: AttributeModel[]
    id?: string;
    // parentClass: Class | null;
    model!: ClassModel;
    static logger: Logger = serverLogger.child({module: "class"});

    getPrimaryKeys() {
        return this.attributes.filter( attr => attr.isPrimaryKey() )
            .map( attr => attr.getName() );
    }

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
                if (classModel) {
                    this.setModel(classModel)
                    this.logger.info("build - classModel", {classModel: classModel})
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
        description: string,
        // parentClass: Class | null
    ) => {
        this.name = name;
        this.description = description;
        this.type = type;
        this.attributes = [];
        this.space = null;
        // this.id = null;
        this.schema = [];
        // this.parentClass = parentClass;
        if (space) {
            this.space = space;
        }
        // TODO: Waiting for test of method
        // if (parentClass) this.inheritAttributes(parentClass);
    }

    public static create = async (
        space: Stack,
        name: string,
        type: string = "class",
        description: string,
        // parentClass: Class | null = null
    ) => {
        const _class = new Class();
        _class.init(space, name, type, description);
        await _class.build()
        return _class;
    }

    static buildFromModel = async (space: Stack, classModel: ClassModel) => {
        this.logger.info("buildFromModel - Instantiate from model", {classModel});
        // let parentClassModel = (classModel.parentClass ? await space.getClassModel(classModel.parentClass) : null);
        // let parentClass = (parentClassModel ? await Class.buildFromModel(space, parentClassModel) : null);

        // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
        let classObj: Class = await Class.create(space, classModel.name, classModel.type, classModel.type);
        // [TODO] Redundancy: classObj.setModel updates the model again from the one provided
        classObj.setModel(classModel);
        return classObj;
    }

    static fetch = async ( space: Stack, className: string ) => {
        let classModel = await space.getClassModel(className);
        if ( classModel ) {
            return Class.buildFromModel(space, classModel);
        } else {
            throw new Error("Class not found: "+className);
        }
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
        let schema: AttributeModel[] = [];
        for ( let attribute of this.getAttributes() ) {
            let attributeModel = attribute.getModel();
            schema.push( attributeModel );
        }
        this.schema = schema;
        return schema;
    }

    getModel = () => {
        let model: ClassModel = {
            _id:this.getName(),
            name: this.getName(),
            description: this.getDescription(),
            type: this.getType(),
            schema: this.buildSchema(),
            _rev: this.model ? this.model._rev : "", // [TODO] Error prone
            createTimestamp: this.model ? this.model.createTimestamp : undefined,
        };
        return model;
    }

    // Set model should be called only after fetching the latest model from db
    setModel = ( model: ClassModel ) => {
        this.logger.info("setModel - got incoming model", {model: model});
        // Retreive current class model
        let currentModel = this.getModel();
        // Set model arg to the overwrite of the current model with the given one 
        model = Object.assign(currentModel, model);
        if (model.schema) {
            this.schema = this.schema || []
            // model.schema = [ ...model.schema, ...(this.schema)]
            // Create a Map from the current (this.schema) for efficient lookup
            const schemaMap = new Map(this.schema.map(item => [item.name, item]));
            // Iterate over the provided (model.schema) array and add/update items in the Map
            model.schema.forEach(item => {
                schemaMap.set(item.name, item); // This will overwrite existing keys
            });

            // Convert the Map values back to the model schema
            model.schema = Array.from(schemaMap.values());
            // let _model = Object.assign(currentModel, {...model, schema: this.schema});
            this.attributes = []
            for (let attribute of model.schema) {
                let _attribute = new Attribute(
                    this, attribute.name, attribute.type, attribute.config
                );
                this.attributes.push(_attribute);
            }
        }
        
        
        //     this.addAttribute(attribute.name, attribute.type);
        // }
        // this.model = {...this.model, ...model};
        this.name = model.name;
        this.description = model.description;
        this.logger.info("setModel - model after processing",{ model: model})
    }

    getAttributes = ( ...names: string[] ) => {
        let attributes: Attribute[] = [ ];
        for ( let attribute of this.attributes ) {
            if ( names.length > 0 ) {
                // filter with given names
                for ( let name of names ) {
                    // match?
                    if ( name != null && attribute.getName() == name ) {
                        return [ attribute ];
                    } 
                }
            } else attributes.push(attribute); // no filter, add all
        }
        return attributes
    }

    hasAllAttributes = ( ...names: string[] ) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of attributes ) {
            result = names.includes(attribute.getName())
            if ( !result ) break;
        }
        return result;
    }

    hasAnyAttributes = ( ...names: string[] ) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of attributes ) {
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
        return new Promise(async (resolve, reject) => {
            try {
                let name = attribute.getName();
                if (!this.hasAttribute(name)) {
                    this.logger.info("addAttribute - adding attribute", {name: name, type: attribute.getModel()})
                    this.attributes.push(attribute);
                    let attributeModel = attribute.getModel();
                    this.logger.info("addAttribute - adding attribute to schema", {attributeModel: attributeModel})
                    this.schema.push(attributeModel); // sometimes getting schema undefined
                    // update class on db
                    this.logger.info("addAttribute - checking for requirements before updating class on db", {space: (this.space != null), id: this.id})
                    if (this.space && this.id) {
                        this.logger.info("addAttribute - updating class on db")
                        let res = await this.space.updateClass(this);
                        resolve(this)
                        // TODO: Check if this class has subclasses
                        // if ( this.class ) 
                    } else {
                        this.logger.info("addAttribute - class not updated on db because of missing space or id")
                        resolve(this)
                    }
                } else reject("Attribute with name " + name + " already exists within this Class")
            } catch (e) {
                this.logger.info("Falied adding attribute because: ", e)
                reject(e)
            }
        });
    }

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    addCard = async (params: {[key:string]: any}) => {
        return await this.space!.createDoc(null, this.getName(), this, params);
    }

    addOrUpdateCard = async (params: {[key:string]: any}, cardId?: string) => {
        return new Promise<Document | null>( async (resolve, reject) => {
            if (cardId) {
                const res = await this.updateCard(cardId, params);
                resolve(res);
            }
            this.logger.info("addOrUpdateCard - received params", {params});
            // attempt to retrieve card by primary key
            let filter: {[key: string]:any} = {}
            let primaryKeys = this.getPrimaryKeys();
            this.logger.info("addOrUpdateCard - got primary keys", {primaryKeys});
            // executes a reducer function on each element of the primaryKeys array
            // that sets each primary key prop to the corresponding param value 
            primaryKeys.reduce(
                (accumulator, currentValue) => accumulator[currentValue] = params[currentValue],
                filter,
            );
            let cards = await this.getCards(filter, undefined, 0, 1);
            if (cards.length > 0) {
                const res = await this.updateCard(cards[0]._id, params);
                resolve(res);
            } else {
                const res = await this.addCard(params);
                resolve(res);
            }
        });
        
    }

    updateCard = async (cardId: string, params: {[key:string]: any}) => {
        return new Promise<Document | null>( async (resolve, reject) => {
            if (this.space) {
                const res = await this.space.createDoc(cardId, this.getName(), this, params);
                resolve(res)
            } else {
                this.logger.info("no stack defined");
                resolve(null);
            }
        })
    }

    getCards = async (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => {
        let _selector = { ...selector, type: this.name };
        this.logger.info("getCards - selector", {selector: _selector, fields, skip, limit})
        let docs = (await this.space!.findDocuments(_selector, fields, skip, limit)).docs
        return docs;
    }
}

export default Class;