import Attribute, { AttributeTypeConfig } from "../Attribute";
import Class from "../Class";
export type AttributeTypeReference = {
    type: "reference";
    name: string;
    config: {
        domain: string;
        position: "source" | "target";
    } & AttributeTypeConfig;
};
declare class ReferenceAttribute extends Attribute {
    domain: string;
    name: string;
    model: any;
    position: "source" | "target";
    constructor(classObj: Class, name: string, config: AttributeTypeReference["config"]);
    static build(attributeObj: ReferenceAttribute): Promise<ReferenceAttribute>;
}
export default ReferenceAttribute;
