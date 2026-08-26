import { describeFilter, withFilterIdentity } from "./filter-identity.js";
import { SYSTEM_SEEDED_DOC_IDS } from "../datamodel/index.js";

/**
 * The taxonomy of documents a DocStack stack keeps for itself.
 *
 * Every stack writes a handful of documents that describe *this device's copy* of the
 * database rather than its contents: the system record, the crypto marker, the local
 * patch ledger, class-propagation locks, Mango design documents. Replicating those is
 * never right - two devices each write their own, so they collide on identical ids
 * with unrelated revisions, and pulling a peer's `~system` document would hand
 * `checkSystem` a schema version the local patches have not reached.
 *
 * The list lives here, in the client, because only DocStack knows it - an application
 * author cannot guess it and the set grows as DocStack does.
 *
 * @module
 */

/**
 * Document identifiers that are device-local in full.
 *
 * - `~system` carries this database's `dbInfo`, `startupTime` and, critically, the
 *   `schemaVersion` that {@link ClientStack.checkSystem} reads on every mount.
 * - `~crypto-engine-config` is the marker that pins a database to its encryption
 *   setting; a peer's copy says nothing about this one.
 * - `lastDocId` is a local id counter.
 */
export const INTERNAL_DOC_IDS: readonly string[] = [
    "~system",
    "~crypto-engine-config",
    "lastDocId",
];

/**
 * Identifier prefixes that mark a document as device-local.
 *
 * - `_local/` never replicates in PouchDB anyway; listed so the predicate is usable
 *   outside a replication filter too.
 * - `_design/` documents are Mango indexes built on demand by
 *   {@link ClientStack.addDesignDocumentPKs}, including the `-temp` variants.
 * - `~lock-` guards an in-flight class-model propagation on *this* device.
 * - `~log-` is this client's own diagnostic record. Replicating diagnostics costs quota,
 *   bandwidth and remote storage on every sync, in both directions, and tells a peer
 *   nothing it can use - `logLevel: 'info'` should not be a network cost. They used to
 *   carry neither a `~class` nor a recognisable id, so all of them replicated: 111 of
 *   134 documents on one measured remote. See ADR-0023.
 */
export const INTERNAL_DOC_ID_PREFIXES: readonly string[] = [
    "_local/",
    "_design/",
    "~lock-",
    "~log-",
];

/**
 * `~class` values whose documents describe device-local state.
 *
 * - `~lock` guards an in-flight class-model propagation on *this* device.
 * - `~JobRun` records that *this* client ran a job. A peer's execution history is not
 *   something this one can act on, and both write their own.
 */
export const INTERNAL_DOC_CLASSES: readonly string[] = [
    "~lock",
    "~JobRun",
];

/**
 * `~class` values that are device-local by default but that a caller may choose to
 * replicate. Sessions belong to the device that authenticated; the patch ledger is
 * written by whichever device applied the patch, and patches themselves ship with the
 * application code rather than through the database.
 */
export const OPTIONAL_INTERNAL_DOC_CLASSES = {
    /** `~UserSession` - one per device, per login. */
    sessions: "~UserSession",
    /** `patch` - the local record of which patches this device has applied. */
    patchLedger: "patch",
} as const;

/**
 * Options controlling which of DocStack's own documents stay on this device.
 *
 * @example
 * ```typescript
 * // Replicate the patch ledger too, and keep an app-specific draft class local.
 * const filter = createReplicationFilter({
 *     replicatePatchLedger: true,
 *     extraClasses: ["Draft"],
 * });
 * ```
 */
export interface InternalDocFilterOptions {
    /** Replicate `~UserSession` documents. Defaults to `false`. */
    replicateSessions?: boolean;
    /**
     * Replicate the documents the system patches seed - the `~*` class models,
     * `Group-Admin`, `Policy-Admin`, `AuthMod-Classic`, the bootstrap `class` and
     * `domain`, the `system` user. Defaults to `false`, because every client applies
     * those patches for itself and so already holds them.
     *
     * This does *not* govern documents of DocStack's classes that an application created
     * - an account, a group, a policy written at runtime. Those bind the synchronised
     * group together and always replicate.
     */
    replicateSystemDocuments?: boolean;
    /**
     * Document ids an application's own patches seed, treated like the system-seeded ones.
     *
     * Consumer patches are applied on every client too, so the documents they seed are
     * reconstructible everywhere and need not travel. {@link ClientStack.sync} fills this
     * in from the stack's configured patches.
     */
    extraSeededDocIds?: string[];
    /** Replicate the local `patch` ledger. Defaults to `false`. */
    replicatePatchLedger?: boolean;
    /** Additional exact document ids to keep device-local. */
    extraDocIds?: string[];
    /** Additional id prefixes to keep device-local. */
    extraIdPrefixes?: string[];
    /** Additional `~class` values to keep device-local. */
    extraClasses?: string[];
}

/** The shape the predicates need: anything with an id and possibly a `~class`. */
type MaybeInternalDoc = {
    _id?: string;
    "~class"?: unknown;
    [key: string]: unknown;
};

/**
 * Resolves the full set of device-local classes for a given set of options.
 *
 * @param options - Filter options; defaults keep sessions and the patch ledger local.
 * @returns The `~class` values that should not leave this device.
 */
