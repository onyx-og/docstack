import Attribute, { AttributeTypeConfig } from "../Attribute";
import Class from "../Class";
export type AttributeTypeReference = {
    type: "reference",
    name: string,
    config: {
        domain: string,
        position: "source" | "target"
    } & AttributeTypeConfig
}
class ReferenceAttribute extends Attribute {
    domain: string;
    name: string;
    model: any;
    position: "source" | "target";

    constructor(classObj: Class = null, name: string, config: AttributeTypeReference["config"]) {
        super(classObj, name, "reference", config);
        this.domain = config.domain;
        this.position = config.position;
    }

    static async build( attributeObj: ReferenceAttribute ) {
        let classObj = attributeObj.getClass();
        let db = classObj.getSpace();
        if ( db ) {
            await classObj.addReferenceAttribute(attributeObj);
            return attributeObj;
        } else {
            throw new Error("Missing db configuration");
        }
    }
}

export default ReferenceAttribute;