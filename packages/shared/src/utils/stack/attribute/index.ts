import Class from "../class";
import { AttributeModel, AttributeType, ATTRIBUTE_TYPES, AttributeTypeConfig, Document } from "../../../types";
import { z, ZodAny, ZodDefault } from "zod";

abstract class Attribute {
    abstract name: string;
    abstract description?: string;
    model!: AttributeModel;
    abstract field: z.ZodType;
    class: Class | null = null;
    defaultValue?: any;
    
    constructor(classObj: Class | null = null, name: string, type: AttributeType["type"], config?: AttributeType["config"] ) {
        
    }

    static create: (
        classObj: Class,
        name: string,
        type: AttributeType["type"],
        description?: string,
        config?: AttributeType["config"] 
    ) => Promise<Attribute | null>;

    abstract isPrimaryKey: () => boolean;

    abstract isMandatory: () => boolean;

    abstract getModel: () => AttributeModel;

    abstract getEmpty: () => { [attrName: string]: any };

    abstract setField: () => void;

    abstract validate: (data: any) =>  Promise<z.ZodSafeParseResult<unknown>>;

    abstract getClass: () => Class;

    static build: ( attributeObj: Attribute ) => Promise<Attribute | null>;

    abstract setModel: ( model: AttributeModel ) => void;
    
    // TODO: Better define config
    abstract getType: ( type: AttributeType["type"]) => AttributeType["type"];

    // getType()

    abstract getName: () => string;

    abstract checkTypeValidity: (type: string) => boolean;

    abstract getTypeConf: ( type: AttributeType["type"], config: AttributeType["config"] | undefined ) => AttributeTypeConfig;
}

export default Attribute;