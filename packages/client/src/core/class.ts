import { Class as Class_, DesignDocument, isAttributeModel, TriggerModel } from "@docstack/shared";
import createLogger from "../utils/logger/index.js";
// import ReferenceAttribute from '../Reference';
import { Stack, ClassModel, Attribute as Attribute_, AttributeModel, Document } from "@docstack/shared";
import Attribute from "./attribute.js";
import { Logger } from 'winston';
import { Trigger } from "./trigger/index.js";
import { z } from "zod";
import clientLogger from "../utils/logger/index.js";

/**
 * Represents a data class (schema definition) in the DocStack database.
 * 
 * A Class defines the structure of documents, including their attributes,
 * validation rules (via Zod), and triggers that execute during document operations.
 * 
 * Use the static factory methods ({@link Class.create}, {@link Class.fetch}) to
 * instantiate classes - the constructor is private.
 * 
 * @example
 * ```typescript
 * // Create a new class with schema
 * const taskClass = await Class.create(stack, 'Task', 'class', 'User Tasks');
 * 
 * // Add attributes to define the schema
 * await Attribute.create(taskClass, 'title', 'string', 'Task Title', { mandatory: true });
 * await Attribute.create(taskClass, 'isComplete', 'boolean', 'Done?', { defaultValue: false });
 * 
 * // Create documents (cards) of this class
 * const task = await taskClass.add({ title: 'My Task', isComplete: false });
 * ```
 * 
 * @extends Class_
 */
