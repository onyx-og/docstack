import Class from "./utils/stack/class";


export const ATTRIBUTE_TYPES = ["string", "number", "integer", "reference", "boolean"];

export type AttributeTypeConfig = {
    isArray?: boolean,
    primaryKey?: boolean,
    mandatory?: boolean,
    defaultValue?: any,
    [key: string]: any
}
export type AttributeTypeDecimal = {
    type: "decimal",
    name: string,
    config: {max?: number, min?: number, precision?: number} & AttributeTypeConfig
}
export type AttributeTypeInteger = {
    type: "integer",
    name: string,
    config: {max?: number, min?: number} & AttributeTypeConfig
}
export type AttributeTypeString = {
    name: string,
    type: "string",
    config: {maxLength?: number, encrypted?: boolean} & AttributeTypeConfig
}

export type AttributeTypeBoolean = {
    type: "boolean",
    name: string,
    config: {} & AttributeTypeConfig
}
export type AttributeTypeForeignKey = {
    type: "foreign_key",
    name: string,
    config: {} & AttributeTypeConfig
}
export type AttributeType = AttributeTypeString | AttributeTypeInteger | 
    AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey;
export type AttributeModel = {
    name: string,
    config: AttributeType["config"],
    type: AttributeType["type"] 
}

export interface ClassModel extends Document {
    type: string,
    name: string,
    description?: string,
    parentClass?: string,
    _rev?: PouchDB.Core.RevisionId | undefined;
    schema?: AttributeModel[];
}


export type Document = PouchDB.Core.Document<{
    type: string;
    createTimestamp?: number; // [TODO] Error prone
    updateTimestamp?: number | null;
    active: boolean;
    [key: string]: any
}>

// The idea is to make this patch object be processed
// storing the version of the patch and the documents contained in it
export interface Patch {
    version: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any
    }> | PouchDB.Core.Document<{[key: string]: any}>)[]
}

export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string | undefined;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}

// The idea is to make this patch object be processed
// storing the version of the patch and the documents contained in it
export interface Patch {
    version: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any
    }> | PouchDB.Core.Document<{[key: string]: any}>)[]
}

export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string | undefined;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}

export type StoreOptions = {
    plugins: PouchDB.Plugin[]
} & PouchDB.Configuration.DatabaseConfiguration 

export type CachedClass = Class & {
    ttl: number
}

export interface ClassModelPropagationStart {
    className: string;
}

export interface ClassModelPropagationComplete {
    className: string;
    success: boolean;
    message?: string;
}