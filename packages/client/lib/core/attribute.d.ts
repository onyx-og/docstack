import z, { ZodType } from "zod";
import Class from "./class";
import { Attribute as Attribute_, AttributeModel, AttributeType, AttributeTypeConfig } from "@docstack/shared";
declare class Attribute extends Attribute_ {
    name: string;
    description?: string;
    model: AttributeModel;
    field: ZodType;
    class: Class | null;
    defaultValue?: any;
    constructor(classObj: (Class | null) | undefined, name: string, type: AttributeType["type"], description?: string, config?: AttributeType["config"]);
    setField: () => void;
    static create(classObj: Class, name: string, type: AttributeType["type"], description?: string, config?: AttributeType["config"]): Promise<Attribute>;
    isPrimaryKey: () => boolean;
    isMandatory: () => boolean;
    getModel: () => AttributeModel;
    getClass: () => Class;
    validate: (data: any) => Promise<z.ZodSafeParseResult<unknown>>;
    static build: (attributeObj: Attribute) => Promise<Attribute>;
    setModel: (model: AttributeModel) => void;
    getType: (type: AttributeType["type"]) => "string" | "boolean" | "object" | "integer" | "date" | "decimal" | "foreign_key" | "enum" | "relation";
    getEmpty: () => {
        [x: string]: {} | null;
    };
    getName: () => string;
    checkTypeValidity: (type: string) => boolean;
    getTypeConf: (type: AttributeType["type"], config: AttributeType["config"] | undefined) => AttributeTypeConfig | ({
        maxLength?: number;
        encrypted?: boolean;
        defaultValue?: string;
    } & AttributeTypeConfig) | ({
        max?: number;
        min?: number;
        defaultValue?: number;
    } & AttributeTypeConfig) | ({
        format?: string;
        defaultValue?: string | number;
        max?: string | number;
        min?: string | number;
    } & AttributeTypeConfig) | ({
        max?: number;
        min?: number;
        precision?: number;
        defaultValue?: number;
    } & AttributeTypeConfig) | ({
        defaultValue?: boolean;
    } & AttributeTypeConfig) | ({
        targetClass?: string;
    } & AttributeTypeConfig);
}
export default Attribute;
