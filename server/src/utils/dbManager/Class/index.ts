import Attribute, { AttributeModel, AttributeType } from '../Attribute'
import Surfer, { Document } from '../Surfer';
// import DbManager from '..';
import getLogger from "../../../utils/logger";
// import ReferenceAttribute from '../Reference';

const logger = getLogger().child({module: "Surfer"})

const CLASS_TYPE = "class";
const SUPERCLASS_TYPE = "superclass";
const CLASS_TYPES = [CLASS_TYPE, SUPERCLASS_TYPE];

export type ClassModel = Document & {
    type: string,
    name: string,
    description: string,
    parentClass?: string,
    schema?: AttributeModel[]
    
}
class Class {
    private space?: Surfer | null;
    private name: string;
    private type: string;
    private description: string;
    private attributes: Attribute[];
    private schema: AttributeModel[]
    private id: string | null;
    // private parentClass: Class | null;
    private model: ClassModel;

    getPrimaryKeys() {
        return this.attributes.filter( attr => attr.isPrimaryKey() )
            .map( attr => attr.getName() );
    }

    private constructor() {
        // Private constructor to prevent direct instantiation
    }

    // TODO: Test
    /*
    inheritAttributes( parentClass: Class ) {
        let parentAttributes = parentClass.getAttributes();
        for ( let attribute of parentAttributes ) {
            this.addAttribute(attribute);
        }
    } */

    private async build(): Promise<Class> {
        return new Promise(async (resolve, reject) => {
            let space = this.getSpace();
            if ( space ) {
                // if (parentClassName) this.setParentClass(parentClassName);
                let classModel = await space.addClass(this);
                this.setModel(classModel)
                logger.info("build - classModel", {classModel: classModel})
                this.setId(classModel._id);
                resolve(this);
            } else {
                reject("Missing db configuration");
            }
        })
    }

    private init(
        space: Surfer | null,
        name: string,
        type: string,
        description: string,
        // parentClass: Class | null
    ) {
        this.name = name;
        this.description = description;
        this.type = type;
        this.attributes = [];
        this.space = null;
        this.id = null;
        this.schema = [];
        // this.parentClass = parentClass;
        if (space) {
            this.space = space;
        }
        // TODO: Waiting for test of method
        // if (parentClass) this.inheritAttributes(parentClass);
    }

    public static async create(
        space: Surfer,
        name: string,
        type: string = "class",
        description: string,
        // parentClass: Class | null = null
    ) {
        const _class = new Class();
        _class.init(space, name, type, description);
        await _class.build()
        return _class;
    }

    static async buildFromModel(space: Surfer, classModel: ClassModel) {
        // let parentClassModel = (classModel.parentClass ? await space.getClassModel(classModel.parentClass) : null);
        // let parentClass = (parentClassModel ? await Class.buildFromModel(space, parentClassModel) : null);
        let classObj: Class = await Class.create(space, classModel.name, classModel.type, classModel.type);
        classObj.setModel(classModel);
        return classObj;
    }

    static async fetch( space: Surfer, className: string ) {
        let classModel = await space.getClassModel(className);
        if ( classModel ) {
            return Class.buildFromModel(space, classModel);
        } else {
            throw new Error("Class not found: "+className);
        }
    }

    // TODO Turn into private method (after factory method instantiation refactory is done)
    setId( id: string ) {
        this.id = id;
    } 

    getName() {
        return this.name;
    }

    getSpace() {
        return this.space;
    }

    getDescription() {
        return this.description;
    }

    getType() {
        return this.type;
    }

    getId() {
        return this.id;
    }

    buildSchema() {
        let schema = [];
        for ( let attribute of this.getAttributes() ) {
            let attributeModel = attribute.getModel();
            schema.push( attributeModel );
        }
        this.schema = schema;
        return schema;
    }

    getModel() {
        let model: ClassModel = {
            _id:this.getName(),
            name: this.getName(),
            description: this.getDescription(),
            type: this.getType(),
            schema: this.buildSchema(),
            _rev: this.model ? this.model._rev : undefined,
            createTimestamp: this.model ? this.model.createTimestamp : undefined,
        };
        return model;
    }

    // Set model should be called only after fetching the latest model from db
    private setModel( model: ClassModel ) {
        logger.info("setModel - got incoming model", {model: model})
        let currentModel = this.getModel();
        model = Object.assign(currentModel, model);
        this.schema = this.schema || []
        model.schema = [ ...model.schema, ...(this.schema)]
        // let _model = Object.assign(currentModel, {...model, schema: this.schema});
        this.attributes = []
        for (let attribute of model.schema) {
            let _attribute = new Attribute(
                this, attribute.name, attribute.type, attribute.config
            );
            this.attributes.push(_attribute);
        }
        //     this.addAttribute(attribute.name, attribute.type);
        // }
        // this.model = {...this.model, ...model};
        this.name = model.name;
        this.description = model.description;
        logger.info("setModel - model after processing",{ model: model})
    }

    getAttributes( ...names: string[] ) {
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

    hasAllAttributes( ...names: string[] ) {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of attributes ) {
            result = names.includes(attribute.getName())
            if ( !result ) break;
        }
        return result;
    }

