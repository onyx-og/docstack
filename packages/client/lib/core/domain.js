var _a;
import { Domain as Domain_ } from "@docstack/shared";
import { createLogger } from "winston";
class Domain extends Domain_ {
    constructor() {
        super();
        this.schema = {};
        this.state = "idle";
        this.logger = createLogger().child({ module: "domain", domainName: this.name });
        this.getStack = () => {
            return this.stack;
        };
        this.setId = (id) => {
            this.id = id;
        };
        this.setModel = (model) => {
            this.logger.info("setModel - got incoming model", { model: model });
            // Retreive current class model
            let currentModel = this.getModel();
            // Set model arg to the overwrite of the current model with the given one 
            model = Object.assign(currentModel, model);
            this.id = model._id;
            this.name = model.name;
            this.description = model.description;
            this.relation = model.relation;
            this.type = model["~class"];
            this.sourceClass = model.sourceClass;
            this.targetClass = model.targetClass;
            this.model = model;
            this.logger.info("setModel - model after processing", { model: model });
        };
        this.build = () => {
            return new Promise(async (resolve, reject) => {
                let stack = this.getStack();
                if (stack) {
                    let domainModel = await stack.addDomain(this);
                    if (domainModel) {
                        // Hydrate model
                        this.setModel(domainModel);
                        this.logger.info("build - domainModel", { domainModel });
                        this.setId(domainModel._id);
                        resolve(this);
                    }
                    else {
                        reject("Unable to get create domainModel. Check logs.");
                    }
                }
                else {
                    reject("Missing stack assignment");
                }
            });
        };
        this.init = (stack, name, type, relation, sourceClass, targetClass, description) => {
            this.name = name;
            this.id = name;
            this.description = description;
            this.type = type;
            this.relation = relation;
            this.sourceClass = sourceClass;
            this.targetClass = targetClass;
            this.setModel({
                "~class": type, _id: name, active: true,
                name, relation, sourceClass,
                targetClass, description,
            });
            if (stack) {
                this.stack = stack;
            }
        };
        this.getModel = () => {
            let model = {
                _id: this.id,
                name: this.name,
                description: this.description,
                "~class": this.type,
                relation: this.relation,
                sourceClass: this.sourceClass,
                targetClass: this.targetClass,
                // schema: this.buildSchema(),
                active: true,
                _rev: this.model ? this.model._rev : "", // [TODO] Error prone
                "~createTimestamp": this.model ? this.model["~createTimestamp"] : undefined,
            };
            return model;
        };
        this.validateRelation = async (sourceDoc, targetId) => {
            const source = this.sourceClass;
            const target = this.targetClass;
            const type = this.relation;
            if (this.stack) {
                const targetDoc = await this.stack.db.get(targetId).catch(() => null);
                if (!targetDoc)
                    return false; // Target must exist.
                switch (type) {
                    case "1:1":
                        // Ensure neither already participates in another relation
                        return true;
                    case "1:N":
                        // Ensure target is not linked to another source
                        return true;
                    case "N:N":
                        return true;
                    default:
                        throw new Error(`Unsupported relation type ${type}`);
                }
            }
            else {
                throw new Error(`Stack is not defined for Domain ${this.name}`);
            }
        };
        this.addRelation = async (sourceDoc, targetId) => {
            const fnLogger = this.logger.child({ method: "addRelation", args: { sourceDoc, targetId } });
            if (!this.stack) {
                fnLogger.error("Stack is not defined");
                throw new Error("Stack is not defined");
            }
            if (await this.validateRelation(sourceDoc, targetId)) {
                // Create document representing the relation
                fnLogger.info("addRelation - relation validated");
                const params = {
                    sourceClass: this.sourceClass,
                    targetClass: this.targetClass,
                    sourceId: sourceDoc.id,
                    targetId
                };
                const relationDoc = await this.stack.createRelationDoc(null, this.name, this, params);
                fnLogger.info("addRelation - relationDoc created", { relationDoc });
                return relationDoc;
            }
            else {
                fnLogger.error("addRelation - relation validation failed");
                throw new Error("Relation validation failed");
            }
        };
    }
}
_a = Domain;
Domain.logger = createLogger().child({ module: "domain" });
Domain.get = (stack, name, type = "domain", relation, sourceClass, targetClass, description, schema = {}) => {
    const domain_ = new _a();
    _a.logger.info("Received schema", { schema });
    domain_.init(stack, name, type, relation, sourceClass, targetClass, description);
    // Add listener for new documents of this class type
    domain_.stack.onClassDoc(name)
        .on("change", (change) => {
        console.log("onClassDoc", { change });
        const evt = new CustomEvent("doc", {
            detail: change
        });
        domain_.dispatchEvent(evt);
    });
    return domain_;
};
Domain.create = async (stack, name, type = "domain", relation, sourceClass, targetClass, description, schema = {}) => {
    const domain_ = _a.get(stack, name, type, relation, sourceClass, targetClass, description, schema);
    await domain_.build();
    return domain_;
};
Domain.buildFromModel = async (stack, domainModel) => {
    _a.logger.info("buildFromModel - Instantiate from model", { domainModel });
    // let parentdomainModel = (domainModel.parentClass ? await stack.getdomainModel(domainModel.parentClass) : null);
    // let parentClass = (parentdomainModel ? await Class.buildFromModel(stack, parentdomainModel) : null);
    // [TODO] Redundancy: Class.create retrieve model from db and builds it (therefore also setting the model)
    if (domainModel._rev) {
        let classObj = _a.get(stack, domainModel.name, domainModel["~class"], domainModel.relation, domainModel.sourceClass, domainModel.targetClass, domainModel.description, domainModel.schema);
        return classObj;
    }
    else {
        let classObj = await _a.create(stack, domainModel.name, domainModel["~class"], domainModel.relation, domainModel.sourceClass, domainModel.targetClass, domainModel.description, domainModel.schema);
        return classObj;
    }
};
Domain.fetch = async (stack, domainName) => {
    let domainModel = await stack.getDomainModel(domainName);
    if (domainModel) {
        return _a.buildFromModel(stack, domainModel);
    }
    else {
        return null;
        throw new Error("Class not found: " + domainName);
    }
};
export default Domain;
//# sourceMappingURL=domain.js.map