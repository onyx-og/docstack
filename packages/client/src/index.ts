import { DocStack } from "./core/index.js";

export { ClientStack, Class, Domain, Attribute, Trigger, DocStack } from "./core/index.js";

/**
 * The sync layer: lifecycle, filtering, convergence state and the schema gate.
 *
 * Transport-agnostic on purpose - `remote` is whatever PouchDB database the
 * application hands over, so DocStack never learns about Google Drive, Firestore or
 * anything else, and no consumer pays for a transport it does not use.
 */
export {
    StackSyncHandle,
    DocStackSyncHandle,
    SyncSchemaMismatchError,
    SYNC_META_DOC_ID,
    readRemoteSchemaVersion,
    publishSchemaVersion,
    createReplicationFilter,
    isInternalDoc,
    resolveInternalClasses,
    createClassFilter,
    hasClassRules,
    DATA_MODEL_CLASSES,
    withFilterIdentity,
    describeFilter,
    INTERNAL_DOC_IDS,
    INTERNAL_DOC_ID_PREFIXES,
    INTERNAL_DOC_CLASSES,
    OPTIONAL_INTERNAL_DOC_CLASSES,
    StackWriteGuardError,
} from "./core/index.js";

export type {
    SyncDirection,
    SyncState,
    SyncStatus,
    StackSyncOptions,
    DocStackSyncOptions,
    RemoteResolver,
    SyncMetaDoc,
    InternalDocFilterOptions,
    ClassFilterOptions,
} from "./core/index.js";

/**
 * Document-modelling types, re-exported from `@docstack/shared`.
 *
 * These describe the values consumers have to construct themselves — most of all
 * `Patch`, which `StackOptions.patches` asks for. `@docstack/shared` is an internal
 * package, so surfacing them here is the only import path an application has.
 *
 * Note that `Document` shadows the DOM's global `Document` in whichever module imports
 * it; alias it (`import type { Document as DocStackDocument }`) in code that needs both.
 */
export type {
    AttributeType,
    AttributeTypeConfig,
    AttributeModel,
    ClassModel,
    DomainModel,
    TriggerModel,
    Document,
    RelationDocument,
    Patch,
    SelectAST,
    UnionAST,
    ClientCredentials,
    DocstackReady,
    StackConfig,
    StackOptions,
} from "@docstack/shared";

export default DocStack;
