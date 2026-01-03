import z, { ZodType, SafeParseReturnType } from "zod";
import Class from "./class.js";
import { Attribute as Attribute_, AttributeModel, AttributeType, ATTRIBUTE_TYPES, AttributeTypeConfig, AttributeTypeReference } from "@docstack/shared";

/**
 * Represents a single attribute (field) within a Class schema.
 * 
 * Attributes define the structure of documents, including their type,
 * validation rules (via Zod), and configuration options like mandatory,
 * default values, primary keys, and foreign key references.
 * 
 * Use the static factory method {@link Attribute.create} to instantiate
 * attributes with proper validation and persistence.
 * 
 * @example
 * ```typescript
 * // Create a string attribute
 * const titleAttr = await Attribute.create(taskClass, 'title', 'string', 'Task Title', {
 *     mandatory: true,
 *     maxLength: 200
 * });
 * 
 * // Create a foreign key reference
 * const assigneeAttr = await Attribute.create(taskClass, 'assigneeId', 'foreign_key', 'Assigned User', {
 *     targetClass: 'User'
 * });
 * ```
 * 
 * @extends Attribute_
 */
class Attribute extends Attribute_ {
    /** The attribute name used as the document field key. */
    name: string;
    /** Optional description explaining the attribute's purpose. */
    description?: string;
    /** The underlying AttributeModel containing type and configuration. */
    model!: AttributeModel;
    /** Zod schema for runtime validation of this field. */
    field: any = z.any();
    /** Reference to the parent Class that owns this attribute. */
    class: Class | null;
    /** Default value to use when the field is not provided. */
    defaultValue?: any;

    /**
     * Creates a new Attribute instance.
     * For most use cases, prefer using {@link Attribute.create} which also persists the attribute.
     * 
     * @param classObj - The parent Class for this attribute
     * @param name - The attribute name
     * @param type - The attribute type (e.g., 'string', 'integer', 'boolean', 'enum')
     * @param description - Optional description
     * @param config - Type-specific configuration options
     */
    constructor(classObj: Class | null = null, name: string, type: AttributeType["type"], description?: string, config?: AttributeType["config"]) {
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
        this.class = classObj;
    }

    /**
     * Validates that reference-type attributes have proper domain configuration.
     * Called automatically during {@link Attribute.create}.
     * @throws Error if the reference configuration is invalid
     */
    ensureReferenceConfigIsValid = async () => {
        if (this.model.type !== "reference") {
            return;
        }
        if (!this.class) {
            throw new Error(`Attribute '${this.name}' must belong to a class to validate reference configuration.`);
        }
        const stack = this.class.getStack();
        if (!stack) {
            throw new Error(`Class '${this.class.getName()}' is not attached to a stack.`);
        }
        const config = this.model.config as AttributeTypeReference["config"];
        const domainName = config.domain;
        if (typeof domainName !== "string" || domainName.length === 0) {
            throw new Error(`Attribute '${this.name}' of type 'reference' must declare a domain.`);
        }
        if (config.isArray) {
            throw new Error(`Attribute '${this.name}' of type 'reference' cannot be an array.`);
        }
        const domain = await stack.getDomain(domainName);
        if (!domain) {
            throw new Error(`Domain '${domainName}' was not found for attribute '${this.name}'.`);
        }
        const classId = this.class.id;
        switch (domain.relation) {
            case "1:N":
                if (classId !== domain.targetClass.id) {
                    throw new Error(`Given classId '${classId}' Reference attributes for domain '${domainName}' can only be added to class '${domain.targetClass}'.`);
                }
                break;
            case "N:1":
                if (classId !== domain.sourceClass.id) {
                    throw new Error(`Given classId '${classId}' Reference attributes for domain '${domainName}' can only be added to class '${domain.sourceClass}'.`);
                }
                break;
            case "1:1":
                if (classId !== domain.sourceClass.id && classId !== domain.targetClass.id) {
                    throw new Error(`Class '${classId}' is not part of domain '${domainName}'.`);
                }
                break;
            case "N:N":
                throw new Error(`Domain '${domainName}' does not support reference attributes.`);
            default:
                throw new Error(`Unsupported relation '${domain.relation}' for domain '${domainName}'.`);
        }
    }

