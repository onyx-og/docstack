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

export type AttributeTypeDate = {
    type: "date",
    name: string,
    config: {
        /**
         * `"date"` for a date-only value (`YYYY-MM-DD`); a full ISO-8601 UTC timestamp
         * otherwise.
         */
        format?: "date" | "datetime",
        /** ISO-8601 string, matching {@link format}. */
        defaultValue?: string,
        /** ISO-8601 string. Compared as an instant, not as text. */
        max?: string,
        /** ISO-8601 string. Compared as an instant, not as text. */
        min?: string
    } & AttributeTypeConfig
}

/**
 * @deprecated Misspelling kept so existing imports keep resolving. Use
 * {@link AttributeTypeDate}.
 */
export type AttribruteTypeDate = AttributeTypeDate;

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
            /**
             * Strings only. `z.enum`, which validates this attribute, accepts nothing
             * else: given a number it builds without complaint and then rejects every
             * input, so a numeric enum never accepted a value. Narrowed to what the
             * validator always enforced.
             */
            value: string
        }[],
        type?: AttributeType["type"]
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
    AttributeTypeString | AttributeTypeInteger | AttributeTypeDate |
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
    /**
     * Documents of this class describe *this run of this client* rather than the stack's
     * data.
     *
     * Two consequences, both structural rather than conventional: they are emptied when
     * the stack next opens, and they never replicate. Declared once on the class instead
     * of being a shape the sync filter has to recognise document by document - which is
     * what the client's own log records needed before, and what any other kind of derived
     * local state would have needed again. See ADR-0028.
     */
    ephemeral?: boolean,
    /**
     * Documents of this class are stored as given.
     *
     * No schema, so no validation, no triggers, no relation checks and no field
     * encryption - the authoring path is skipped entirely, which is what makes such a
     * write cost what a plain PouchDB write costs. The point is somewhere to put
     * documents whose shape is not known in advance, which is what a document database is
     * for; a class that wants guarantees simply does not set this.
     *
     * Reads are unaffected: the query engine keys on `~class` and the class model's name,
     * never on its attributes, so a simple class is queried like any other. See ADR-0028.
     */
    simple?: boolean,
    /**
     * The tenant spaces this class belongs to.
     *
     * A tenant is a stack (ADR-0030): declaring `tenants: ["workspace"]` says documents
     * of this class live in the workspace tenant's stack, and a replication channel
     * entitled to that tenant may carry them. A static list on purpose, so partitioning
     * and channel scopes are derivable before any data exists; dynamic tenant spaces are
     * dynamic stacks, not resolver-valued declarations. A class with no declaration is
     * tenant-neutral - it follows its stack, and single-tenant consumers pay nothing.
     */
    tenants?: string[],
    /**
     * The access scope documents of this class default into (spec 02 §2.2).
     *
     * Applied at write time when a document states no `~scope` of its own; the
     * document's own label always wins. The scope decides *under which key* the
     * class's `encrypted: true` attributes seal - the schema still decides
     * *what* encrypts. A class with neither declaration follows the legacy
     * document key. See ADR-0045.
     */
    defaultScope?: string,
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
/**
 * A one-shot job carried by a patch (ADR-0044): `preApply` massages data so the
 * patch's model can validate, `postApply` backfills what needs the model landed.
 * Never persisted as a `~Job` - a migration is not a schedulable job, and
 * replicable executable content keeps its one existing surface.
 */
export type PatchJob = {
    name: string;
    /** Job body, `~Job`-style: must define `execute(stack, params, job)`. */
    content: string;
    params?: { [key: string]: any };
    /**
     * Whether the job needs the document key. Defaults to `true`: an undeclared
     * job defers while the stack is locked, which can cost latency but never
     * correctness. `false` opts into locked execution - the author's explicit
     * claim that the job touches no encrypted data (ADR-0044).
     */
    requiresKey?: boolean;
};

export interface Patch extends Document {
    "~class": "patch";
    target: string;
    version: string;
    changelog?: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any
    }> | PouchDB.Core.Document<{[key: string]: any}>)[]
    /** Runs before this patch's docs stage, writes staged into the chain transaction (ADR-0044). */
    preApply?: PatchJob;
    /** Runs after the chain commit, in a second staged transaction, before the ledger arms (ADR-0044). */
    postApply?: PatchJob;
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

    /**
     * Most verbose level this stack's loggers emit, on console and into the stack's
     * own log sink alike. `"silent"` turns them off entirely - what a production
     * build wants. Omitted, the library defaults apply (console shows `warn` and
     * above, the sink records `info` and above).
     */
    logLevel?: "error" | "warn" | "info" | "debug" | "silent";

    /**
     * Enables named write transactions on this stack (`stack.beginTransaction()`,
     * `stack.commit(t)`, `stack.discardTransaction(t)`). Off by default. The flag
     * only unlocks the capability: direct writes stay immediate next to open
     * transactions, and staged writes live in memory until commit - a reload
     * discards them. See ADR-0039.
     */
    transactions?: boolean;

    /**
     * The consumer key contract for cryptographic access scopes (ADR-0045,
     * spec 02 §4). DocStack never runs the authority and never invents key
     * material: the application adopts the session's attribute key from its
     * own infrastructure (its server, a Drive grant, Firebase) and persists it
     * consumer-side, exactly as it provisions {@link documentKey} today.
     */
    accessKeys?: {
        /** The session's ABE attribute secret key, serialized (opaque blob from `@docstack/abe` keygen). */
        attributeKey?: string;
        /**
         * Called once at open when active scopes remain locked after the
         * supplied material was attempted. The consumer may fetch newer
         * material and return it - it is attempted immediately - or return
         * null to stay partially locked (later adoption goes through
         * `stack.unlockScopes(key)`).
         */
        requestAttributeKey?: (lockedScopes: string[]) => Promise<string | null>;
    };
} & PouchDB.Configuration.DatabaseConfiguration

