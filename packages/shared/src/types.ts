import Domain from "./utils/stack/domain.js";
import Stack from "./utils/stack/index.js";
import type Class from "./utils/stack/class/index.js";
import Trigger from "./utils/stack/trigger.js";

export type JobStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILURE" | "CANCELED" | "SKIPPED";
export type JobTriggerType = "manual" | "scheduled" | "event";
export type JobType = "system" | "user";
export type JobWorkerPlatform = "client" | "server" | "hybrid";


export const ATTRIBUTE_TYPES = ["string", "decimal", "integer", "foreign_key", "date", "enum", "reference", "object", "boolean"];

export type AttributeTypeConfig = {
    isArray?: boolean,
    primaryKey?: boolean,
    mandatory?: boolean,
    encrypted?: boolean,
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
    config: {maxLength?: number, defaultValue?: string} & AttributeTypeConfig
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
export type AttributeTypeEnum = {
    type: "enum",
    name: string,
    config: {
        values: {
            value: string | number | object
        }[],
        type: AttributeType["type"]
    } & AttributeTypeConfig
}
export type AttributeTypeReference = {
    type: "reference",
    name: string,
    config: {
        domain: string,
    } & AttributeTypeConfig
}
export type AttributeType =
    AttributeTypeString | AttributeTypeInteger | AttribruteTypeDate |
    AttributeTypeDecimal | AttributeTypeBoolean | AttributeTypeForeignKey |
    AttributeTypeObject | AttributeTypeEnum | AttributeTypeReference;
export type AttributeModel = {
    name: string,
    description?: string,
    config: AttributeType["config"],
    type: AttributeType["type"] 
}

export interface ClassModel extends Document {
    "~class": "class" | "~self",
    name: string,
    description?: string,
    parentClass?: string,
    _rev?: PouchDB.Core.RevisionId | undefined;
    schema: {[name: string]: AttributeModel};
    triggers: TriggerModel[];
}

export interface DomainModel extends Document {
    "~class": "domain" | "~self",
    name: string,
    relation: "1:1" | "1:N" | "N:1" | "N:N";
    sourceClass: string;
    targetClass: string;
    description?: string,
    _rev?: PouchDB.Core.RevisionId | undefined;
}

export type DomainRelationParams = {
    sourceClass: string;
    targetClass: string;
    sourceId: string;
    targetId: string;
}

export interface DomainRelationValidation {
    params: DomainRelationParams;
    exists: boolean;
    relation?: RelationDocument | null;
}

type BaseDocumentFields = {
    "~createTimestamp"?: number; // [TODO] Error prone
    "~updateTimestamp"?: number | null;
    active?: boolean;
    [key: string]: any
}

/** Arbitrary structured context attached to a log line. */
export type LogFields = Record<string, unknown>;

/** Severity, most severe first. */
export type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * The logging surface DocStack uses.
 *
 * Declared here, structurally, rather than taken from a logging library. It used to be
 * winston's `Logger`, which made every consumer of a browser package configure Node
 * polyfills - `fs`, `http`, `zlib` and the rest - for a type. Anything with these five
 * methods satisfies it, so an application can supply its own.
 */
export interface Logger {
    /** Returns a logger that adds `fields` to everything it writes, cumulatively. */
    child(fields: LogFields): Logger;
    error(message: string, fields?: unknown): void;
    warn(message: string, fields?: unknown): void;
    info(message: string, fields?: unknown): void;
    debug(message: string, fields?: unknown): void;
}

export type Document = PouchDB.Core.Document<{
    "~class": string;
    "~domain"?: never;
} & BaseDocumentFields>

export type RelationDocument = PouchDB.Core.Document<{
    "~domain": string;
    "~class"?: never;
} & BaseDocumentFields>

export interface SystemDoc {
    _id: string;
    appVersion: string;
    schemaVersion: string | undefined;
    dbInfo: PouchDB.Core.DatabaseInfo;
    startupTime: number;
}

// The idea is to make this patch object be processed
// storing the version of the patch and the documents contained in it
export interface Patch extends Document {
    "~class": "patch";
    target: string;
    version: string;
    changelog?: string;
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
    plugins?: PouchDB.Plugin[],
    patches?: Patch[];
    credentials?: ClientCredentials;
    /**
     * Disable the client-side crypto engine for this stack. This flag is persisted on
     * first use and cannot be changed when reopening the same database.
     */
    disableCryptoEngine?: boolean;

    /**
     * The document encryption key, as a hex string, supplied by the application.
     *
     * DocStack never invents this key: one generated per session could not outlive it,
     * and a second device would generate a different one. Provision it from wherever the
     * application can hand the same value to every device of a user - typically its own
     * server - or let {@link ClientCredentials} recover it through the wrapped-key path.
     *
     * Omitting it opens the stack locked: readable, but refusing writes to any class
     * carrying encrypted attributes until `stack.unlock(key)` supplies one. See
     * ADR-0018.
     */
    documentKey?: string;
} & PouchDB.Configuration.DatabaseConfiguration

export type StackConfig = ({
    connection?: string;
    plugins?: any[];
} & StackOptions) | string | `db-${string}`;

export type CachedClass = Class & {
    ttl: number
}

export type CachedDomain = Domain & {
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
    run?: string;
    jobId?: string;
}

/**
 * The signature of the dynamically generated 'run' function.
 * It takes a document and returns the updated document.
 * It is now asynchronous by default.
 */
export type TriggerRunFunction = (document: Document, classObj?: Class, stack?: Stack) => Document | Promise<Document>;

export interface JobModel extends Document {
    "~class": "~Job";
    name: string;
    description?: string;
    type: JobType;
    workerPlatform: JobWorkerPlatform;
    content: string;
    hash: string;
    schedule?: string | null;
    isSingleton?: boolean;
    isEnabled: boolean;
    nextRunTimestamp?: number | null;
    defaultParams?: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface JobRunModel extends Document {
    "~class": "~JobRun";
    jobId: string;
    status: JobStatus;
    triggerType: JobTriggerType;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    runtimeArgs?: Record<string, any>;
    initialMetadata?: Record<string, any>;
    finalMetadata?: Record<string, any>;
    errorMessage?: string;
    errorStack?: string;
    logs?: string | string[];
    workerId?: string;
}

export interface PolicyModel extends Document {
    "~class": "~Policy";
    userId?: string;
    groupId?: string;
    rule: string;
    description?: string;
    targetClass: string[];
}

export interface AuthModuleModel extends Document {
    "~class": "~AuthModule";
    name: string;
    config?: Record<string, any>;
    jobId: string;
}

export interface UserModel extends Document {
    "~class": "~User";
    username: string;
    password: string;
    groupId: string[];
    email?: string;
    firstName?: string;
    lastName?: string;
    authMethod: string;
    externalId?: string;
    keyDerivationSalt: string;
    wrappedDocumentKey?: string;
}

export interface UserSessionModel extends Document {
    "~class": "~UserSession";
    userId: string;
    groupId: string[];
    username: string;
    sessionId: string;
    sessionStart: string;
    sessionStatus: string;
    sessionEnd?: string;
}

export interface AuthSessionProof {
    session: UserSessionModel;
    derivedKey?: string;
    documentKey?: string;
}

export type ClientCredentials = {
    username: string;
    password: string;
    stackName?: string;
};

export type DocstackReady = CustomEventInit<{
    stack: Stack
}>

export const isDocument = (object: object): object is Document => {
    return object.hasOwnProperty("~class");
}

export const isRelation = (object: {[key: string]: any}): object is RelationDocument => {
    if (object.hasOwnProperty("~domain") && !object.hasOwnProperty("~class")) {
        return true;
    }
    return false;
}

export const isPatch = (object: {[key: string]: any}): object is Patch => {
    if (object.hasOwnProperty("~class") && object["~class"] === "patch") {
        return true;
    }
    return false;
}

export const isClassModel = (object: {[key: string]: any}): object is ClassModel => {
    if (object.hasOwnProperty("~class") && ["class","~self"].includes(object["~class"])) {
        return true;
    }
    return false;
}

export const isAttributeModel = (object: {[key: string]: any}): object is AttributeModel => {
    if (object.hasOwnProperty("name") && object.hasOwnProperty("type") && object.hasOwnProperty("config")) {
        return true;
    }
    return false;
}

/**
 * The database methods a stack plugin wraps, captured before it replaces them.
 *
 * Unbound: the plugin forwards with `.call(this, ...)` so the receiver is whichever
 * database is being written to.
 */
export type PristineDbMethods = {
    bulkDocs: Function;
    bulkGet: Function;
};

/**
 * Builds the plugin that wraps a stack's database methods.
 *
 * `pristine` is an argument rather than something the plugin looks up, and that is
 * load-bearing. It cannot be taken from `pouch.prototype`: PouchDB installs the core
 * document methods per instance, so `PouchDB.prototype.bulkDocs` is `undefined` on
 * PouchDB 9 and the capture would silently be nothing. It cannot be taken from
 * `stack.db` either: by the time the plugin runs, `stack.db` *is* the plugin, so
 * forwarding through it recurses until the tab stops responding. See ADR-0019.
 */
export type StackPluginType = (pouch: PouchDB.Static, stackInstance: Stack, pristine: PristineDbMethods) => {
    bulkDocs<Model>(
        docs: Array<PouchDB.Core.PutDocument<{} & Model>>,
        options: PouchDB.Core.BulkDocsOptions | null,
        callback: PouchDB.Core.Callback<Array<PouchDB.Core.Response | PouchDB.Core.Error>>,
    ): void;
    // put<Model>(
    //     doc: PouchDB.Core.PutDocument<{} & Model>,
    //     options?: PouchDB.Core.PutOptions | null,
    //     callback?: PouchDB.Core.Callback<PouchDB.Core.Response>,
    // ): void;
    get?<Model>(
        docId: PouchDB.Core.DocumentId,
        options?: PouchDB.Core.GetOptions | null,
        callback?: PouchDB.Core.Callback<PouchDB.Core.Document<{} & Model>>,
    ): void;
    bulkGet?<Model>(
        options: PouchDB.Core.BulkGetOptions,
        callback?: PouchDB.Core.Callback<PouchDB.Core.BulkGetResponse<{} & Model>>,
    ): void;
    /**
     * Confirms the plugin is installed on a database.
     *
     * `initialize` calls it right after construction: the plugin's methods are assigned
     * onto the instance, so a failure to do so would otherwise only surface later, as a
     * write that quietly skipped validation.
     */
    ping?(): Promise<string>;
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

export type SelectAST = {
  type: 'select';
  distinct: boolean;
  columns: any[];
  from: any[];
  joins: any[];
  where: any | null;
  groupBy: { type: 'group_by'; columns: any[] } | null;
  having: any | null;
  orderBy: Array<{ expr: any; order: 'ASC' | 'DESC' }> | null;
  limit: number | null;
};

export type UnionAST = {
  type: 'union';
  /** upper SelectAST's index */
  top: number;
  /** lower SelectAST's index */
  bottom: number;
  distinct: boolean;
}

export {Class};