import { Document, Domain as Domain_, DomainModel, Stack } from "@docstack/shared";
import createLogger from "../utils/logger";
import type { Logger } from "winston";

const cloneDomainSchema = (schema: DomainModel["schema"]): DomainModel["schema"] => {
    return JSON.parse(JSON.stringify(schema)) as DomainModel["schema"];
};

export const DEFAULT_RELATION_SCHEMA: DomainModel["schema"] = {
    sourceClass: {
        name: "sourceClass",
        type: "string",
        config: { mandatory: true, isArray: false }
    },
    targetClass: {
        name: "targetClass",
        type: "string",
        config: { mandatory: true, isArray: false }
    },
    sourceId: {
        name: "sourceId",
        type: "string",
        config: { mandatory: true, isArray: false }
    },
    targetId: {
        name: "targetId",
        type: "string",
        config: { mandatory: true, isArray: false }
    }
};

class Domain extends Domain_ {
    stack: Stack | undefined;
    name!: string;
    type!: DomainModel["type"];
    description: string | undefined;
    id!: string;
    relation!: DomainModel["relation"];
    sourceClass!: string;
    targetClass!: string;
    model!: DomainModel;
    schema: DomainModel["schema"] = cloneDomainSchema(DEFAULT_RELATION_SCHEMA);
    state: "busy" | "idle" = "idle";
    static logger: Logger = createLogger().child({module: "domain"});
    logger: Logger = Domain.logger.child({module: "domain"});

    private constructor() {
        super();
    }

    private mergeSchema = (schema?: DomainModel["schema"]) => {
        if (!schema) {
            return cloneDomainSchema(DEFAULT_RELATION_SCHEMA);
        }
        return {
            ...cloneDomainSchema(DEFAULT_RELATION_SCHEMA),
            ...cloneDomainSchema(schema)
        };
    };

    getStack = () => {
        return this.stack;
    }

    setId = ( id: string ) => {
        this.id = id;
    }

    setModel = ( model?: DomainModel ) => {
        this.logger.info("setModel - got incoming model", {model: model});
        const incomingModel = model ? {...model} : undefined;
        const mergedSchema = this.mergeSchema(incomingModel?.schema ?? this.schema);

        const resolvedModel: DomainModel = {
            _id: incomingModel?._id ?? this.id,
            name: incomingModel?.name ?? this.name,
            description: incomingModel?.description ?? this.description,
            type: incomingModel?.type ?? this.type,
            relation: incomingModel?.relation ?? this.relation,
            sourceClass: incomingModel?.sourceClass ?? this.sourceClass,
            targetClass: incomingModel?.targetClass ?? this.targetClass,
            schema: mergedSchema,
            active: incomingModel?.active ?? this.model?.active ?? true,
            createTimestamp: incomingModel?.createTimestamp ?? this.model?.createTimestamp,
            updateTimestamp: incomingModel?.updateTimestamp ?? this.model?.updateTimestamp,
        };

        if (incomingModel?._rev || this.model?._rev) {
            resolvedModel._rev = incomingModel?._rev ?? this.model?._rev;
        }

        this.id = resolvedModel._id;
        this.name = resolvedModel.name;
        this.description = resolvedModel.description;
        this.type = resolvedModel.type;
        this.relation = resolvedModel.relation;
        this.sourceClass = resolvedModel.sourceClass;
        this.targetClass = resolvedModel.targetClass;
        this.schema = mergedSchema;
        this.model = resolvedModel;
        this.logger = Domain.logger.child({module: "domain", domainName: this.name});
        this.logger.info("setModel - model after processing",{ model: resolvedModel});
    }

    build = (): Promise<Domain> => {
        return new Promise(async (resolve, reject) => {
            let stack = this.getStack();
            if (stack) {
                try {
                    let domainModel = await stack.addDomain(this);
                    if (domainModel) {
                        this.setModel(domainModel);
                        this.logger.info("build - domainModel", {domainModel});
                        this.setId(domainModel._id);
                        resolve(this)
                    } else {
                        reject("Unable to get create domainModel. Check logs.");
                    }
                } catch (error) {
                    reject(error);
                }
            } else {
                reject("Missing stack assignment");
            }
        })
    }

    init = (
        stack: Stack | null,
        name: string,
        type: DomainModel["type"],
        relation: typeof this.relation,
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema: DomainModel["schema"] = DEFAULT_RELATION_SCHEMA,
    ) => {
        if (stack) {
            this.stack = stack;
        }
        this.schema = this.mergeSchema(schema);
        this.name = name;
        this.id = name;
        this.description = description;
        this.type = type;
        this.relation = relation;
        this.sourceClass = sourceClass;
        this.targetClass = targetClass;
        this.setModel({
            type,
            _id: name,
            active: true,
            name,
            relation,
            sourceClass,
            targetClass,
            description,
            schema: this.schema,
        })
    }

