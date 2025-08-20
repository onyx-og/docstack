import Class from "../Class";
// import { AttributeTypeReference } from "../Reference";

const ATTRIBUTE_TYPES = ["string", "number", "integer", "reference", "boolean"];

export type AttributeTypeConfig = {
    isArray?: boolean,
    primaryKey?: boolean,
    mandatory?: boolean,
    defaultValue?: any,
    [key: string]: any
}
export type AttributeTypeDecimal = {
    type: "decimal",
    name: string,
    config: {max?: number, min?: number, precision?: number} & AttributeTypeConfig
}
export type AttributeTypeInteger = {
    type: "integer",
    name: string,
    config: {max?: number, min?: number} & AttributeTypeConfig
}
export type AttributeTypeString = {
    name: string,
    type: "string",
    config: {maxLength?: number, encrypted?: boolean} & AttributeTypeConfig
}

export type AttributeTypeBoolean = {
    type: "boolean",
    name: string,
    config: {default?: boolean} & AttributeTypeConfig
}
export type AttributeTypeForeignKey = {
    type: "foreign_key",
    name: string,
    config: {} & AttributeTypeConfig
}
export type AttributeType = AttributeTypeString | AttributeTypeInteger | 
    AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey;
export type AttributeModel = {
    name: string,
    config: AttributeType["config"],
    type: AttributeType["type"] 
}
class Attribute {
    name: string;
    model: AttributeModel;
    class: Class;
    defaultValue?: any;
    
    constructor(classObj: Class = null, name: string, type: AttributeType["type"], config?: AttributeType["config"] ) {
        this.name = name;
        this.setModel({
            name: this.name,
            type: this.getType(type),
            config: this.getTypeConf(type, config),
        });
        // if it's given a class
        if ( classObj ) {
            // attempt to add attribute
            this.class = classObj;
        }
    }

    public static async create(
        classObj: Class = null,
        name: string,
        type: AttributeType["type"],
        config?: AttributeType["config"] 
    ) {
        const attribute = new Attribute(classObj, name, type, config);
        await Attribute.build(attribute)
        return attribute;
    }

    isPrimaryKey() {
        let model = this.getModel();
        return model.config.primaryKey;
    }

    getModel() {
        return this.model;
    }

    getClass() {
        if (this.class) return this.class
        else throw Error("Missing class configuration for this attribute");
    }

    static async build( attributeObj: Attribute ) {
        let classObj = attributeObj.getClass();
        let surfer = classObj.getSpace();
        if ( surfer ) {
            await classObj.addAttribute(attributeObj);
            return attributeObj;
        } else {
            throw new Error("Missing db configuration");
        }
    }

    setModel( model: AttributeModel ) {
        let currentModel = this.getModel();
        model = Object.assign(currentModel || {}, model);
        this.model = model;
        this.defaultValue = model.config.defaultValue;
    }
    
    // TODO: Better define config
    getType( type: AttributeType["type"]) {
        if ( this.checkTypeValidity(type) ) {
            return type
        } else throw Error("Invalid attribute type: "+type)
        // return this?
    }

    // getType()

    getName() {
        return this.name;
    }

    checkTypeValidity(type) {
        let validity = false;
        if ( ATTRIBUTE_TYPES.includes(type) ) {
            validity = true;
        }
        return validity;
    }

    // TODO: change to imported const default configs for types
    // as of now it accepts only string
    // TODO: since config depends on attribute's type, 
    // find a way to check if given configs are correct
    // find a way to add default configs base on type
    getTypeConf( type: AttributeType["type"], config: AttributeType["config"] ) {
        switch( type ) {
            // TODO: add missing cases and change values to imported const 
            case "decimal":
                config = Object.assign({ max: null, min: null, precision: null, isArray: false}, config);
            break;
            case "integer":
                config = Object.assign({ max: null, min: null, isArray: false}, config);
            break;
            case "string":
                config = Object.assign({ maxLength: 50, isArray: false }, config );
            break;
            default:
                throw new Error("Unexpected type: "+type);
                // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
        }
        return config
    }
}

export default Attribute;