export const resolveInternalClasses = (options: InternalDocFilterOptions = {}): string[] => {
    const classes = [...INTERNAL_DOC_CLASSES, ...(options.extraClasses || [])];
    if (!options.replicateSessions) classes.push(OPTIONAL_INTERNAL_DOC_CLASSES.sessions);
    if (!options.replicatePatchLedger) classes.push(OPTIONAL_INTERNAL_DOC_CLASSES.patchLedger);
    return classes;
};

/**
 * Reports whether a document is one every client seeds for itself.
 *
 * The distinction that matters is **not** "is this DocStack's own?" - it is "can the peer
 * already reconstruct this?". Patches are applied by every client independently, so every
 * document they seed exists everywhere already: the `~*` class models, `Group-Admin`,
 * `Group-Default`, `Policy-Admin`, `AuthMod-Classic`, `Job-Auth-Classic`, the bootstrap
 * `class` and `domain`, the `system` user. Sending them costs quota and invites conflicts
 * - two devices writing the same id independently - for no information gained.
 *
 * What must travel is whatever *binds* the two instances: the documents a synchronised
 * group cannot derive from its patches. That includes application data and its class
 * models, and equally an account created at runtime (`user-alice`), a group an
 * administrator added, a policy an application wrote. Those are `~User`, `~Group` and
 * `~Policy` documents - DocStack's classes - and holding them back on the strength of
 * that prefix would break exactly the case replication exists for. Only the *seeded* ones
 * stay home. See ADR-0023.
 *
 * @param id - The document id.
 * @param options - Filter options; `replicateSystemDocuments` turns this off, and
 * `extraSeededDocIds` extends the set with an application's own patch-seeded ids.
 */
const isSeededEverywhere = (id: string, options: InternalDocFilterOptions): boolean => {
    if (options.replicateSystemDocuments) return false;
    if (SYSTEM_SEEDED_DOC_IDS.includes(id)) return true;
    return Boolean(options.extraSeededDocIds?.includes(id));
};

/**
 * Reports whether a document describes device-local state rather than stack data.
 *
 * @param doc - The document to classify. A missing or id-less value counts as internal,
 * so a malformed change never escapes to a remote.
 * @param options - Which of the optional categories to treat as replicable.
 * @returns `true` when the document should stay on this device.
 *
 * @example
 * ```typescript
 * isInternalDoc({ _id: "~system" });                       // true
 * isInternalDoc({ _id: "Task-1", "~class": "Task" });       // false
 * isInternalDoc({ _id: "sess-a", "~class": "~UserSession" }); // true
 * isInternalDoc({ _id: "sess-a", "~class": "~UserSession" }, { replicateSessions: true }); // false
 * ```
 */
export const isInternalDoc = (
    doc: MaybeInternalDoc | null | undefined,
    options: InternalDocFilterOptions = {}
): boolean => {
    const id = doc && typeof doc._id === "string" ? doc._id : undefined;
    if (!id) return true;

    const ids = [...INTERNAL_DOC_IDS, ...(options.extraDocIds || [])];
    if (ids.includes(id)) return true;

    const prefixes = [...INTERNAL_DOC_ID_PREFIXES, ...(options.extraIdPrefixes || [])];
    if (prefixes.some(prefix => id.startsWith(prefix))) return true;

    const docClass = doc && typeof doc["~class"] === "string" ? (doc["~class"] as string) : undefined;
    if (docClass && resolveInternalClasses(options).includes(docClass)) return true;

    return isSeededEverywhere(id, options);
};

/**
 * Builds the replication filter DocStack passes to PouchDB.
 *
 * PouchDB filter functions use include-semantics: returning `true` replicates the
 * document. The returned function is pure and closes over nothing but the resolved
 * option lists, so it is safe to hand to `PouchDB.replicate`/`PouchDB.sync`, which
 * call it once per change on the source's changes feed.
 *
 * @param options - Which of the optional categories to treat as replicable.
 * @returns A predicate suitable for `replicate`'s `filter` option.
 *
 * @example
 * ```typescript
 * PouchDB.sync(local, remote, { live: true, retry: true, filter: createReplicationFilter() });
 * ```
 */
export const createReplicationFilter = (
    options: InternalDocFilterOptions = {}
): ((doc: MaybeInternalDoc) => boolean) => {
    const ids = new Set([...INTERNAL_DOC_IDS, ...(options.extraDocIds || [])]);
    const prefixes = [...INTERNAL_DOC_ID_PREFIXES, ...(options.extraIdPrefixes || [])];
    const classes = new Set(resolveInternalClasses(options));

    const filter = (doc: MaybeInternalDoc) => {
        const id = doc && typeof doc._id === "string" ? doc._id : undefined;
        if (!id) return false;
        if (ids.has(id)) return false;
        if (prefixes.some(prefix => id.startsWith(prefix))) return false;
        const docClass = doc && typeof doc["~class"] === "string" ? (doc["~class"] as string) : undefined;
        if (docClass && classes.has(docClass)) return false;
        if (isSeededEverywhere(id, options)) return false;
        return true;
    };

    // Two differently-configured filters must not share a replication checkpoint.
    return withFilterIdentity(filter, describeFilter("internal", {
        replicateSessions: Boolean(options.replicateSessions),
        replicatePatchLedger: Boolean(options.replicatePatchLedger),
        replicateSystemDocuments: Boolean(options.replicateSystemDocuments),
        extraSeededDocIds: options.extraSeededDocIds || [],
        extraDocIds: options.extraDocIds || [],
        extraIdPrefixes: options.extraIdPrefixes || [],
        extraClasses: options.extraClasses || [],
    }));
};
