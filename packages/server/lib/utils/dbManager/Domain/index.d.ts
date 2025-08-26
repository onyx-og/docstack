import { AttributeModel } from "../Attribute";
import Class, { ClassModel } from "../Class";
import Surfer from "../Surfer";
export type DomainModel = ClassModel & {
    name: string;
    description: string;
    type: "domain";
    parentDomain?: string;
    sourceClass: string[];
    targetClass: string[];
    relationType: "one-to-one" | "one-to-many" | "many-to-many";
    schema?: AttributeModel[];
};
declare class Domain extends Class {
    model: DomainModel;
    parentDomain: Domain | null;
    type: "domain";
    sourceClass: string[];
    targetClass: string[];
    relationType: "one-to-one" | "one-to-many" | "many-to-many";
    constructor(space: Surfer, name: string, title: string, sourceClass: string[], targetClass: string[], relationType: "one-to-one" | "one-to-many" | "many-to-many", parentDomain?: Domain);
    static build(domainObj: Domain): Promise<Domain>;
    static buildFromModel(space: Surfer, domainModel: DomainModel): any;
    static fetch(space: Surfer, domainName: string): Promise<any>;
    getType(): "domain";
    getModel(): DomainModel;
    setModel(model: DomainModel): void;
}
export default Domain;