export type StackConfig = ({
    connection?: string;
    plugins?: any[];
    /**
     * `"remote"` opens a thin stack against a DocStack server: `connection` is the
     * stack's URL (`https://host/s/<name>`), nothing is replicated, every read and
     * write runs on the host under a session. `"local"` (the default) opens the engine
     * on this device. See spec 03.
     */
    mode?: "local" | "remote";
    /** Remote mode: the bearer token, or a function returning it, sent with every request. */
    token?: string | (() => string | Promise<string>);
    /** Remote mode: extra headers on every request. */
    headers?: Record<string, string>;
    /** Remote mode: a `fetch` implementation; the global one by default. */
    fetch?: (input: string, init?: any) => Promise<any>;
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
export type TriggerRunFunction = (document: Document, classObj?: Class, stack?: Stack, session?: StackSession) => Document | Promise<Document>;

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

/**
 * @deprecated The JS-rule policy engine retired with ADR-0045's
 * single-vocabulary ruling: the attribute formula on an {@link AccessScopeModel}
 * is DocStack's one access-control language, enforced by encryption. `~Policy`
 * documents are inert legacy data - nothing evaluates them.
 */
export interface PolicyModel extends Document {
    "~class": "~Policy";
    userId?: string;
    groupId?: string;
    rule: string;
    description?: string;
    targetClass: string[];
}

/**
 * An access scope (ADR-0045, spec 02 §2.1): a named set of content whose
 * encrypted attributes seal under one CEK, itself ABE-encrypted under the
 * scope's attribute policy. Replicates with the data; a device whose attribute
 * key does not satisfy `policyString` holds the blob and cannot open it.
 */
export interface AccessScopeModel extends Document {
    "~class": "~AccessScope";
    /** The label documents carry in `~scope` (and classes in `defaultScope`). */
    scopeId: string;
    /** Monotone attribute formula, e.g. `("role:manager" and "dept:sales") or "clearance:secret"`. Public by design. */
    policyString: string;
    /** The scope's 32-byte CEK, ABE-sealed under `policyString`. Opaque blob - never parsed. */
    abeWrappedCek: string;
    /** Key id of the CEK (first 8 bytes of SHA-256), matching payload stamping. */
    kid: string;
    /** Increments on rotation; the highest active version's CEK writes, older ones read (spec 02 §7). */
    version: number;
    /** Per-scope canary: AES-GCM over a random nonce under the CEK (ADR-0018 discipline, per scope). */
    encryptedMarker: unknown;
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

/**
 * A request-scoped view of who is acting on a stack, and what they may open.
 *
 * The engine is single-user by construction: one keyring, one auth session, one
 * class cache. A host serving many principals from one stack (`@docstack/server`)
 * cannot express "this read is Alice's" through any of that state, and a facade
 * wrapped around the stack from outside would leave triggers and jobs blind to the
 * principal. A `StackSession` is the engine's own notion of that context: handed to
 * `stack.session(session)`, it narrows every read to the scopes the session may
 * open, refuses writes into scopes it may not, attributes writes to the principal,
 * and reaches triggers (fourth argument) and jobs (fourth argument of `execute`).
 *
 * Entitlement is decided by whoever constructs the session - a host that holds the
 * authority decides it with the same CP-ABE math a device would run - and the engine
 * enforces it against the keys it actually holds: a session may never open more
 * than the stack's keyring can. See ADR-0046.
 */
export interface StackSession {
    /** Opaque identifier: a request id, a JWT `jti`, a socket id. Recorded, never interpreted. */
    id: string;
    /** The acting principal as the host knows it. `sub` is what writes are attributed to. */
    principal: {
        /** Stable subject identifier, stamped as `~createdBy` / `~updatedBy`. */
        sub: string;
        /** The attribute set the host derived for this principal (`role:hr`, `tenant:acme`). Informational for triggers. */
        attributes?: string[];
        [key: string]: unknown;
    };
    /**
     * Access scope ids this session may open. Content sealed under any other scope
     * reads `null` and refuses writes, whatever keys the stack itself holds.
     */
    scopes: string[];
    /**
     * Whether content sealed under the stack's document key - unlabelled encrypted
     * attributes - is open to this session.
     */
    documentKey: boolean;
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
 * A handle on a live stream of changes.
 *
 * A PouchDB `Changes` feed satisfies this, and so does a subscription onto a feed that is
 * shared with other subscribers. The distinction matters because PouchDB registers a
 * `destroyed` listener on the database for every `db.changes({ live: true })` and holds it
 * until that feed is cancelled: one feed per watched class reaches Node's ten-listener
 * ceiling - and prints `MaxListenersExceededWarning` - on an app that is doing nothing
 * wrong. Handing back a handle rather than the feed itself lets a stack serve many
 * subscribers from a single feed.
 *
 * `cancel` is the whole contract on the release side, and must be safe to call twice.
 */
export interface ChangesSubscription {
    on(event: "change", listener: (change: any) => void): ChangesSubscription;
    on(event: "error", listener: (error: any) => void): ChangesSubscription;
    on(event: "complete", listener: (response: any) => void): ChangesSubscription;
    cancel(): void;
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
    get: Function;
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
  offset?: number | null;
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