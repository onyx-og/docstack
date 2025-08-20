"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Class_1 = __importDefault(require("../Class"));
class Domain extends Class_1.default {
    constructor(space, name, title, sourceClass, targetClass, relationType, parentDomain) {
        super(space, name, "domain", title, parentDomain);
        this.sourceClass = sourceClass;
        this.targetClass = targetClass;
        this.relationType = relationType;
    }
    static async build(domainObj) {
        let space = domainObj.getSpace();
        if (space) {
            let domainModel = await space.addDomain(domainObj);
            domainObj.setModel(domainModel);
            return domainObj;
        }
        else {
            throw new Error("Missing db configuration");
        }
    }
    static async buildFromModel(space, domainModel) {
        let parentDomainModel = (domainModel.parentDomain ? await space.getDomainModel(domainModel.parentDomain) : null);
        let parentDomain = (parentDomainModel ? await Domain.buildFromModel(space, parentDomainModel) : null);
        let domainObj = new Domain(space, domainModel.name, domainModel.title, domainModel.sourceClass, domainModel.targetClass, domainModel.relationType, parentDomain);
        domainObj.setModel(domainModel);
        return domainObj;
    }
    static async fetch(space, domainName) {
        let domainModel = await space.getDomainModel(domainName);
        if (domainModel) {
            return Domain.buildFromModel(space, domainModel);
        }
        else {
            throw new Error("Domain not found: " + domainName);
        }
    }
    getType() {
        return this.type;
    }
    getModel() {
        let model = {
            _id: this.getName(),
            name: this.getName(),
            description: this.getTitle(),
            _rev: undefined,
            createTimestamp: this.model.createTimestamp,
            updateTimestamp: this.model.updateTimestamp,
            type: this.getType(),
            relationType: this.relationType,
            sourceClass: this.sourceClass,
            targetClass: this.targetClass
        };
        // iterate over attributes and append their model
        for (let attribute of this.getAttributes()) {
            let attributeModel = attribute.getModel();
            model["schema"].push(attributeModel);
        }
        return model;
    }
    setModel(model) {
        let currentModel = this.getModel();
        let _model = Object.assign(currentModel, Object.assign(Object.assign({}, model), { schema: this.schema }));
        for (let attribute of model.schema) {
            this.addAttribute(attribute.name, attribute.type);
        }
        this.model = Object.assign(Object.assign({}, _model), { schema: this.schema });
        this.name = model.name;
        this.title = model.description;
        this.relationType = model.relationType;
        this.sourceClass = model.sourceClass;
        this.targetClass = model.targetClass;
    }
}
exports.default = Domain;
//# sourceMappingURL=index.js.map