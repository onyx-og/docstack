var _a;
import z from "zod";
import { Attribute as Attribute_, ATTRIBUTE_TYPES } from "@docstack/shared";
class Attribute extends Attribute_ {
    constructor(classObj = null, name, type, description, config) {
        super(classObj, name, type, config);
        this.field = z.any();
        this.setField = () => {
            const { name, type, config } = this.model;
            let field;
            switch (type) {
                // ... existing cases for 'string', 'number', 'boolean', 'date' ...
                case 'string':
                    field = z.string();
                    if (config.maxLength !== undefined) {
                        field = field.max(config.maxLength);
                    }
                    break;
                case 'integer':
                    field = z.number();
                    if (typeof config.min === 'number') {
                        field = field.min(config.min);
                    }
                    if (typeof config.max === 'number') {
                        field = field.max(config.max);
                    }
                    break;
                // case 'date':
                //     field = z.date();
                //     break;
                case 'decimal':
                    field = z.number();
                    // min and max validation
                    if (typeof config.min === 'number') {
                        field = field.min(config.min);
                    }
                    if (typeof config.max === 'number') {
                        field = field.max(config.max);
                    }
                    // decimal precision validation (with refinement)
                    if (typeof config.precision === 'number' && config.precision >= 0) {
                        const isPrecise = (value) => {
                            if (typeof value !== 'number')
                                return true;
                            const valueAsString = value.toString();
                            const decimalPart = valueAsString.split('.')[1];
                            const decimalPlaces = decimalPart ? decimalPart.length : 0;
                            return decimalPlaces <= config.precision;
                        };
                        field = field.refine(isPrecise, `Number cannot have more than ${config.precision} decimals.`);
                    }
                    break;
                case 'boolean':
                    field = z.boolean();
                    break;
                case 'foreign_key':
                    if (!config.targetClass) {
                        throw new Error(`Attribute '${name}' of type 'foreign_key' is missing a 'targetClass' in its config.`);
                    }
                    const foreignClass = config.targetClass;
                    const baseSchema = z.string();
                    field = baseSchema.refine(async (documentIdOrIds) => {
                        const idsToValidate = Array.isArray(documentIdOrIds) ? documentIdOrIds : [documentIdOrIds];
                        if (idsToValidate.length === 0) {
                            return true;
                        }
                        try {
                            if (this.class) {
                                const stack = this.class.getStack();
                                if (stack) {
                                    const promises = idsToValidate.map(id => stack.db.get(id));
                                    await Promise.all(promises);
                                    return true;
                                }
                                else
                                    throw new Error("Missing stack connection");
                            }
                            else
                                throw new Error("Missing class parentship");
                        }
                        catch (error) {
                            if (error.status === 404) {
                                return false;
                            }
                            throw error;
                        }
                    }, {
                        message: `One or more documents not found in class '${foreignClass}'.`,
                    });
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
        };
        this.isPrimaryKey = () => {
            let model = this.getModel();
            return !!model.config.primaryKey;
        };
        this.isMandatory = () => {
            return !!this.model.config.mandatory;
        };
        this.getModel = () => {
            return this.model;
        };
        this.getClass = () => {
            if (this.class)
                return this.class;
            else
                throw Error("Missing class configuration for this attribute");
        };
        this.validate = async (data) => {
            return this.field.safeParseAsync(data);
        };
        this.setModel = (model) => {
            let currentModel = this.getModel();
            model = Object.assign(currentModel || {}, model);
            this.model = model;
            this.defaultValue = model.config.defaultValue;
        };
        // TODO: Better define config
        this.getType = (type) => {
            if (this.checkTypeValidity(type)) {
                return type;
            }
            else
                throw Error("Invalid attribute type: " + type);
            // return this?
        };
        this.getEmpty = () => {
            // Let the field handle the default value, if present
            // if not, it's undefined
            const partialDoc = {
                [this.name]: this.field.parse(undefined) || null
            };
            return partialDoc;
        };
        // getType()
        this.getName = () => {
            return this.name;
        };
        this.checkTypeValidity = (type) => {
            let validity = false;
            if (ATTRIBUTE_TYPES.includes(type)) {
                validity = true;
            }
            return validity;
        };
        // TODO: change to imported const default configs for types
        // as of now it accepts only string
        // TODO: since config depends on attribute's type, 
        // find a way to check if given configs are correct
        // find a way to add default configs base on type
        this.getTypeConf = (type, config) => {
            switch (type) {
                // TODO: add missing cases and change values to imported const 
                case "decimal":
                    config = Object.assign({ max: null, min: null, precision: null, isArray: false }, config);
                    break;
                case "integer":
                    config = Object.assign({ max: null, min: null, isArray: false }, config);
                    break;
                case "string":
                    config = Object.assign({ maxLength: 50, isArray: false }, config);
                    break;
                default:
                    throw new Error("Unexpected type: " + type);
                // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
            }
            return config;
        };
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
    static async create(classObj, name, type, description, config) {
        const attribute = new _a(classObj, name, type, description, config);
        await _a.build(attribute);
        return attribute;
    }
}
_a = Attribute;
Attribute.build = async (attributeObj) => {
    let classObj = attributeObj.getClass();
    let store = classObj.getStack();
    if (store) {
        await classObj.addAttribute(attributeObj);
        return attributeObj;
    }
    else {
        throw new Error("Missing db configuration");
    }
};
export default Attribute;
//# sourceMappingURL=attribute.js.map