    public static get = (
        stack: Stack,
        name: string,
        type: DomainModel["type"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema: DomainModel["schema"] = DEFAULT_RELATION_SCHEMA,
    ) => {
        const domain_ = new Domain();
        this.logger.info("Received schema", {schema})
        domain_.init(
            stack, name, type, relation, sourceClass, targetClass,description, schema);
        if (domain_.stack) {
            domain_.stack.onClassDoc(name)
                .on("change", (change) => {
                    const evt = new CustomEvent("doc", {
                        detail: change
                    })
                    domain_.dispatchEvent(evt);
                })
        }
        return domain_;
    }

    public static create = async (
        stack: Stack,
        name: string,
        type: DomainModel["type"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema: DomainModel["schema"] = DEFAULT_RELATION_SCHEMA,
    ) => {
        const domain_ = Domain.get(
            stack, name, type,
            relation, sourceClass, targetClass,
            description, schema
        );
        await domain_.build();
        return domain_;
    }

    static buildFromModel = async (stack: Stack, domainModel: DomainModel) => {
        this.logger.info("buildFromModel - Instantiate from model", {domainModel});
        const domain = Domain.get(
            stack,
            domainModel.name,
            domainModel.type,
            domainModel.relation,
            domainModel.sourceClass,
            domainModel.targetClass,
            domainModel.description,
            domainModel.schema
        );
        domain.setModel(domainModel);
        return domain;
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
            type: this.type,
            relation: this.relation,
            sourceClass: this.sourceClass,
            targetClass: this.targetClass,
            schema: this.getSchema(),
            active: this.model?.active ?? true,
            createTimestamp: this.model ? this.model.createTimestamp : undefined,
            updateTimestamp: this.model ? this.model.updateTimestamp : undefined,
        };
        if (this.model?._rev) {
            model._rev = this.model._rev;
        }
        return model;
    }

    getSchema = () => {
        return cloneDomainSchema(this.schema);
    }

    validateRelation = async (sourceDoc: Document, targetId: string) => {
        if (!this.stack) {
            throw new Error(`Stack is not defined for Domain ${this.name}`);
        }

        const sourceId = sourceDoc._id;
        if (!sourceId) {
            throw new Error("Source document must have an _id to create a relation");
        }

        if (sourceDoc.type !== this.sourceClass || sourceDoc.active === false) {
            return false;
        }

        const targetDoc = await this.stack.db.get<Document>(targetId).catch(() => null);
        if (!targetDoc || targetDoc.type !== this.targetClass || targetDoc.active === false) {
            return false;
        }

        const duplicate = await this.getRelations({ sourceId, targetId });
        if (duplicate.length > 0) {
            return false;
        }

        switch (this.relation) {
            case "1:1": {
                const sourceRelations = await this.getRelations({ sourceId });
                if (sourceRelations.length > 0) return false;
                const targetRelations = await this.getRelations({ targetId });
                if (targetRelations.length > 0) return false;
                return true;
            }
            case "1:N": {
                const targetRelations = await this.getRelations({ targetId });
                return targetRelations.length === 0;
            }
            case "N:1": {
                const sourceRelations = await this.getRelations({ sourceId });
                return sourceRelations.length === 0;
            }
            case "N:N":
                return true;
            default:
                throw new Error(`Unsupported relation type ${this.relation}`);
        }
    }

    getRelations = async (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => {
        if (!this.stack) {
            this.logger.error("Stack is not defined");
            throw new Error("Stack is not defined");
        }

        let _selector = { ...(selector ?? {}), type: this.name };
        this.logger.info("getRelations - selector", {selector: _selector, fields, skip, limit})
        let docs = (await this.stack.findDocuments(_selector, fields, skip, limit)).docs
        return docs;
    }

    addRelation = async ( sourceDoc: Document, targetId: string ) => {
        const fnLogger = this.logger.child({method: "addRelation", args: {targetId}});

        if (!this.stack) {
            fnLogger.error("Stack is not defined");
            throw new Error("Stack is not defined");
        }

        if (!sourceDoc._id) {
            fnLogger.error("Missing source document id");
            throw new Error("Source document must have an _id to create a relation");
        }

        if (await this.validateRelation(sourceDoc, targetId)) {
            fnLogger.info("addRelation - relation validated");
            const params = {
                sourceClass: this.sourceClass,
                targetClass: this.targetClass,
                sourceId: sourceDoc._id,
                targetId
            };
            const relationDoc = await this.stack.createRelationDoc(null, this.name, this, params);
            fnLogger.info("addRelation - relationDoc created", {relationDoc});
            if (!relationDoc) {
                throw new Error("Unable to create relation document");
            }
            return relationDoc;
        } else {
            fnLogger.error("addRelation - relation validation failed");
            throw new Error("Relation validation failed");
        }
    }

    deleteRelation = async (relationId: string) => {
        if (!this.stack) {
            this.logger.error("Stack is not defined");
            throw new Error("Stack is not defined");
        }
        return this.stack.deleteDocument(relationId);
    }
}

export default Domain;