    hasAnyAttributes( ...names: string[] ) {
        let result = false;
        let attributes = this.getAttributes(...names);
        for ( let attribute of attributes ) {
            result = names.includes(attribute.getName())
            if ( result ) break;
        }
        return result;
    }

    // interface of hasAnyAttributes
    hasAttribute( name: string ) {
        return this.hasAnyAttributes( name )
    }

    /*
    async addReferenceAttribute( attribute: ReferenceAttribute ) {
        return this.addAttribute(attribute)
    }*/
    /*
    async addAttribute(nameOrAttribute: string | Attribute, type?: AttributeType["type"]) {
        try {
            let attribute: Attribute;
            if (typeof nameOrAttribute === 'string' && type) {
                attribute = new Attribute(this, nameOrAttribute, type);
            } else if (nameOrAttribute instanceof ReferenceAttribute) {
                let _attribute = nameOrAttribute as ReferenceAttribute;
                // check if the target domain exists
                let targetDomain = _attribute.domain;
                if (this.space && (await this.space.getDomain(targetDomain)) != null) {
                    attribute = _attribute;
                } else if (!this.space) {
                    throw new Error("Missing db configuration");
                } else {
                    throw new Error("Target domain not found: " + targetDomain);
                }
            } else if (nameOrAttribute instanceof Attribute) {
                attribute = nameOrAttribute;
            } else {
                throw new Error('Invalid arguments');
            }

            let name = attribute.getName();
            if (!this.hasAttribute(name)) {
                logger.info("addAttribute - adding attribute", {name: name, type: type})
                this.attributes.push(attribute);
                let attributeModel = attribute.getModel();
                logger.info("addAttribute - adding attribute to schema", {attributeModel: attributeModel})
                this.schema.push(attributeModel); // sometimes getting schema undefined
                // update class on db
                logger.info("addAttribute - checking for requirements before updating class on db", {space: (this.space != null), id: this.id})
                if (this.space && this.id) {
                    logger.info("addAttribute - updating class on db")
                    await this.space.updateClass(this);
                    // TODO: Check if this class has subclasses
                    // if ( this.class ) 
                }
                return this; // return class object
            } else throw Error("Attribute with name " + name + " already exists within this Class")
        } catch (e) {
            logger.info("Falied adding attribute because: ", e)
        }
    } */

    async addAttribute(attribute: Attribute): Promise<Class> {
        return new Promise(async (resolve, reject) => {
            try {
                /*
                else if (nameOrAttribute instanceof ReferenceAttribute) {
                    let _attribute = nameOrAttribute as ReferenceAttribute;
                    // check if the target domain exists
                    let targetDomain = _attribute.domain;
                    if (this.space && (await this.space.getDomain(targetDomain)) != null) {
                        attribute = _attribute;
                    } else if (!this.space) {
                        reject("Missing db configuration");
                    } else {
                        reject("Target domain not found: " + targetDomain);
                    }
                } */
                let name = attribute.getName();
                if (!this.hasAttribute(name)) {
                    logger.info("addAttribute - adding attribute", {name: name, type: attribute.getModel()})
                    this.attributes.push(attribute);
                    let attributeModel = attribute.getModel();
                    logger.info("addAttribute - adding attribute to schema", {attributeModel: attributeModel})
                    this.schema.push(attributeModel); // sometimes getting schema undefined
                    // update class on db
                    logger.info("addAttribute - checking for requirements before updating class on db", {space: (this.space != null), id: this.id})
                    if (this.space && this.id) {
                        logger.info("addAttribute - updating class on db")
                        let res = await this.space.updateClass(this);
                        resolve(this)
                        // TODO: Check if this class has subclasses
                        // if ( this.class ) 
                    } else {
                        logger.info("addAttribute - class not updated on db because of missing space or id")
                        resolve(this)
                    }
                } else reject("Attribute with name " + name + " already exists within this Class")
            } catch (e) {
                logger.info("Falied adding attribute because: ", e)
                reject(e)
            }
        });
    }

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    async addCard(params: {[key:string]: any}) {
        return await this.space.createDoc(null, this.getName(), this, params);
    }

    async addOrUpdateCard(params: {[key:string]: any}, cardId?: string) {
        if (cardId) return this.updateCard(cardId, params);

        // attempt to retrieve card by primary key
        let filter = {}
        this.getPrimaryKeys().reduce(
            (accumulator, currentValue) => accumulator[currentValue] = params[currentValue],
            filter,
        );
        let cards = await this.getCards(filter, null, 0, 1);
        if (cards.length > 0) { 
            return this.updateCard(cards[0]._id, params);
        } else {
            return this.addCard(params);
        }
    }

    async updateCard(cardId: string, params: {[key:string]: any}) {
        return await this.space.createDoc(cardId, this.getName(), this, params);
    }

    async getCards(selector, fields, skip, limit) {
        let _selector = { ...selector, type: this.name };
        logger.info("getCards - selector", {selector: _selector, fields, skip, limit})
        let docs = (await this.space.findDocuments(_selector, fields, skip, limit)).docs
        return docs;
    }
}

export default Class;