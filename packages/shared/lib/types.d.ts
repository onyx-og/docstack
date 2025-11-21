import Domain from "./utils/stack/domain";
import Stack from "./utils/stack";
import type Class from "./utils/stack/class";
export declare const ATTRIBUTE_TYPES: string[];
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
        defaultValue?: number;
    } & AttributeTypeConfig;
};
export type AttributeTypeInteger = {
    type: "integer";
    name: string;
    config: {
        max?: number;
        min?: number;
        defaultValue?: number;
    } & AttributeTypeConfig;
};
export type AttributeTypeString = {
    type: "string";
    name: string;
    config: {
        maxLength?: number;
        encrypted?: boolean;
        defaultValue?: string;
    } & AttributeTypeConfig;
};
export type AttribruteTypeDate = {
    type: "date";
    name: string;
    config: {
        format?: string;
        defaultValue?: string | number;
        max?: string | number;
        min?: string | number;
    } & AttributeTypeConfig;
};
export type AttributeTypeBoolean = {
    type: "boolean";
    name: string;
    config: {
        defaultValue?: boolean;
    } & AttributeTypeConfig;
};
export type AttributeTypeForeignKey = {
    type: "foreign_key";
    name: string;
    config: {
        targetClass?: string;
    } & AttributeTypeConfig;
};
export type AttributeTypeObject = {
    type: "object";
    name: string;
    config: {} & AttributeTypeConfig;
};
export type AttributeTypeEnum = {
    type: "enum";
    name: string;
    config: {
        values: {
            value: string | number | object;
        }[];
        type: AttributeType["type"];
    } & AttributeTypeConfig;
};
export type AttributeTypeRelation = {
    type: "relation";
    name: string;
    config: {
        domain: string;
    } & AttributeTypeConfig;
};
export type AttributeType = AttributeTypeString | AttributeTypeInteger | AttribruteTypeDate | AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey | AttributeTypeObject | AttributeTypeEnum | AttributeTypeRelation;
export type AttributeModel = {
    name: string;
    description?: string;
    config: AttributeType["config"];
    type: AttributeType["type"];
};
export interface ClassModel extends Document {
    "~class": "class" | "~self";
    name: string;
    description?: string;
    parentClass?: string;
    _rev?: PouchDB.Core.RevisionId | undefined;
    schema: {
        [name: string]: AttributeModel;
    };
    triggers: TriggerModel[];
}
export interface DomainModel extends Document {
    "~class": "domain" | "~self";
    name: string;
    relation: "1:1" | "1:N" | "N:1" | "N:N";
    sourceClass: string;
    targetClass: string;
    description?: string;
    parentDomain?: string;
    _rev?: PouchDB.Core.RevisionId | undefined;
}
export type Document = PouchDB.Core.Document<{
    "~class"?: string;
    "~domain"?: string;
    "~createTimestamp"?: number;
    "~updateTimestamp"?: number | null;
    active?: boolean;
    [key: string]: any;
}>;
export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string | undefined;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}
export interface Patch extends Document {
    "~class": "patch";
    target: string;
    version: string;
    changelog?: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any;
    }> | PouchDB.Core.Document<{
        [key: string]: any;
    }>)[];
}
export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string | undefined;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}
export type StackOptions = {
    name?: string;
    plugins?: PouchDB.Plugin[];
} & PouchDB.Configuration.DatabaseConfiguration;
export type StackConfig = ({
    connection?: string;
} & StackOptions) | string | `db-${string}`;
export type CachedClass = Class & {
    ttl: number;
};
export type CachedDomain = Domain & {
    ttl: number;
};
export interface ClassModelPropagationStart {
    className: string;
}
export interface ClassModelPropagationComplete {
    className: string;
    success: boolean;
    message?: string;
}
export interface TriggerModel {
    name: string;
    order: "before" | "after";
    run: string;
}
/**
 * The signature of the dynamically generated 'run' function.
 * It takes a document and returns the updated document.
 * It is now asynchronous by default.
 */
export type TriggerRunFunction = (document: Document, classObj?: Class, stack?: Stack) => Document | Promise<Document>;
export type DocstackReady = CustomEventInit<{
    stack: Stack;
}>;
export declare const isDocument: (object: object) => object is Document;
export declare const isClassModel: (object: {
    [key: string]: any;
}) => object is ClassModel;
export type StackPluginType = (stackInstance: Stack) => {
    bulkDocs<Model>(docs: Array<PouchDB.Core.PutDocument<{} & Model>>, options: PouchDB.Core.BulkDocsOptions | null, callback: PouchDB.Core.Callback<Array<PouchDB.Core.Response | PouchDB.Core.Error>>): void;
};
export interface DesignDocument extends PouchDB.Core.Document<any> {
    _id: `_design/${string}`;
    _rev: string;
    views: {
        [viewName: string]: {
            map: string;
            reduce?: string;
        };
    };
}
export type SelectAST = {
    type: 'select';
    distinct: boolean;
    columns: any[];
    from: any[];
    joins: any[];
    where: any | null;
    groupBy: {
        type: 'group_by';
        columns: any[];
    } | null;
    having: any | null;
    orderBy: Array<{
        expr: any;
        order: 'ASC' | 'DESC';
    }> | null;
    limit: number | null;
};
export type UnionAST = {
    type: 'union';
    /** upper SelectAST's index */
    top: number;
    /** lower SelectAST's index */
    bottom: number;
    distinct: boolean;
};
export { Class };