class Class extends Class_ {
    /** Reference to the parent stack instance. */
    stack: Stack | undefined;
    /** The name of this class (e.g., 'Task', 'User'). */
    name!: string;
    /** The class type (e.g., 'class', '~self'). */
    type!: ClassModel["~class"];
    /** Optional description of the class purpose. */
    description?: string;
    /** Map of attribute names to Attribute instances defining the schema. */
    attributes: { [name: string]: Attribute } = {};
    /** The raw schema definition from the ClassModel. */
    schema: ClassModel["schema"] = {};
    /** Zod schema for runtime validation of document data. */
    schemaZOD: z.ZodObject<any, any, any> = z.object({});
    /** The unique identifier for this class (e.g., 'Task', 'Class-123'). */
    id?: string;
    /** The underlying ClassModel document. */
    model!: ClassModel;
    /** Current state indicating if the class is processing an operation. */
    state: "busy" | "idle" = "idle";
    static logger: Logger = createLogger().child({ module: "class" });
    logger!: Logger;
    /** Array of triggers that execute before/after document operations. */
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
            if (stack) {
                // if (parentClassName) this.setParentClass(parentClassName);
                let classModel = await stack.addClass(this);
                // Hydrate model
                if (classModel) {
                    this.setModel(classModel)
                    Class.logger.info("build - classModel", { classModel: classModel })
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

        this.logger = clientLogger(stack).child({ module: "class", className: this.name });
        // TODO: Waiting for test of method
        // if (parentClass) this.inheritAttributes(parentClass);
    }


    /**
     * Gets a Class instance without persisting it to the database.
     * Use this for working with existing class models or for testing.
     * Sets up a document change listener for real-time updates.
     * 
     * @param stack - The parent stack instance
     * @param id - The class ID
     * @param name - The class name
     * @param type - The class type
     * @param description - Optional description
     * @param schema - Initial schema definition
     * @returns A new Class instance (not persisted)
     */
    public static get = (
        stack: Stack,
        id: string,
        name: string,
        type: ClassModel["~class"],
        description?: string,
        schema: ClassModel["schema"] = {},
    ) => {
        const class_ = new Class();
        Class.logger.info("Received schema", { schema })
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

    /**
     * Creates a new class and persists it to the database.
     * This is the primary factory method for creating new classes.
     * 
     * @param stack - The parent stack instance
     * @param name - The name for the new class
     * @param type - The class type (typically 'class')
     * @param description - Optional description of the class
     * @param schema - Initial schema definition
     * @returns The persisted Class instance
     * 
     * @example
     * ```typescript
     * const userClass = await Class.create(stack, 'User', 'class', 'Application users');
     * ```
     */
    public static create = async (
        stack: Stack,
        name: string,
        type: ClassModel["~class"],
        description?: string,
        schema: ClassModel["schema"] = {},
    ) => {
        const class_ = Class.get(stack, name, name, type, description, schema);
        await class_.build();
        return class_;
    }

    /**
     * Builds a Class instance from an existing ClassModel document.
     * Hydrates attributes and triggers from the model.
     * 
     * @param stack - The parent stack instance
     * @param classModel - The ClassModel document from the database
     * @returns The hydrated Class instance
     */
    static buildFromModel = async (stack: Stack, classModel: ClassModel) => {
        Class.logger.info("buildFromModel - Instantiate from model", { classModel });

        if (classModel._rev) {
            let classObj: Class = Class.get(
                stack, classModel._id, classModel.name,
                classModel["~class"], classModel.description,
                classModel.schema
            )
            classObj.setModel(classModel);
            return classObj;
        } else {
            let classObj: Class = await Class.create(stack, classModel.name, classModel["~class"], classModel["~class"], classModel.schema);
            classObj.setModel(classModel);
            return classObj;
        }
    }

    /**
     * Fetches a class by its document ID.
     * 
     * @param stack - The parent stack instance
     * @param classId - The class document ID
     * @returns The Class instance
     * @throws Error if the class is not found
     */
    static fetchById = async (stack: Stack, classId: string) => {
        try {
            let classModel = await stack.db.get<ClassModel>(classId);
            const classObj = await Class.buildFromModel(stack, classModel);
            return classObj;
        } catch (error) {
            throw new Error(`Class not found: ${classId}`);
        }
    }

    /**
     * Fetches a class by its name.
     * This is the most common way to retrieve an existing class.
     * 
     * @param stack - The parent stack instance
     * @param className - The class name to fetch
     * @returns The Class instance, or `null` if not found
     * 
     * @example
     * ```typescript
     * const taskClass = await Class.fetch(stack, 'Task');
     * if (taskClass) {
     *     const tasks = await taskClass.getCards();
     * }
     * ```
     */
    static fetch = async (stack: Stack, className: string) => {
        let classModel = await stack.getClassModel(className);
        if (classModel) {
            return Class.buildFromModel(stack, classModel);
        } else {
            return null;
        }
    }

    uniqueCheck = async (doc: Document): Promise<boolean> => {
        const fnLogger = this.logger.child({ method: "uniqueCheck", args: { doc } });
        const duplicate = await this.getByPrimaryKeys(doc);
        if (duplicate == null || duplicate._id == doc._id) {
            fnLogger.info("No duplicate found for doc");
            return true;
        } else {
            fnLogger.info("Duplicate found for doc", { duplicate });
            return false;
        }
    };

    bulkUniqueCheck = async (pKs: string[]): Promise<boolean> => {
        const fnLogger = this.logger.child({ method: "bulkUniqueCheck", args: { pKs } });
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
                } catch (e: any) { /* ignore */ }
                return false;
            }
        } else {
            fnLogger.error(`Was unable to create temporary design document to group by`);
            return false;
        }

    }

    /**
     * Validates document data against the class schema using Zod.
     * 
     * @param data - The document data to validate
     * @returns `true` if validation passes, `false` otherwise
     */
    validate = async (data: { [key: string]: any }): Promise<boolean> => {
        const fnLogger = this.logger.child({ method: "validate" });
        const result = await this.schemaZOD.safeParseAsync(data);
        fnLogger.debug("Got result", { result });
        if (result.success) {
            return true
        } else {
            return false;
        }
    }

    // TODO Turn into method (after factory method instantiation refactory is done)
    setId = (id: string) => {
        this.id = id;
    }

    getName = () => {
        return this.name;
    }

    getStack = (): Stack | undefined => {
        return this.stack;
    }

    getDescription = (): string | undefined => {
        return this.description;
    }

    getType = () => {
        return this.type;
    }

    getId = (): string | undefined => {
        return this.id;
    }

    /**
     * Builds the schema object from the current attributes.
     * @returns The schema definition object
     */
    buildSchema = () => {
        let schema: ClassModel["schema"] = {};
        Object.entries(this.attributes).forEach(t => {
            schema[t[0]] = t[1].model
        });
        return schema;
    }

    /**
     * Returns the current ClassModel representation of this class.
     * @returns The ClassModel document
     */
    getModel = () => {
        let triggers: ClassModel["triggers"] = [];
        for (const trigger of this.triggers) {
            triggers.push(trigger.model);
        }
        let model: ClassModel = {
            _id: this.id!,
            name: this.getName(),
            description: this.getDescription(),
            "~class": this.getType(),
            schema: this.buildSchema(),
            triggers: triggers,
            active: true,
            _rev: this.model ? this.model._rev : "",
            "~createTimestamp": this.model ? this.model["~createTimestamp"] : undefined,
        };
        return model;
    }

    // [TODO] Change into buildFromModel
    /**
     * It hydrates attributes and triggers from given model
     * @param model 
     */
    setModel = (model?: ClassModel) => {
        Class.logger.info("setModel - got incoming model", { model: model });
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
            this.triggers = [];
            for (const trigger of model.triggers) {
                let trigger_ = new Trigger(trigger, this);
                this.triggers.push(trigger_);
            }
        }

        this.name = model.name;
        this.description = model.description;
        this.type = model["~class"];
        this.model = model;
        Class.logger.info("setModel - model after processing", { model: model })
    }

    /**
     * Returns the primary key attribute names for this class.
     * @returns Array of attribute names marked as primary keys
     */
    getPrimaryKeys = () => {
        return Object.values(this.attributes).filter(attr => attr.isPrimaryKey())
            .map(attr => attr.getName());
    }

    getAttributes = (...names: string[]) => {
        let attributes: typeof this.attributes = {};
        for (const attribute of Object.values(this.attributes)) {
            if (names.length > 0) {
                // filter with given names
                for (let name of names) {
                    // match?
                    if (name != null && attribute.getName() == name) {
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

    hasAllAttributes = (...names: string[]) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for (let attribute of Object.values(attributes)) {
            result = names.includes(attribute.getName())
            if (!result) break;
        }
        return result;
    }

    hasAnyAttributes = (...names: string[]) => {
        let result = false;
        let attributes = this.getAttributes(...names);
        for (let attribute of Object.values(attributes)) {
            result = names.includes(attribute.getName())
            if (result) break;
        }
        return result;
    }

    getEncryptedAttributes = () => {
        return Object.values(this.attributes).filter((attribute) => {
            const config = attribute.model.config;
            return config?.encrypted === true && config?.primaryKey !== true;
        });
    }

    // interface of hasAnyAttributes
    hasAttribute = (name: string) => {
        return this.hasAnyAttributes(name)
    }


    /**
     * Adds a new attribute to the class schema.
     * Persists the change to the database.
     * 
     * @param attribute - The Attribute instance or AttributeModel to add
     * @returns This Class instance for chaining
     * 
     * @example
     * ```typescript
     * await taskClass.addAttribute(new Attribute(taskClass, 'dueDate', 'date', 'Due Date'));
     * // Or use Attribute.create() for a simpler API
     * ```
     */
    addAttribute = async (attribute: Attribute_ | AttributeModel): Promise<Class> => {
        const fnLogger = this.logger.child({ method: "addAttribute", args: { attribute: attribute.name } });
        const attribute_ = isAttributeModel(attribute) 
            ? new Attribute(
                this, attribute.name, attribute.type,
                attribute.description, attribute.config
            ) : attribute;
        try {
            let name = attribute_.getName();
            // console.log("Adding attribute", {className: this.name, attribute: name})
            if (!this.hasAttribute(name)) {
                fnLogger.info("Adding attribute", { name: name, type: attribute_.getModel() });
                this.attributes[name] = attribute_;
                let attributeModel = attribute_.getModel();
                fnLogger.info("Adding attribute to schema", { attributeModel: attributeModel });
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
                fnLogger.info("Checking for requirements before updating class on db", { stack: (this.stack != null), id: this.id })
                if (this.stack && this.id) {
                    // debugger;
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

    /**
     * Modifies an existing attribute in the class schema.
     * 
     * @param name - The name of the attribute to modify
     * @param attribute - The new Attribute or AttributeModel definition
     * @returns This Class instance for chaining
     */
    modifyAttribute = async (name: string, attribute: Attribute_ | AttributeModel): Promise<Class> => {
        const fnLogger = this.logger.child({ method: "modifyAttribute", args: { name } });
        const originSchema = { ...this.model.schema[name] },
            originAttr = this.attributes[name];
        const attribute_ = isAttributeModel(attribute)
            ? new Attribute(
                this, attribute.name, attribute.type,
                attribute.description, attribute.config
            ) : attribute;
        try {
            fnLogger.info(`Attempting to change attribute definition.`);
            delete this.model.schema[name];
            delete this.attributes[name];
            this.schemaZOD = this.schemaZOD.omit({ [name]: true });
            return this.addAttribute(attribute_);
        } catch (e: any) {
            // Revert
            this.model.schema[name] = originSchema;
            this.attributes[name] = originAttr;
            fnLogger.error(`Failed at removing attribute from class.'`);
        }
        return this;
    }

    /**
     * Removes an attribute from the class schema.
     * 
     * @param name - The name of the attribute to remove
     * @returns This Class instance for chaining
     */
    removeAttribute = async (name: string): Promise<Class> => {
        const fnLogger = this.logger.child({ method: "removeAttribute", args: { name } });
        const originSchema = { ...this.model.schema[name] },
            originAttr = this.attributes[name];
        try {
            fnLogger.info(`Attempting to remove attribute from class.`);
            delete this.model.schema[name];
            delete this.attributes[name];
            this.schemaZOD = this.schemaZOD.omit({ [name]: true });
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

    /**
     * Creates a new document (card) of this class type.
     * 
     * @param params - The document data
     * @returns The created document, or `null` if stack is not defined
     * 
     * @example
     * ```typescript
     * const task = await taskClass.addCard({
     *     title: 'My Task',
     *     isComplete: false
     * });
     * ```
     */
    addCard = async (params: { [key: string]: any }): Promise<Document | null> => {
        const fnLogger = this.logger.child({ method: "addCard", args: { params } });
        if (!this.stack) {
            fnLogger.error("Stack is not defined");
            return null;
        }
        return await this.stack.createDoc(null, this.getName(), this, params);
    }

    /**
     * Creates multiple documents (cards) of this class type in a batch.
     * 
     * @param paramsArray - Array of document data objects
     * @returns Array of created documents
     */
    addCards = async (paramsArray: { [key: string]: any }[]) => {
        const fnLogger = this.logger.child({ method: "addCards", args: { paramsArray } });
        if (!this.stack) {
            fnLogger.error("Stack is not defined");
            return [];
        }
        let addedCards: Document[] = [];
        addedCards = await this.stack.createDocs(
            paramsArray.map(params => ({ docId: null, params })), this.getName(), this
        );
        return addedCards;
    }

    getByPrimaryKeys = async (params: { [key: string]: any }): Promise<Document | null> => {
        const fnLogger = this.logger.child({ method: "getByPrimaryKeys" });
        // attempt to retrieve card by primary key
        let filter: { [key: string]: any } = {}
        let primaryKeys = this.getPrimaryKeys();
        fnLogger.info("Got primary keys", { primaryKeys });
        if (primaryKeys.length) {
            // executes a reducer function on each element of the primaryKeys array
            // that sets each primary key prop to the corresponding param value 
            primaryKeys.reduce(
                (accumulator, currentValue) => accumulator[currentValue] = params[currentValue],
                filter,
            );
            fnLogger.info("Defined filter", { filter });
            let cards = await this.getCards(filter, undefined, 0, 1);
            if (cards.length > 0) {
                return cards[0];
            } else {
                fnLogger.info("Did not find any documents with given primary key", { filter });
                return null;
            }
        } else {
            fnLogger.info("Class has no field specified as primary key");
            return null;
        }
    }

    /**
     * Creates one or more documents of this class type.
     * Convenience method that handles both single and batch creation.
     * 
     * @param params - Document data (single object for one doc, or multiple for batch)
     * @returns Single document when one param passed, array when multiple
     * 
     * @example
     * ```typescript
     * // Single document
     * const task = await taskClass.add({ title: 'Task 1' });
     * 
     * // Multiple documents
     * const tasks = await taskClass.add(
     *     { title: 'Task 1' },
     *     { title: 'Task 2' }
     * );
     * ```
     */
    async add(params: { [key: string]: any }): Promise<Document | null>;
    async add(...paramsArray: { [key: string]: any }[]): Promise<Document[]>;
    async add(...paramsArray: { [key: string]: any }[]): Promise<Document | Document[] | null> {
        const fnLogger = this.logger.child({ method: "add", args: { paramsArray } });
        const addedCards = await this.addCards(paramsArray);
        fnLogger.info("Added cards", { addedCards });
        if (paramsArray.length === 1) return addedCards[0] || null;
        return addedCards;
    }

    addOrUpdateCard = async (params: { [key: string]: any }, cardId?: string): Promise<Document | null> => {
        const fnLogger = this.logger.child({ method: "addOrUpdateCard", args: { params, cardId } });
        const document = await new Promise<Document | null>(async (resolve, reject) => {
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
        fnLogger.warn("Updated document", { document })
        return document;

    }

    /**
     * Pushes a document to the database.
     * This is an alias for {@alias addOrUpdateCard}.
     * 
     * @param params - The document data
     * @param docId - Optional document ID. If provided, performs an update.
     * @returns The created or updated document
     */
    push = async (params: { [key: string]: any }, docId?: string): Promise<Document | null> => {
        return this.addOrUpdateCard(params, docId);
    }

    /**
     * Updates an existing document (card) of this class.
     * 
     * @param cardId - The document ID to update
     * @param params - The updated document data
     * @returns The updated document, or `null` if stack is not defined
     */
    updateCard = async (cardId: string, params: { [key: string]: any }): Promise<Document | null> => {
        return new Promise<Document | null>(async (resolve, reject) => {
            if (this.stack) {
                const res = await this.stack.createDoc(cardId, this.getName(), this, params);
                resolve(res)
            } else {
                Class.logger.info("no stack defined");
                resolve(null);
            }
        })
    }

    /**
     * Soft-deletes a document by setting its `active` flag to `false`.
     * 
     * @param cardId - The document ID to delete
     * @returns `true` if successful, `false` otherwise
     */
    deleteCard = async (cardId: string) => {
        const fnLogger = this.logger.child({ method: "deleteCard", args: { cardId } });
        if (this.stack) {
            const res = await this.stack.deleteDocument(cardId);
            return res;
        } else {
            fnLogger.error("Stack is not defined");
            return false;
        }
    }

    /**
     * Retrieves documents (cards) of this class type.
     * 
     * @param selector - Optional PouchDB/Mango selector for filtering
     * @param fields - Optional list of fields to return
     * @param skip - Number of documents to skip
     * @param limit - Maximum number of documents to return
     * @returns Array of matching documents
     * 
     * @example
     * ```typescript
     * // Get all tasks
     * const allTasks = await taskClass.getCards();
     * 
     * // Get incomplete tasks
     * const incomplete = await taskClass.getCards({ isComplete: { $eq: false } });
     * ```
     */
    getCards = async (selector?: { [key: string]: any }, fields?: string[], skip?: number, limit?: number) => {
        const _selector = { ...(selector || {}), "~class": { $eq: this.name } };
        this.logger.info("getCards - selector", { selector: _selector, fields, skip, limit })
        let docs = (await this.stack!.findDocuments<Document>(_selector, fields, skip, limit)).docs
        return docs;
    }

    /**
     * Retrieves one or more documents by their IDs.
     * 
     * @param cardId - Single ID or multiple IDs to fetch
     * @returns Single document (or null) when one ID passed, array when multiple
     * 
     * @example
     * ```typescript
     * // Get single document
     * const task = await taskClass.get('Task-123');
     * 
     * // Get multiple documents
     * const tasks = await taskClass.get('Task-1', 'Task-2', 'Task-3');
     * ```
     */
    async get(cardId: string): Promise<Document | null>;
    async get(...cardId: string[]): Promise<Document[]>;
    async get(...cardId: string[]): Promise<Document | Document[] | null> {
        const fnLogger = this.logger.child({ method: "get", args: { cardId } });
        if (typeof cardId === "string") {
            let docs = await this.getCards(
                { _id: { $eq: cardId } },
            );
            return docs[0] || null;
        } else {
            let docs = await this.getCards(
                { _id: { $in: cardId } },
            );
            fnLogger.info("Fetched documents", { docs });
            return docs;
        }
    }

    /**
     * Adds a trigger to this class.
     * Triggers execute before or after document operations.
     * 
     * @param name - The trigger name
     * @param model - The trigger model containing the execution logic
     * @returns This Class instance for chaining
     * 
     * @example
     * ```typescript
     * await taskClass.addTrigger('generate-slug', {
     *     name: 'generate-slug',
     *     order: 'before',
     *     run: `document.slug = document.title.toLowerCase().replace(/\\s+/g, '-'); return document;`
     * });
     * ```
     */
    addTrigger = async (name: string, model: TriggerModel) => {
        const fnLogger = this.logger.child({ method: "addTrigger" });
        try {
            const trigger = new Trigger(model, this);
            this.triggers.push(trigger);
            if (this.stack) {
                this.setModel();
                let res = await this.stack.updateClass(this);
            } else {
                throw new Error(`Stack is not defined. Can't update class`);
            }
        } catch (e) {
            fnLogger.error(e);
        }
        return this;
    }

    /**
     * Removes a trigger from this class by name.
     * 
     * @param name - The name of the trigger to remove
     * @returns This Class instance for chaining
     */
    removeTrigger = async (name: string) => {
        this.triggers = this.triggers.filter(t => t.name != name)
        return this;
    }
}

export default Class;