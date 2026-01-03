import { Document, Domain as Domain_, DomainModel, Stack, DomainRelationValidation, DomainRelationParams, Class, RelationDocument } from "@docstack/shared";
import clientLogger from "../utils/logger";
import winston, { createLogger, Logger } from "winston";

/**
 * Represents a relationship definition between two Classes in the DocStack database.
 * 
 * A Domain defines how documents of different classes relate to each other,
 * supporting cardinality constraints (1:1, 1:N, N:1, N:N). Relation documents
 * are created to track the links between source and target documents.
 * 
 * Use the static factory methods ({@link Domain.create}, {@link Domain.fetch}) to
 * instantiate domains - the constructor is private.
 * 
 * @example
 * ```typescript
 * // Define a 1:N relationship between Projects and Tasks
 * const projectTaskDomain = await Domain.create(
 *     stack,
 *     null,
 *     'ProjectTasks',
 *     'domain',
 *     '1:N',
 *     projectClass,
 *     taskClass
 * );
 * 
 * // Create a relation between a project and a task
 * await projectTaskDomain.addRelation(taskDoc, 'Project-1');
 * ```
 * 
 * @extends Domain_
 */
class Domain extends Domain_ {
    /** Reference to the parent stack instance. */
    stack: Stack | undefined;
    /** The name of this domain (e.g., 'ProjectTasks'). */
    name!: string;
    /** The domain type (typically 'domain'). */
    type!: DomainModel["~class"];
    /** Optional description of the domain purpose. */
    description: string | undefined;
    /** The unique identifier for this domain. */
    id!: string;
    /** The cardinality of the relationship: '1:1', '1:N', 'N:1', or 'N:N'. */
    relation!: DomainModel["relation"];
    /** The source class in the relationship. */
    sourceClass!: Class;
    /** The target class in the relationship. */
    targetClass!: Class;
    /** The underlying DomainModel document. */
    model!: DomainModel;
    /** Current state indicating if the domain is processing an operation. */
    state: "busy" | "idle" = "idle";
    static logger: Logger = clientLogger().child({ module: "domain" });
    logger!: Logger;

    private constructor() {
        super();
    }

    getStack = (): Stack | undefined => {
        return this.stack;
    }

    getName = () => {
        return this.name;
    }

    setId = (id: string) => {
        this.id = id;
    }

    setModel = (model?: DomainModel) => {
        Domain.logger.info("setModel - got incoming model", { model: model });
        // Retreive current class model
        let currentModel = this.getModel();
        // Set model arg to the overwrite of the current model with the given one 
        model = Object.assign(currentModel, model);

        this.id = model._id;
        this.name = model.name;
        this.description = model.description;
        this.relation = model.relation;
        this.type = model["~class"];
        this.model = model;
        Domain.logger.info("setModel - model after processing", { model: model })
    }

    build = (): Promise<Domain> => {
        return new Promise(async (resolve, reject) => {
            let stack = this.getStack();
            if (stack) {
                let domainModel = await stack.addDomain(this);
                if (domainModel) {
                    // Hydrate model
                    this.setModel(domainModel);
                    Domain.logger.info("build - domainModel", { domainModel });
                    this.setId(domainModel._id);
                    resolve(this)
                } else {
                    reject("Unable to get create domainModel. Check logs.");
                }
            } else {
                reject("Missing stack assignment");
            }
        })
    }

    init = (
        stack: Stack | null,
        id: string | null,
        name: string,
        type: DomainModel["~class"],
        relation: typeof this.relation,
        sourceClass: Class,
        targetClass: Class,
        description?: string,

        // schema: DomainModel["schema"] = {}
    ) => {
        if (stack) {
            this.stack = stack;
        }
        this.name = name;
        this.id = id!;

        this.description = description;
        this.type = type;
        this.relation = relation;
        this.sourceClass = sourceClass;
        this.targetClass = targetClass;
        this.setModel({
            "~class": type, _id: id!, active: true,
            name, relation, sourceClass: sourceClass.id!,
            targetClass: targetClass.id!, description,
        })
        this.logger = clientLogger(this.stack).child({ module: "domain", domainName: this.name });
    }

