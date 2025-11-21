import { Document, Domain as Domain_, DomainModel, Stack, DomainRelationValidation, DomainRelationParams, Class, RelationDocument } from "@docstack/shared";
import clientLogger from "../utils/logger";
import winston, { createLogger, Logger } from "winston";

class Domain extends Domain_ {
    stack: Stack | undefined;
    name!: string;
    type!: DomainModel["~class"];
    description: string | undefined;
    id!: string;
    relation!: DomainModel["relation"];
    sourceClass!: Class;
    targetClass!: Class;
    // parentDomain: Domain | null;
    model!: DomainModel;
    state: "busy" | "idle" = "idle";
    static logger: Logger = clientLogger().child({module: "domain"});
    logger!: Logger;
    
    private constructor() {
        super();
    }

    getStack = () => {
        return this.stack;
    }

    getName = () => {
        return this.name;
    }
    
    setId = ( id: string ) => {
        this.id = id;
    } 

    setModel = ( model?: DomainModel ) => {
        Domain.logger.info("setModel - got incoming model", {model: model});
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
        Domain.logger.info("setModel - model after processing",{ model: model})
    }

    build = (): Promise<Domain> => {
        return new Promise(async (resolve, reject) => {
            let stack = this.getStack();
            if (stack) {
                let domainModel = await stack.addDomain(this);
                if (domainModel) {
                    // Hydrate model
                    this.setModel(domainModel);
                    Domain.logger.info("build - domainModel", {domainModel});
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
        this.logger = clientLogger(this.stack).child({module: "domain", domainName: this.name});
    }

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
        Domain.logger.info("Received schema", {schema})
        domain_.init(
            stack, id, name, type, relation, sourceClass, targetClass,description);
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
        // parentClass: Class | null = null
    ) => {
        const domain_ = Domain.get(
            stack, null, name, type,
            relation, sourceClass, targetClass,
            description, schema
        );
        await domain_.build();
        return domain_;
    }

    static buildFromModel = async (stack: Stack, domainModel: DomainModel) => {
        Domain.logger.info("buildFromModel - Instantiate from model", {domainModel});
        // let parentdomainModel = (domainModel.parentClass ? await stack.getdomainModel(domainModel.parentClass) : null);
        // let parentClass = (parentdomainModel ? await Class.buildFromModel(stack, parentdomainModel) : null);
        const sourceClass = await stack.getClass(domainModel.sourceClass);
        const targetClass = await stack.getClass(domainModel.targetClass);
        if (!sourceClass || !targetClass) {
            throw new Error("Source or target class not found for domain "+domainModel.name);
        }
        // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
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

    static fetch = async ( stack: Stack, domainName: string ) => {
        let domainModel = await stack.getDomainModel(domainName);
        if ( domainModel ) {
            return Domain.buildFromModel(stack, domainModel);
        } else {
            return null;
            throw new Error("Class not found: "+domainName);
        }
    }

    getModel = () => {
        let model: DomainModel = {
            _id:this.id,
            name: this.name,
            description: this.description,
            "~class": this.type,
            relation: this.relation,
            sourceClass: this.sourceClass.id!,
            targetClass: this.targetClass.id!,
            // schema: this.buildSchema(),
            active: true,
            _rev: this.model ? this.model._rev : "", // [TODO] Error prone
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

    findRelationDoc = async (selector: {[key: string]: any}): Promise<RelationDocument | null> => {
        const stack = this.requireStack();
        const searchSelector = {
            "~domain": { $eq: this.name },
            ...selector,
        };
        const { docs } = await stack.findDocuments<RelationDocument>(searchSelector, undefined, 0, 1);
        return docs[0] || null;
    }

    throwIfRelationExists = async (filter: {[key: string]: any}, params: DomainRelationParams) => {
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
        const fnLogger = this.logger.child({method: "validateRelation", args: {docId: doc._id, referenceId}});
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

    getRelations = async (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => {
        const stack = this.requireStack();
        const _selector = { ...(selector || {}), "~domain": { $eq: this.name } };
        Domain.logger.info("getRelations - selector", {selector: _selector, fields, skip, limit})
        const docs = (await stack.findDocuments<RelationDocument>(_selector, fields, skip, limit)).docs
        return docs;
    }

    addRelation = async ( document: Document, referenceId: string ) => {
        const fnLogger = this.logger.child({method: "addRelation", args: {document, referenceId}});
        const stack = this.requireStack();
        const validation = await this.validateRelation(document, referenceId);
        if (validation.exists) {
            fnLogger.info("addRelation - relation already in place");
            return validation.relation || null;
        }
        fnLogger.info("addRelation - relation validated");
        const relationDoc = await stack.createRelationDoc(null, this.name, this, validation.params);
        fnLogger.info("addRelation - relationDoc created", {relationDoc});
        return relationDoc;
    }

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

    deleteRelationDoc = async (relationDocId: string) => {
        return this.requireStack().deleteDocument(relationDocId);
    }

}

export default Domain;