    /**
     * Builds the Zod validation schema based on attribute type and configuration.
     * Called automatically during construction.
     */
    public setField = () => {
        const { name, type, config } = this.model;
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
                                    const fetchResult = await Promise.all(promises);
                                    return true;
                                } else throw new Error("Missing stack connection");
                            } else throw new Error("Missing class parentship");
                        } catch (error: any) {
                            if (error.status === 404) {
                                console.error(`Foreign key validation failed: document not found in class '${foreignClass}'. ${this.class?.getName()}`, { error });
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

            case 'reference':
                field = z.string().min(1);
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

    /**
     * Creates a new Attribute and persists it to the parent Class.
     * This is the primary factory method for creating attributes.
     * 
     * @param classObj - The parent Class to add the attribute to
     * @param name - The attribute name
     * @param type - The attribute type
     * @param description - Optional description
     * @param config - Type-specific configuration
     * @returns The created Attribute instance
     * 
     * @example
     * ```typescript
     * const priceAttr = await Attribute.create(productClass, 'price', 'decimal', 'Product price', {
     *     min: 0,
     *     precision: 2,
     *     mandatory: true
     * });
     * ```
     */
    public static async create(
        classObj: Class,
        name: string,
        type: AttributeType["type"],
        description?: string,
        config?: AttributeType["config"]
    ) {
        const attribute = new Attribute(classObj, name, type, description, config);
        await attribute.ensureReferenceConfigIsValid();
        await Attribute.build(attribute)
        return attribute;
    }

    /**
     * Checks if this attribute is marked as a primary key.
     * @returns `true` if this is a primary key attribute
     */
    isPrimaryKey = () => {
        let model = this.getModel();
        return !!model.config.primaryKey;
    }

    /**
     * Checks if this attribute is mandatory (required).
     * @returns `true` if the attribute is mandatory
     */
    isMandatory = () => {
        return !!this.model.config.mandatory;
    }

    /**
     * Returns the AttributeModel for this attribute.
     * @returns The underlying AttributeModel
     */
    getModel = () => {
        return this.model;
    }

    /**
     * Returns the parent Class for this attribute.
     * @returns The Class instance
     * @throws Error if the attribute has no parent class
     */
    getClass = () => {
        if (this.class) return this.class
        else throw Error("Missing class configuration for this attribute");
    }

    /**
     * Validates a value against this attribute's Zod schema.
     * 
     * @param data - The value to validate
     * @returns Zod safe parse result with success status and data/error
     * 
     * @example
     * ```typescript
     * const result = await priceAttr.validate(19.99);
     * if (result.success) {
     *     console.log('Valid:', result.data);
     * } else {
     *     console.log('Invalid:', result.error);
     * }
     * ```
     */
    public validate = async (data: any): Promise<SafeParseReturnType<any, any>> => {
        return this.field.safeParseAsync(data);
    }

    /**
     * Adds an attribute to its parent class and persists to the database.
     * Used internally by {@link Attribute.create}.
     * 
     * @param attributeObj - The Attribute instance to build
     * @returns The Attribute instance
     * @throws Error if the class has no stack connection
     */
    static build = async (attributeObj: Attribute) => {
        let classObj = attributeObj.getClass();
        let stack = classObj.getStack();
        if (stack) {
            await classObj.addAttribute(attributeObj);
            return attributeObj;
        } else {
            throw new Error("Missing db configuration");
        }
    }

    setModel = (model: AttributeModel) => {
        let currentModel = this.getModel();
        model = Object.assign(currentModel || {}, model);
        this.model = model;
        this.defaultValue = model.config.defaultValue;
    }

    // TODO: Better define config
    getType = (type: AttributeType["type"]) => {
        if (this.checkTypeValidity(type)) {
            return type
        } else throw Error("Invalid attribute type: " + type)
        // return this?
    }

    /**
     * Returns an empty/default value for this attribute.
     * Uses the Zod schema's default value if configured.
     * @returns Object with attribute name as key and default/null value
     */
    getEmpty = () => {
        const partialDoc = {
            [this.name]: this.field.parse(undefined) || null
        }
        return partialDoc;
    }

    // getType()

    /**
     * Returns the attribute name.
     * @returns The attribute name string
     */
    getName = () => {
        return this.name;
    }

    checkTypeValidity = (type: string) => {
        let validity = false;
        if (ATTRIBUTE_TYPES.includes(type)) {
            validity = true;
        }
        return validity;
    }

    // TODO: change to imported const default configs for types
    // as of now it accepts only string
    // TODO: since config depends on attribute's type, 
    // find a way to check if given configs are correct
    // find a way to add default configs base on type
    getTypeConf = (type: AttributeType["type"], config: AttributeType["config"] | undefined) => {
        switch (type) {
            // TODO: add missing cases and change values to imported const 
            case "decimal":
                config = Object.assign({ max: null, min: null, precision: null, isArray: false }, config) as AttributeTypeConfig;
                break;
            case "integer":
                config = Object.assign({ max: null, min: null, isArray: false }, config) as AttributeTypeConfig;
                break;
            case "string":
                config = Object.assign({ isArray: false }, config) as AttributeTypeConfig;
                break;
            case "object":
                config = Object.assign({ isArray: false }, config) as AttributeTypeConfig;
                break;
            case "date":
                config = Object.assign({ format: "iso", max: null, min: null, isArray: false }, config) as AttributeTypeConfig;
                break;
            case "boolean":
                config = Object.assign({ defaultValue: false, isArray: false }, config) as AttributeTypeConfig;
                break;
            case "foreign_key":
                config = Object.assign({ targetClass: null, isArray: false }, config) as AttributeTypeConfig;
                break;
            case "enum":
                config = Object.assign({ values: [], isArray: false }, config) as AttributeTypeConfig;
                break;
            case "reference":
                config = Object.assign({ isArray: false }, config) as AttributeTypeReference["config"];
                break;
            default:
                throw new Error("Unexpected type: " + type);
            // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
        }
        return config
    }
}

export default Attribute;