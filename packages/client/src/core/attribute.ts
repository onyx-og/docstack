import z, { ZodType } from "zod";
import Class from "./class";
import { Attribute as Attribute_, AttributeModel, AttributeType, ATTRIBUTE_TYPES, AttributeTypeConfig, Document } from "@docstack/shared";

class Attribute extends Attribute_ {
    name: string;
    description?: string;
    model!: AttributeModel;
    field: ZodType = z.any();
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
        this.setField();
        // if it's given a class
        // if ( classObj ) {
            // attempt to add attribute
            this.class = classObj;
        // }
    }

    public setField = () => {
        const {name, type, config} = this.model;
        let field: z.ZodType;

        switch (type) {
            // ... existing cases for 'string', 'number', 'boolean', 'date' ...
            case 'string':
                field = z.string();
                if (config.maxLength !== undefined) {
                    field = (field as z.ZodString).max(config.maxLength);
                }
                break;

            case 'integer':
                field = z.number();
                if (typeof config.min === 'number') {
                    field = (field as z.ZodNumber).min(config.min);
                }

                if (typeof config.max === 'number') {
                    field = (field as z.ZodNumber).max(config.max);
                }
                break;

            // case 'date':
            //     field = z.date();


            //     break;
            
            case 'decimal': 
                field = z.number();

                // min and max validation
                if (typeof config.min === 'number') {
                    field = (field as z.ZodNumber).min(config.min);
                }
                if (typeof config.max === 'number') {
                    field = (field as z.ZodNumber).max(config.max);
                }

                // decimal precision validation (with refinement)
                if (typeof config.precision === 'number' && config.precision >= 0) {
                    const isPrecise = (value: any) => {
                    if (typeof value !== 'number') 
                        return true;
                        const valueAsString = value.toString();
                        const decimalPart = valueAsString.split('.')[1];
                        const decimalPlaces = decimalPart ? decimalPart.length : 0;
                        return decimalPlaces <= config.precision;
                    };

                    field = field.refine(
                        isPrecise,
                        `Number cannot have more than ${config.precision} decimals.`
                    );
                }
                break;

            case 'boolean':
                field = z.boolean();
                break;

            case "object":
                field = z.object({});
                break;
            
            case 'enum':
                if (!config.values || !Array.isArray(config.values) || config.values.length === 0) {
                    throw new Error(
                        `Attribute '${name}' of type 'enum' must have a non-empty 'values' array in its config.`
                    );
                }
                const enumValues = config.values.map(v => v.value);
                field = z.enum(enumValues as [string, ...string[]]);
                break;

            case 'relation': {
                if (!config.domain || typeof config.domain !== "string") {
                    throw new Error(
                        `Attribute '${name}' of type 'relation' is missing a valid 'domain' in its config.`
                    );
                }

                const domainName = config.domain;
                const relationField = z.string().refine(
                    async (value) => {
                        if (typeof value !== "string" || value.trim().length === 0) {
                            return false;
                        }

                        if (!this.class) {
                            throw new Error("Missing class configuration for relation attribute validation");
                        }

                        const stack = this.class.getStack();
                        if (!stack) {
                            throw new Error("Missing stack connection for relation attribute validation");
                        }

                        try {
                            const relationDoc = await stack.db.get<Document>(value);
                            return relationDoc.type === domainName && relationDoc.active !== false;
                        } catch (error: any) {
                            if (error && error.status === 404) {
                                return false;
                            }
                            throw error;
                        }
                    },
                    {
                        message: `Relation document not found in domain '${domainName}'.`
                    }
                );

                field = relationField;
                break;
            }

            case 'foreign_key':
                if (!config.targetClass) {
                    throw new Error(
                        `Attribute '${name}' of type 'foreign_key' is missing a 'targetClass' in its config.`
                    );
                }

                const foreignClass = config.targetClass;
                const baseSchema = z.string();

                field = baseSchema.refine(
                    async (documentIdOrIds: string | string[]) => {
                        const idsToValidate = Array.isArray(documentIdOrIds) ? documentIdOrIds : [documentIdOrIds];
                        if (idsToValidate.length === 0) {
                            return true;
                        }

                        try {
                            if (this.class) {
                                const stack = this.class.getStack();
                                if (stack) {
                                    const promises = idsToValidate.map(id => stack.db.get!(id));
                                    await Promise.all(promises);
                                    return true;
                                } else throw new Error("Missing stack connection");
                            } else throw new Error("Missing class parentship");
                        } catch (error: any) {
                            if (error.status === 404) {
                                return false;
                            }
                            throw error;
                        }
                    },
                    {
                        message: `One or more documents not found in class '${foreignClass}'.`,
                    }
                );
                break;

            default:
                throw new Error(`Unsupported schema type: '${type}' for field '${name}'`);
        }

        // These rules are applied regardless of the type, and in the correct order
        if (config.defaultValue) {
            field = field.default(config.defaultValue);
        }
        if (config.mandatory !== true) {
            field = field.optional();
        }
        if (config.isArray === true) {
            field = z.array(field);
        }

        this.field = field;
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

    isMandatory = () => {
        return !!this.model.config.mandatory;
    }

    getModel = () => {
        return this.model;
    }

    getClass = () => {
        if (this.class) return this.class
        else throw Error("Missing class configuration for this attribute");
    }
    
    public validate = async (data: any): Promise<z.ZodSafeParseResult<unknown>> => {
        return this.field.safeParseAsync(data);
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

    getEmpty = () => {
        // Let the field handle the default value, if present
        // if not, it's undefined
        const partialDoc = {
            [this.name]: this.field.parse(undefined) || null
        }
        return partialDoc;
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
            case "object":
                config = Object.assign({ isArray: false }, config ) as AttributeTypeConfig;
            break;
            case "date":
                config = Object.assign({ format: "iso", max: null, min: null, isArray: false}, config) as AttributeTypeConfig;
            break;
            case "boolean":
                config = Object.assign({ defaultValue: false, isArray: false}, config) as AttributeTypeConfig;
            break;
            case "foreign_key":
                config = Object.assign({ targetClass: null, isArray: false}, config) as AttributeTypeConfig;
            break;
            case "enum":
                config = Object.assign({ values: [], isArray: false}, config) as AttributeTypeConfig;
            break;
            case "relation":
                config = Object.assign({ domain: null, isArray: false }, config) as AttributeTypeConfig;
            break;
            default:
                throw new Error("Unexpected type: "+type);
                // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
        }
        return config
    }
}

export default Attribute;