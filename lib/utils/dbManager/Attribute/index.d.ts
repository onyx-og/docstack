import Class from "../Class";
export type AttributeTypeConfig = {
    isArray?: boolean;
    primaryKey?: boolean;
    mandatory?: boolean;
    defaultValue?: any;
    [key: string]: any;
};
export type AttributeTypeDecimal = {
    type: "decimal";
    name: string;
    config: {
        max?: number;
        min?: number;
        precision?: number;
    } & AttributeTypeConfig;
};
export type AttributeTypeInteger = {
    type: "integer";
    name: string;
    config: {
        max?: number;
        min?: number;
    } & AttributeTypeConfig;
};
export type AttributeTypeString = {
    name: string;
    type: "string";
    config: {
        maxLength?: number;
        encrypted?: boolean;
    } & AttributeTypeConfig;
};
export type AttributeTypeBoolean = {
    type: "boolean";
    name: string;
    config: {
        default?: boolean;
    } & AttributeTypeConfig;
};
export type AttributeTypeForeignKey = {
    type: "foreign_key";
    name: string;
    config: {} & AttributeTypeConfig;
};
export type AttributeType = AttributeTypeString | AttributeTypeInteger | AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey;
export type AttributeModel = {
    name: string;
    config: AttributeType["config"];
    type: AttributeType["type"];
};
declare class Attribute {
    name: string;
    model: AttributeModel;
    class: Class;
    defaultValue?: any;
    constructor(classObj: Class, name: string, type: AttributeType["type"], config?: AttributeType["config"]);
    static create(classObj: Class, name: string, type: AttributeType["type"], config?: AttributeType["config"]): Promise<Attribute>;
    isPrimaryKey(): boolean;
    getModel(): AttributeModel;
    getClass(): Class;
    static build(attributeObj: Attribute): Promise<Attribute>;
    setModel(model: AttributeModel): void;
    getType(type: AttributeType["type"]): "string" | "boolean" | "integer" | "decimal" | "foreign_key";
    getName(): string;
    checkTypeValidity(type: any): boolean;
    getTypeConf(type: AttributeType["type"], config: AttributeType["config"]): AttributeTypeConfig | ({
        maxLength?: number;
        encrypted?: boolean;
    } & AttributeTypeConfig) | ({
        max?: number;
        min?: number;
    } & AttributeTypeConfig) | ({
        max?: number;
        min?: number;
        precision?: number;
    } & AttributeTypeConfig) | ({
        default?: boolean;
    } & AttributeTypeConfig);
}
export default Attribute;
