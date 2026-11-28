import { DocStack } from "./core/index.js";

/**
 * The PouchDB constructor registry: `@docstack/client` registers `pouchdb-browser`,
 * `@docstack/client/node` registers `pouchdb`; a host composing its own constructor
 * registers it here before opening a stack.
 */
export { setPouchDB, getPouchDB } from "./core/pouchdb.js";
/** Process-wide floor for the module-level loggers a stack's own `logLevel` does not reach. */
export { setDefaultLogLevel } from "./utils/logger/index.js";

export { ClientStack, Class, Domain, Attribute, Trigger, DocStack } from "./core/index.js";

/**
 * Running jobs unattended.
 *
 * `JobEngine` executes a job when asked; `JobScheduler` decides when to ask, under the
 * constraints a client imposes — an app that is closed most of the time, timers that
 * freeze, several devices holding replicas of the same `~Job`, and job content that
 * replicates and is executable. It is mounted at `stack.jobScheduler` and started by the
 * application, which names the jobs allowed to run with nobody watching.
 */
export { JobEngine, JobScheduler, JOB_SCHEDULE_DOC_ID, parseSchedule, nextOccurrence } from "./core/index.js";
export type {
    SchedulerOptions,
    SchedulerHost,
    JobScheduleState,
    TickReport,
    SkipReason,
    ParsedSchedule,
} from "./core/index.js";

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
    readRemoteConsumerSchemaVersion,
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
    StackLockedError,
    StackScopeMismatchError,
    StackSessionError,
    createSessionView,
    RemoteStack,
    RemoteStackError,
    RemoteRequestError,
    deriveKeyId,
    isEncryptedPayload,
    deriveTenantScope,
    classTenants,
} from "./core/index.js";

export { SYSTEM_SEEDED_DOC_IDS, collectQueryClasses } from "./core/index.js";
export type { EncryptedPayload, ClassBuildOptions, SessionView, RemoteStackOptions, RemoteFetch } from "./core/index.js";

/**
 * Named write transactions (ADR-0039).
 *
 * Opt-in per stack via `transactions: true`. A handle stages validated writes in
 * memory and reads its own staged state overlaid on committed state; `commit`
 * flushes the journal as one batch through the full authoring pipeline, and the
 * report states the storage adapter's honest atomicity guarantee.
 */
export {
    TransactionEngine,
    TransactionHandle,
    TransactionDb,
    TransactionsDisabledError,
    TransactionStateError,
    TransactionValidationError,
    TransactionConflictError,
    TransactionUnsupportedDocError,
} from "./core/index.js";
export type { TransactionCommitReport, TransactionStatus } from "./core/index.js";

/**
 * Moving application content between stacks, without the datamodel that describes it.
 */
export {
    CONTENT_EXPORT_FORMAT,
    META_CLASSES,
    isContentClassName,
    isContentDocument,
    isContentRelation,
} from "./core/index.js";
export type {
    ContentExport,
    ContentExportOptions,
    ContentImportOptions,
    ContentImportReport,
    ContentImportIssue,
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
    TenantScope,
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
    PatchJob,
    SelectAST,
    UnionAST,
    ClientCredentials,
    DocstackReady,
    StackConfig,
    StackOptions,
    StackSession,
} from "@docstack/shared";

/**
 * The code-defined model (`proposal.md`).
 *
 * Re-exported from `@docstack/shared` so an application declares its classes through
 * the package it already depends on, and so the builders reach the browser bundle.
 * One definition yields both the TypeScript types and the class document the engine
 * stores, which is what keeps the two from drifting.
 *
 * @example
 * ```typescript
 * import { defineClass, a, type InferDoc } from "@docstack/client";
 *
 * export const Todo = defineClass("Todo", {
 *     attributes: { title: a.string({ mandatory: true }) },
 * });
 * export type TodoDoc = InferDoc<typeof Todo>;
 * ```
 */
export { defineClass, defineModel, a, attributeSpecToZod } from "@docstack/shared";
/**
 * Folding a patch chain and diffing a model against it: the two pure functions
 * `docstack revision --autogenerate` and `--check` are built from (`proposal.md` §6).
 * No database is involved, and the fold applies the engine's own merge rules.
 */
export { foldPatchChain, diffModel, mergePatchSchema, canonicalJson } from "@docstack/shared";
export { defineHandler, assertTriggerReference, assertJobReference } from "@docstack/shared";
export type {
    Handler, HandlerKind, TriggerHandler, TriggerHandlerContext, JobHandler, DeclaredTrigger,
} from "@docstack/shared";
export type { FoldedChain, ModelDiff } from "@docstack/shared";

/**
 * The typed read and write surface over a declared model (`proposal.md` §7).
 *
 * Additive: the untyped `Class` API is unchanged and stays reachable, which is what
 * runtime-created and `simple` classes still need.
 */
export { typed, typedClass } from "./core/typed.js";
export type { TypedClass, TypedStack } from "./core/typed.js";
export type {
    AttributeSpec,
    AttributeShape,
    AttributeValue,
    ClassDefinition,
    ClassDefinitionInput,
    ModelDefinition,
    InferDoc,
    InferInput,
} from "@docstack/shared";

export default DocStack;
