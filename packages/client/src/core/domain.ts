import { DomainModel, Stack } from "@docstack/shared";
import { createLogger, Logger } from "winston";

class Domain extends EventTarget {
    stack: Stack | undefined;
    name!: string;
    type!: "domain";
    description?: string;
    id!: string;
    schema: DomainModel["schema"] = {};
    relation!: DomainModel["relation"];
    sourceClass!: string;
    targetClass!: string;
    // parentDomain: Domain | null;
    model!: DomainModel;
    state: "busy" | "idle" = "idle";
    static logger: Logger = createLogger().child({module: "domain"});
    logger: Logger = createLogger().child({module: "domain", domainName: this.name});
    
    private constructor() {
        super();
    }

    getStack = () => {
        return this.stack;
    }

    setId = ( id: string ) => {
        this.id = id;
    } 

    setModel = ( model?: DomainModel ) => {
        this.logger.info("setModel - got incoming model", {model: model});
        // Retreive current class model
        let currentModel = this.getModel();
        // Set model arg to the overwrite of the current model with the given one 
        model = Object.assign(currentModel, model);

        this.id = model._id;
        this.name = model.name;
        this.description = model.description;
        this.relation = model.relation;
        this.sourceClass = model.sourceClass;
        this.targetClass = model.targetClass;
        this.model = model;
        this.logger.info("setModel - model after processing",{ model: model})
    }

    build = (): Promise<Domain> => {
        return new Promise(async (resolve, reject) => {
            let stack = this.getStack();
            if (stack) {
                let domainModel = await stack.addDomain(this);
                if (domainModel) {
                    // Hydrate model
                    this.setModel(domainModel);
                    this.logger.info("build - domainModel", {domainModel});
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
        name: string,
        type: "domain",
        relation: typeof this.relation,
        sourceClass: string,
        targetClass: string,
        description?: string,

        // schema: DomainModel["schema"] = {}
    ) => {
        this.name = name;
        this.id = name;
        this.description = description;
        this.type = type;
        this.relation = relation;
        this.sourceClass = sourceClass;
        this.targetClass = targetClass;
        this.setModel({
            type, _id: name, active: true,
            name, relation, sourceClass,
            targetClass, description,
        })

        if (stack) {
            this.stack = stack;
        }
    }

    public static get = (
        stack: Stack,
        name: string,
        type: "domain" = "domain",
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema: DomainModel["schema"] = {},
    ) => {
        const domain_ = new Domain();
        this.logger.info("Received schema", {schema})
        domain_.init(
            stack, name, type, relation, sourceClass, targetClass,description);
        // Add listener for new documents of this class type
        domain_.stack!.onClassDoc(name)
            .on("change", (change) => {
                console.log("onClassDoc", {change})
                const evt = new CustomEvent("doc", {
                    detail: change
                })
                domain_.dispatchEvent(evt);
            })
        return domain_;
    }

    public static create = async (
        stack: Stack,
        name: string,
        type: "domain" = "domain",
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema: DomainModel["schema"] = {},
        // parentClass: Class | null = null
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
        // let parentdomainModel = (domainModel.parentClass ? await stack.getdomainModel(domainModel.parentClass) : null);
        // let parentClass = (parentdomainModel ? await Class.buildFromModel(stack, parentdomainModel) : null);

        // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
        if (domainModel._rev) {
            let classObj: Domain = Domain.get(
                stack, domainModel.name, 
                domainModel.type, domainModel.relation,
                domainModel.sourceClass, domainModel.targetClass,
                domainModel.description, domainModel.schema
            )
            return classObj;
        } else {
            let classObj: Domain = await Domain.create(
                stack, domainModel.name, domainModel.type,
                domainModel.relation, domainModel.sourceClass,
                domainModel.targetClass, domainModel.description,
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
            type: this.type,
            relation: this.relation,
            sourceClass: this.sourceClass,
            targetClass: this.targetClass,
            // schema: this.buildSchema(),
            active: true,
            _rev: this.model ? this.model._rev : "", // [TODO] Error prone
            createTimestamp: this.model ? this.model.createTimestamp : undefined,
        };
        return model;
    }
}

export default Domain;