    /**
     * Gets a Domain instance without persisting it to the database.
     * Use this for working with existing domain models or for testing.
     * Sets up a document change listener for real-time updates.
     * 
     * @param stack - The parent stack instance
     * @param id - The domain ID (or null for new domains)
     * @param name - The domain name
     * @param type - The domain type (typically 'domain')
     * @param relation - The cardinality constraint
     * @param sourceClass - The source Class in the relationship
     * @param targetClass - The target Class in the relationship
     * @param description - Optional description
     * @param schema - Optional schema definition
     * @returns A new Domain instance (not persisted)
     */
    public static get = (
        stack: Stack,
        id: string | null,
        name: string,
        type: DomainModel["~class"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: Class,
        targetClass: Class,
        description?: string,
        schema: DomainModel["schema"] = {},
    ) => {
        const domain_ = new Domain();
        Domain.logger.info("Received schema", { schema })
        domain_.init(
            stack, id, name, type, relation, sourceClass, targetClass, description);
        // Add listener for new documents of this class type
        domain_.stack!.onClassDoc(name)
            .on("change", (change) => {
                const evt = new CustomEvent("doc", {
                    detail: change
                })
                domain_.dispatchEvent(evt);
            })
        return domain_;
    }

    /**
     * Creates a new domain and persists it to the database.
     * This is the primary factory method for creating new domains.
     * 
     * @param stack - The parent stack instance
     * @param id - The domain ID (typically null for auto-generation)
     * @param name - The name for the new domain
     * @param type - The domain type (typically 'domain')
     * @param relation - The cardinality constraint: '1:1', '1:N', 'N:1', or 'N:N'
     * @param sourceClass - The source Class in the relationship
     * @param targetClass - The target Class in the relationship
     * @param description - Optional description of the domain
     * @param schema - Optional schema definition
     * @returns The persisted Domain instance
     * 
     * @example
     * ```typescript
     * const domain = await Domain.create(
     *     stack, null, 'UserProjects', 'domain', '1:N',
     *     userClass, projectClass, 'Users can have many projects'
     * );
     * ```
     */
    public static create = async (
        stack: Stack,
        id: string | null,
        name: string,
        type: DomainModel["~class"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: Class,
        targetClass: Class,
        description?: string,
        schema: DomainModel["schema"] = {},
    ) => {
        const domain_ = Domain.get(
            stack, null, name, type,
            relation, sourceClass, targetClass,
            description, schema
        );
        await domain_.build();
        return domain_;
    }

    /**
     * Builds a Domain instance from an existing DomainModel document.
     * Fetches the source and target classes and hydrates the domain.
     * 
     * @param stack - The parent stack instance
     * @param domainModel - The DomainModel document from the database
     * @returns The hydrated Domain instance
     * @throws Error if source or target class is not found
     */
    static buildFromModel = async (stack: Stack, domainModel: DomainModel) => {
        Domain.logger.info("buildFromModel - Instantiate from model", { domainModel });
        const sourceClass = await stack.getClass(domainModel.sourceClass);
        const targetClass = await stack.getClass(domainModel.targetClass);
        if (!sourceClass || !targetClass) {
            throw new Error("Source or target class not found for domain " + domainModel.name);
        }
        if (domainModel._rev) {
            let classObj: Domain = Domain.get(
                stack, domainModel._id, domainModel.name,
                domainModel["~class"], domainModel.relation,
                sourceClass, targetClass,
                domainModel.description, domainModel.schema
            )
            return classObj;
        } else {
            let classObj: Domain = await Domain.create(
                stack, domainModel._id, domainModel.name, domainModel["~class"],
                domainModel.relation, sourceClass,
                targetClass, domainModel.description,
                domainModel.schema
            );
            return classObj;
        }
    }

    /**
     * Fetches a domain by its name.
     * This is the most common way to retrieve an existing domain.
     * 
     * @param stack - The parent stack instance
     * @param domainName - The domain name to fetch
     * @returns The Domain instance, or `null` if not found
     * 
     * @example
     * ```typescript
     * const domain = await Domain.fetch(stack, 'ProjectTasks');
     * if (domain) {
     *     const relations = await domain.getRelations();
     * }
     * ```
     */
    static fetch = async (stack: Stack, domainName: string) => {
        let domainModel = await stack.getDomainModel(domainName);
        if (domainModel) {
            return Domain.buildFromModel(stack, domainModel);
        } else {
            return null;
        }
    }

    /**
     * Returns the current DomainModel representation of this domain.
     * @returns The DomainModel document
     */
    getModel = () => {
        let model: DomainModel = {
            _id: this.id,
            name: this.name,
            description: this.description,
            "~class": this.type,
            relation: this.relation,
            sourceClass: this.sourceClass.id!,
            targetClass: this.targetClass.id!,
            active: true,
            _rev: this.model ? this.model._rev : "",
            "~createTimestamp": this.model ? this.model["~createTimestamp"] : undefined,
        };
        return model;
    }

    requireStack = (): Stack => {
        if (!this.stack) {
            throw new Error(`Stack is not defined for Domain ${this.name}`);
        }
        return this.stack;
    }

    getDocumentRole = (doc: Document): "source" | "target" => {
        if (doc["~class"] === this.sourceClass.getName()) {
            return "source";
        }
        if (doc["~class"] === this.targetClass.getName()) {
            return "target";
        }
        throw new Error(`Document of type '${doc["~class"]}' is not part of domain '${this.name}'.`);
    }

    assertReferenceAllowed = (role: "source" | "target") => {
        switch (this.relation) {
            case "1:N":
                if (role !== "target") {
                    throw new Error(`Documents of class '${this.sourceClass}' cannot hold reference attributes for domain '${this.name}'.`);
                }
                break;
            case "N:1":
                if (role !== "source") {
                    throw new Error(`Documents of class '${this.targetClass}' cannot hold reference attributes for domain '${this.name}'.`);
                }
                break;
            case "1:1":
                break;
            case "N:N":
                throw new Error(`Domain '${this.name}' does not support reference attributes.`);
            default:
                throw new Error(`Unsupported relation type ${this.relation}`);
        }
    }

    buildRelationParams = (doc: Document, referenceId: string, role: "source" | "target"): DomainRelationParams => {
        if (!doc._id) {
            throw new Error("Document is missing identifier.");
        }
        if (typeof referenceId !== "string" || referenceId.length === 0) {
            throw new Error(`Invalid reference value provided for domain '${this.name}'.`);
        }
        if (role === "source") {
            return {
                sourceClass: this.sourceClass.id!,
                targetClass: this.targetClass.id!,
                sourceId: doc._id,
                targetId: referenceId
            };
        }
        return {
            sourceClass: this.sourceClass.id!,
            targetClass: this.targetClass.id!,
            sourceId: referenceId,
            targetId: doc._id
        };
    }

    fetchReferenceDocument = async (referenceId: string, expectedType: string) => {
        const stack = this.requireStack();
        const referenceDoc = await stack.db.get<Document>(referenceId).catch(() => null);
        if (!referenceDoc || referenceDoc["~class"] !== expectedType || referenceDoc.active === false) {
            throw new Error(`Reference '${referenceId}' does not exist for class '${expectedType}'.`);
        }
        return referenceDoc as Document;
    }

    findRelationDoc = async (selector: { [key: string]: any }): Promise<RelationDocument | null> => {
        const stack = this.requireStack();
        const searchSelector = {
            "~domain": { $eq: this.name },
            ...selector,
        };
        const { docs } = await stack.findDocuments<RelationDocument>(searchSelector, undefined, 0, 1);
        return docs[0] || null;
    }

    throwIfRelationExists = async (filter: { [key: string]: any }, params: DomainRelationParams): Promise<RelationDocument | null> => {
        const relation = await this.findRelationDoc(filter);
        if (relation) {
            if (relation.sourceId === params.sourceId && relation.targetId === params.targetId) {
                return relation;
            }
            throw new Error(`Domain '${this.name}' already contains a relation that violates cardinality constraints.`);
        }
        return null;
    }

    ensureCardinalityConstraints = async (params: DomainRelationParams) => {
        switch (this.relation) {
            case "1:1":
                await this.throwIfRelationExists({ sourceId: { $eq: params.sourceId } }, params);
                await this.throwIfRelationExists({ targetId: { $eq: params.targetId } }, params);
                break;
            case "1:N":
                await this.throwIfRelationExists({ targetId: { $eq: params.targetId } }, params);
                break;
            case "N:1":
                await this.throwIfRelationExists({ sourceId: { $eq: params.sourceId } }, params);
                break;
        }
    }

    validateRelation = async (doc: Document, referenceId: string): Promise<DomainRelationValidation> => {
        const fnLogger = this.logger.child({ method: "validateRelation", args: { docId: doc._id, referenceId } });
        const role = this.getDocumentRole(doc);
        this.assertReferenceAllowed(role);
        const expectedType = role === "source" ? this.targetClass.getName() : this.sourceClass.getName();
        await this.fetchReferenceDocument(referenceId, expectedType);
        const params = this.buildRelationParams(doc, referenceId, role);
        const existing = await this.findRelationDoc({
            sourceId: { $eq: params.sourceId },
            targetId: { $eq: params.targetId },
        });
        if (existing) {
            fnLogger.info("validateRelation - relation already exists");
            return { params, exists: true, relation: existing };
        }
        await this.ensureCardinalityConstraints(params);
        return { params, exists: false };
    }

    /**
     * Retrieves relation documents for this domain.
     * 
     * @param selector - Optional PouchDB/Mango selector for filtering
     * @param fields - Optional list of fields to return
     * @param skip - Number of documents to skip
     * @param limit - Maximum number of documents to return
     * @returns Array of matching relation documents
     * 
     * @example
     * ```typescript
     * // Get all relations
     * const allRelations = await domain.getRelations();
     * 
     * // Get relations for a specific source
     * const projectRelations = await domain.getRelations({ sourceId: { $eq: 'Project-1' } });
     * ```
     */
    getRelations = async (selector?: { [key: string]: any }, fields?: string[], skip?: number, limit?: number) => {
        const stack = this.requireStack();
        const _selector = { ...(selector || {}), "~domain": { $eq: this.name } };
        Domain.logger.info("getRelations - selector", { selector: _selector, fields, skip, limit })
        const docs = (await stack.findDocuments<RelationDocument>(_selector, fields, skip, limit)).docs
        return docs;
    }

    /**
     * Creates a relation between documents.
     * Validates cardinality constraints before creating the relation.
     * 
     * @param document - The document to link (source or target based on role)
     * @param referenceId - The ID of the document to link to
     * @returns The created relation document, or existing relation if already exists
     * 
     * @example
     * ```typescript
     * // Link a task to a project (assuming 1:N from Project to Task)
     * const relation = await projectTaskDomain.addRelation(taskDoc, 'Project-1');
     * ```
     */
    addRelation = async (document: Document, referenceId: string): Promise<RelationDocument | null>=> {
        const fnLogger = this.logger.child({ method: "addRelation", args: { document, referenceId } });
        const stack = this.requireStack();
        const validation = await this.validateRelation(document, referenceId);
        if (validation.exists) {
            fnLogger.info("addRelation - relation already in place");
            return validation.relation || null;
        }
        fnLogger.info("addRelation - relation validated");
        const relationDoc = await stack.createRelationDoc(null, this.name, this, validation.params);
        fnLogger.info("addRelation - relationDoc created", { relationDoc });
        return relationDoc;
    }

    /**
     * Deletes a relation between two documents by their IDs.
     * 
     * @param sourceId - The source document ID
     * @param targetId - The target document ID
     * @returns `true` if deleted, `false` if relation not found
     */
    deleteRelation = async (sourceId: string, targetId: string) => {
        const relation = await this.findRelationDoc({
            sourceId: { $eq: sourceId },
            targetId: { $eq: targetId },
        });
        if (!relation || !relation._id) {
            return false;
        }
        return this.requireStack().deleteDocument(relation._id);
    }

    /**
     * Deletes a relation document by its ID.
     * 
     * @param relationDocId - The relation document ID to delete
     * @returns `true` if deleted successfully
     */
    deleteRelationDoc = async (relationDocId: string) => {
        return this.requireStack().deleteDocument(relationDocId);
    }

}

export default Domain;