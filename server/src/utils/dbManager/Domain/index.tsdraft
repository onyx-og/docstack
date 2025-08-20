import { AttributeModel } from "../Attribute";
import Class, { ClassModel } from "../Class"
import ReferenceAttribute from "../Reference";
import Surfer, { Document }  from "../Surfer";

export type DomainModel = ClassModel & {
    name: string,
    description: string,
    type: "domain",
    parentDomain?: string,
    sourceClass: string[],
    targetClass: string[],
    relationType: "one-to-one" | "one-to-many" | "many-to-many",
    schema?: AttributeModel[]
}
class Domain extends Class {
    model: DomainModel;
    parentDomain: Domain | null;
    type: "domain";
    sourceClass: string[];
    targetClass: string[];
    public relationType: "one-to-one" | "one-to-many" | "many-to-many";

    constructor(space: Surfer, name: string, title: string,  sourceClass: string[], targetClass: string[], relationType: "one-to-one" | "one-to-many" | "many-to-many", parentDomain?: Domain) {
        super(space, name, "domain", title, parentDomain);
        this.sourceClass = sourceClass;
        this.targetClass = targetClass;
        this.relationType = relationType;
    }

    static async build(domainObj: Domain) {
        let space = domainObj.getSpace();
        if (space) {
            let domainModel = await space.addDomain(domainObj);
            domainObj.setModel(domainModel)
            return domainObj;
        } else {
            throw new Error("Missing db configuration");
        }
    }

    static async buildFromModel(space: Surfer, domainModel: DomainModel) {
        let parentDomainModel = (domainModel.parentDomain ? await space.getDomainModel(domainModel.parentDomain) : null);
        let parentDomain = (parentDomainModel ? await Domain.buildFromModel(space, parentDomainModel) : null);
        let domainObj = new Domain(space, domainModel.name, domainModel.title, domainModel.sourceClass, domainModel.targetClass, domainModel.relationType, parentDomain);
        domainObj.setModel(domainModel);
        return domainObj;
    }

    static async fetch( space: Surfer, domainName: string ) {
        let domainModel = await space.getDomainModel(domainName);
        if ( domainModel ) {
            return Domain.buildFromModel(space, domainModel);
        } else {
            throw new Error("Domain not found: "+domainName);
        }
    }

    getType() {
        return this.type;
    }

    getModel() {
        let model: DomainModel = {
            _id:this.getName(),
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
        for ( let attribute of this.getAttributes() ) {
            let attributeModel = attribute.getModel();
            model["schema"].push( attributeModel );
        }
        return model as DomainModel;
    }

    setModel( model: DomainModel ) {
        let currentModel = this.getModel();
        let _model = Object.assign(currentModel, {...model, schema: this.schema});
        for (let attribute of model.schema) {
            this.addAttribute(attribute.name, attribute.type);
        }
        this.model = {..._model, schema: this.schema};
        this.name = model.name;
        this.title = model.description;
        this.relationType = model.relationType;
        this.sourceClass = model.sourceClass;
        this.targetClass = model.targetClass;
    }

}

export default Domain