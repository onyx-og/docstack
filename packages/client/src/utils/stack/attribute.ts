import Class from "./class";
import { Attribute as Attribute_, AttributeModel, AttributeType, ATTRIBUTE_TYPES, AttributeTypeConfig } from "@docstack/shared";

class Attribute extends Attribute_ {
    name: string;
    description?: string;
    model!: AttributeModel;
    class: Class | null;
    defaultValue?: any;
    
    constructor(classObj: Class | null = null, name: string, type: AttributeType["type"], description?: string, config?: AttributeType["config"] ) {
        super(classObj, name, type, config);
        this.name = name;
        this.description = description;
        this.setModel({
            name: this.name,
            description: this.description,
            type: this.getType(type),
            config: this.getTypeConf(type, config) || {},
        });
        // if it's given a class
        // if ( classObj ) {
            // attempt to add attribute
            this.class = classObj;
        // }
    }

    public static async create(
        classObj: Class,
        name: string,
        type: AttributeType["type"],
        description?: string,
        config?: AttributeType["config"] 
    ) {
        const attribute = new Attribute(classObj, name, type, description, config);
        await Attribute.build(attribute)
        return attribute;
    }

    isPrimaryKey = () => {
        let model = this.getModel();
        return !!model.config.primaryKey;
    }

    getModel = () => {
        return this.model;
    }

    getClass = () => {
        if (this.class) return this.class
        else throw Error("Missing class configuration for this attribute");
    }

    static build = async ( attributeObj: Attribute ) => {
        let classObj = attributeObj.getClass();
        let store = classObj.getStack();
        if ( store ) {
            await classObj.addAttribute(attributeObj);
            return attributeObj;
        } else {
            throw new Error("Missing db configuration");
        }
    }

    setModel = ( model: AttributeModel ) => {
        let currentModel = this.getModel();
        model = Object.assign(currentModel || {}, model);
        this.model = model;
        this.defaultValue = model.config.defaultValue;
    }
    
    // TODO: Better define config
    getType = ( type: AttributeType["type"]) => {
        if ( this.checkTypeValidity(type) ) {
            return type
        } else throw Error("Invalid attribute type: "+type)
        // return this?
    }

    // getType()

    getName = () => {
        return this.name;
    }

    checkTypeValidity = (type: string) => {
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
    getTypeConf = ( type: AttributeType["type"], config: AttributeType["config"] | undefined ) => {
        switch( type ) {
            // TODO: add missing cases and change values to imported const 
            case "decimal":
                config = Object.assign({ max: null, min: null, precision: null, isArray: false}, config) as AttributeTypeConfig;
            break;
            case "integer":
                config = Object.assign({ max: null, min: null, isArray: false}, config) as AttributeTypeConfig;
            break;
            case "string":
                config = Object.assign({ maxLength: 50, isArray: false }, config ) as AttributeTypeConfig;
            break;
            default:
                throw new Error("Unexpected type: "+type);
                // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
        }
        return config
    }
}

export default Attribute;