import Stack from "./utils/stack";
import type Class from "./utils/stack/class";
import Trigger from "./utils/stack/trigger";


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
    config: {max?: number, min?: number, precision?: number, defaultValue?: number} & AttributeTypeConfig
}
export type AttributeTypeInteger = {
    type: "integer",
    name: string,
    config: {max?: number, min?: number, defaultValue?: number} & AttributeTypeConfig
}
export type AttributeTypeString = {
    type: "string",
    name: string,
    config: {maxLength?: number, encrypted?: boolean, defaultValue?: string} & AttributeTypeConfig
}

export type AttribruteTypeDate = {
    type: "date",
    name: string,
    config: {format?: string, defaultValue?: string | number, max?: string|number, min?: string | number} & AttributeTypeConfig
}

export type AttributeTypeBoolean = {
    type: "boolean",
    name: string,
    config: {defaultValue?: boolean} & AttributeTypeConfig
}
export type AttributeTypeForeignKey = {
    type: "foreign_key",
    name: string,
    config: {targetClass?: string} & AttributeTypeConfig
}
export type AttributeTypeObject = {
    type: "object",
    name: string,
    config: {} & AttributeTypeConfig
}
export type AttributeType = 
    AttributeTypeString | AttributeTypeInteger | AttribruteTypeDate |
    AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey |
    AttributeTypeObject;
export type AttributeModel = {
    name: string,
    description?: string,
    config: AttributeType["config"],
    type: AttributeType["type"] 
}

export interface ClassModel extends Document {
    type: string,
    name: string,
    description?: string,
    parentClass?: string,
    _rev?: PouchDB.Core.RevisionId | undefined;
    schema: {[name: string]: AttributeModel};
    triggers: TriggerModel[];
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

export type StackOptions = {
    name?: string,
    plugins?: PouchDB.Plugin[]
} & PouchDB.Configuration.DatabaseConfiguration

export type StackConfig = ({
    connection?: string;
} & StackOptions) | string | `db-${string}`;

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

// Interfaces for the Trigger's data model and hydrated function signature.
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
    stack: Stack
}>

export const isDocument = (object: object): object is Document => {
    if (object.hasOwnProperty("type")) {
        return true;
    }
    return false;
}

export const isClassModel = (object: {[key: string]: any}): object is ClassModel => {
    if (object.hasOwnProperty("type") && object.type === "class") {
        return true;
    }
    return false;
}

export type StackPluginType = (stackInstance: Stack) => {
    bulkDocs<Model>(
        docs: Array<PouchDB.Core.PutDocument<{} & Model>>,
        options: PouchDB.Core.BulkDocsOptions | null,
        callback: PouchDB.Core.Callback<Array<PouchDB.Core.Response | PouchDB.Core.Error>>,
    ): void;
}

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

export {Class};