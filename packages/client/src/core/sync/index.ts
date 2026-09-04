import PouchDB from "pouchdb-browser";
import semver from "semver";
import createLogger from "../../utils/logger/index.js";
import { createReplicationFilter, type InternalDocFilterOptions } from "./internal-docs.js";
import { createClassFilter, hasClassRules, type ClassFilterOptions } from "./class-filter.js";
import { composeFilterIdentity, describeFilter, withFilterIdentity } from "./filter-identity.js";
import type ClientStack from "../stack.js";

const logger = createLogger().child({ module: "sync" });

/**
 * Which way documents move.
 *
 * `"both"` runs a single bidirectional `PouchDB.sync`; the one-way values run
 * `PouchDB.replicate` in the named direction.
 */
export type SyncDirection = "push" | "pull" | "both";

/**
 * Where a stack's replication currently stands.
 *
 * - `"stopped"` - never started, or cancelled.
 * - `"starting"` - resolving the remote and running the schema gate.
 * - `"active"` - documents are moving.
 * - `"idle"` - a replication cycle finished with nothing left to send; this is the
 *   state that carries a meaningful `lastConvergedAt`.
 * - `"error"` - the last cycle failed. With `retry: true` replication keeps trying and
 *   will return to `"active"` on its own.
 * - `"denied"` - the remote refused a write (permissions), which retrying will not fix.
 */
export type SyncState = "stopped" | "starting" | "active" | "idle" | "error" | "denied";

/**
 * How a stack finds its remote.
 *
 * A function is the useful form for transports that need per-stack configuration or a
 * credential that expires - DocStack calls it again on every {@link StackSyncHandle.restart},
 * so a refreshed token reaches the new replication without the caller reaching into
 * DocStack. DocStack never learns anything about the transport itself.
 *
 * @example
 * ```typescript
 * // Google Drive, one folder per stack, token owned by the application.
 * const remote = (stack) => new PouchDB(stack.getDbName(), {
 *     adapter: "googledrive",
 *     accessToken: async () => auth.getAccessToken(),
 *     folderName: `tokido/${stack.name}`,
 * });
 * ```
 */
export type RemoteResolver =
    | string
    | PouchDB.Database
    | ((stack: ClientStack) => string | PouchDB.Database | Promise<string | PouchDB.Database>);

/**
 * Options for {@link ClientStack.sync}.
 *
 * Everything except `remote` has a working default; the defaults describe a
 * continuous, self-healing, internal-documents-excluded sync.
 */
export interface StackSyncOptions {
    /** The remote to replicate against. See {@link RemoteResolver}. */
    remote: RemoteResolver;
    /** Direction of travel. Defaults to `"both"`. */
    direction?: SyncDirection;
    /** Keep replicating as changes happen. Defaults to `true`. */
    live?: boolean;
    /** Retry on transient failure with PouchDB's backoff. Defaults to `true`. */
    retry?: boolean;
    /** Documents per batch. Passed to PouchDB as `batch_size`. */
    batchSize?: number;
    /** Concurrent batches. Passed to PouchDB as `batches_limit`. */
    batchesLimit?: number;
    /** Changes-feed heartbeat, in milliseconds, or `false` to disable. */
    heartbeat?: number | false;
    /** Changes-feed timeout, in milliseconds, or `false` to disable. */
    timeout?: number | false;
    /**
     * Which classes replicate. See {@link ClassFilterOptions} - an allow-list keeps the
     * data model automatically, and relations are judged by their endpoints.
     *
     * @example
     * ```typescript
     * stack.sync({ remote, classes: { exclude: ["Draft"] } });
     * ```
     */
    classes?: ClassFilterOptions;
    /**
     * An extra predicate, ANDed with the filters above. Return `true` to replicate the
     * document. Must be pure - PouchDB calls it once per change.
     *
     * Prefer `classes` where it fits: a bare function has no configuration DocStack can
     * see, so its identity for checkpointing purposes is its own source text. Two
     * closures over different data with the same source read as the same filter, and
     * replication resumes where the other one left off. Build a fresh function whose
     * source differs, or use `classes`.
     */
    filter?: (doc: any) => boolean;
    /**
     * Which of DocStack's own documents to keep on this device, or `false` to replicate
     * everything including `~system`. `false` is for stack-to-stack mirroring of a whole
     * database and is otherwise a bad idea. Defaults to {@link InternalDocFilterOptions}'
     * own defaults.
     */
    internalDocs?: InternalDocFilterOptions | false;
    /**
     * Refuse to start when the remote was last written by a newer schema. Defaults to
     * `true`. See {@link SyncSchemaMismatchError}.
     */
    checkSchemaVersion?: boolean;
}

/** A point-in-time reading of one stack's replication. */
export interface SyncStatus {
    /** The stack this status belongs to. */
    stack: string;
    /** See {@link SyncState}. */
    state: SyncState;
    /** Direction this handle was started with. */
    direction: SyncDirection;
    /** Whether the handle is following changes or ran once. */
    live: boolean;
    /**
     * When the replica last converged - a cycle completed with nothing left to send.
     * `null` until the first one. This is the value a UI should render as
     * "last synced", not `lastActiveAt`.
     */
    lastConvergedAt: number | null;
    /** When documents last moved, in either direction. */
    lastActiveAt: number | null;
    /** The last failure seen, kept even after replication recovers. */
    lastError: { name?: string; message: string; status?: number } | null;
    /** Documents written to the remote since this handle started. */
    pushed: number;
    /** Documents written locally since this handle started. */
    pulled: number;
}

/**
 * Raised when a remote is ahead of this device's data model.
 *
 * Pulling from it would deliver documents shaped by patches this device has not
 * applied; they would be stored verbatim (replication writes bypass validation, by
 * design) and then fail to read back. Refusing early leaves the local stack intact and
 * tells the application to ship the newer build.
 */
export class SyncSchemaMismatchError extends Error {
    override name = "SyncSchemaMismatchError";
    /** The stack that refused to sync. */
    readonly stack: string;
    /** The schema version this device has applied, if any. */
    readonly localVersion: string | undefined;
    /** The schema version the remote was last written with. */
    readonly remoteVersion: string;

    /** Which half of the gate refused: the system schema, or the application's consumer patches. */
    readonly scope: "system" | "consumer";

    constructor(stack: string, localVersion: string | undefined, remoteVersion: string, scope: "system" | "consumer" = "system") {
        super(
            `Stack '${stack}' cannot sync: the remote was last written with ` +
            `${scope === "consumer" ? "consumer patch" : "schema"} version ` +
            `${remoteVersion}, this device has ${localVersion || "none"}. ` +
            (scope === "consumer"
                ? `Apply the application's patches up to ${remoteVersion} - a deferred patch applies on unlock - before syncing again.`
                : `Update the application so its patches reach ${remoteVersion} before syncing again.`)
        );
        this.stack = stack;
        this.localVersion = localVersion;
        this.remoteVersion = remoteVersion;
        this.scope = scope;
    }
}

/**
 * The document DocStack keeps on a remote to record which schema wrote it.
 *
 * A `_local/` document on purpose: it is shared by every device talking to that remote
 * (they all open the same database) but never replicates into anybody's stack, so it
 * cannot be confused with the local `~system` record.
 */
export const SYNC_META_DOC_ID = "_local/docstack-sync";

/** The contents of {@link SYNC_META_DOC_ID}. */
export interface SyncMetaDoc {
    _id: string;
    _rev?: string;
    /** Highest schema version any device has pushed to this remote. */
    schemaVersion?: string;
    /**
     * Highest *consumer* patch version any device has pushed. The system version
     * alone cannot see consumer-schema skew - two devices on the same build always
     * agree on it, whatever their application patches are doing (ADR-0040).
     */
    consumerSchemaVersion?: string;
    /** Application version of the device that last wrote it, for diagnostics. */
    appVersion?: string;
    /** When it was last written. */
    updatedAt: number;
}

const isMissing = (error: any) => error?.status === 404 || error?.name === "not_found";

/**
 * Reads the schema version a remote was last written with.
 *
 * Prefers DocStack's own marker and falls back to a `~system` document, which is only
 * present when the remote is itself a DocStack stack replicated wholesale.
 *
 * @param remote - The remote database.
 * @returns The recorded version, or `null` for a remote nobody has written yet.
 */
export const readRemoteSchemaVersion = async (remote: PouchDB.Database): Promise<string | null> => {
    const meta = await remote.get<SyncMetaDoc>(SYNC_META_DOC_ID).catch((error: any) => {
        if (isMissing(error)) return null;
        throw error;
    });
    if (meta?.schemaVersion) return meta.schemaVersion;

    const system = await remote.get<{ schemaVersion?: string }>("~system").catch((error: any) => {
        if (isMissing(error)) return null;
        throw error;
    });
    return system?.schemaVersion || null;
};

/**
 * Reads the highest consumer patch version recorded on a remote.
 *
 * `null` for a remote nobody has written, or one written only by builds that
 * predate the consumer half of the gate.
 */
export const readRemoteConsumerSchemaVersion = async (remote: PouchDB.Database): Promise<string | null> => {
    const meta = await remote.get<SyncMetaDoc>(SYNC_META_DOC_ID).catch((error: any) => {
        if (isMissing(error)) return null;
        throw error;
    });
    return meta?.consumerSchemaVersion || null;
};

/**
 * Records this device's schema version on a remote, if it is the newest seen.
 *
 * @param remote - The remote database.
 * @param schemaVersion - The local schema version; a missing value writes nothing.
 * @param appVersion - The local application version, stored for diagnostics.
 */
export const publishSchemaVersion = async (
    remote: PouchDB.Database,
    schemaVersion: string | undefined,
    appVersion?: string,
    consumerSchemaVersion?: string | null
): Promise<void> => {
    if (!schemaVersion && !consumerSchemaVersion) return;

    const existing = await remote.get<SyncMetaDoc>(SYNC_META_DOC_ID).catch((error: any) => {
        if (isMissing(error)) return null;
        throw error;
    });

    // Each version field is monotonic on its own: the marker records the highest
    // either kind has ever reached, whichever device wrote it.
    const advances = (candidate: string | null | undefined, recorded: string | undefined) =>
        Boolean(candidate) && (!recorded
            || !semver.valid(recorded) || !semver.valid(candidate!)
            || semver.gt(candidate!, recorded));
    const systemAdvances = advances(schemaVersion, existing?.schemaVersion);
    const consumerAdvances = advances(consumerSchemaVersion, existing?.consumerSchemaVersion);
    if (!systemAdvances && !consumerAdvances) {
        return;
    }

    const doc: SyncMetaDoc = {
        ...(existing || {}),
        _id: SYNC_META_DOC_ID,
        schemaVersion: systemAdvances ? schemaVersion : existing?.schemaVersion,
        ...(consumerAdvances
            ? { consumerSchemaVersion: consumerSchemaVersion as string }
            : (existing?.consumerSchemaVersion ? { consumerSchemaVersion: existing.consumerSchemaVersion } : {})),
        appVersion,
        updatedAt: Date.now(),
    };

    await remote.put(doc as any).catch((error: any) => {
        // Another device claimed the same version between the read and the write; its
        // document says the same thing this one would have.
        if (error?.status === 409 || error?.name === "conflict") return;
        throw error;
    });
};

/**
 * One stack's replication: its lifecycle, its filter, and its convergence state.
 *
 * Created by {@link ClientStack.sync} - construct it through the stack rather than
 * directly, so the stack can cancel it when it closes.
 *
 * Dispatches DOM events, matching the rest of DocStack: `"status"` on every state
 * change (`detail` is a {@link SyncStatus}), plus `"change"`, `"active"`, `"idle"`,
 * `"denied"`, `"error"` and `"complete"`.
 *
 * @example
 * ```typescript
 * const sync = await stack.sync({ remote: () => driveDb });
 *
 * sync.addEventListener("status", (event) => {
 *     const status = (event as CustomEvent<SyncStatus>).detail;
 *     ui.setSyncBadge(status.state, status.lastConvergedAt);
 * });
 *
 * await sync.waitForConvergence();
 * ```
 */
export class StackSyncHandle extends EventTarget {
    private readonly stack: ClientStack;
    private readonly options: StackSyncOptions;
    private readonly direction: SyncDirection;
    private readonly live: boolean;
    private replication: { cancel: () => void; removeAllListeners?: () => void } | null = null;
    private remote: PouchDB.Database | null = null;
    private status: SyncStatus;
    private cancelled = false;

    /** @internal - use {@link ClientStack.sync}. */
    constructor(stack: ClientStack, options: StackSyncOptions) {
        super();
        this.stack = stack;
        this.options = options;
        this.direction = options.direction || "both";
        this.live = options.live !== false;
        this.status = {
            stack: stack.name,
            state: "stopped",
            direction: this.direction,
            live: this.live,
            lastConvergedAt: null,
            lastActiveAt: null,
            lastError: null,
            pushed: 0,
            pulled: 0,
        };
    }

    /** The current reading. Safe to call at any time; returns a copy. */
    public getStatus(): SyncStatus {
        return { ...this.status };
    }

    /** The resolved remote, once {@link start} has run. */
    public getRemote(): PouchDB.Database | null {
        return this.remote;
    }

    /**
     * Resolves the remote, runs the schema gate and starts replicating.
     *
     * @returns This handle, once replication is running. Rejects if the remote cannot
     * be resolved or the gate refuses; the handle is left `"error"` in that case.
     * @throws {SyncSchemaMismatchError} When the remote is ahead of this device.
     */
    public async start(): Promise<this> {
        const fnLogger = logger.child({ method: "start", stack: this.stack.name });
        this.cancelled = false;
        this.setState("starting");

        try {
            this.remote = await this.resolveRemote();

            if (this.options.checkSchemaVersion !== false) {
                await this.checkSchema(this.remote);
            }

            if (this.cancelled) {
                fnLogger.info("Cancelled before replication started");
                return this;
            }

            // Resolved here rather than inside the filter: PouchDB calls a filter once per
            // change and synchronously, while reading the class models is neither. The set
            // is fixed for this replication and forms part of the filter's identity, so a
            // class that becomes ephemeral later takes effect on the next `sync()` rather
            // than silently mid-stream. See ADR-0028.
            this.ephemeralClasses = await this.stack.getEphemeralClassNames().catch(() => []);

            this.replication = this.startReplication(this.remote);
            return this;
        } catch (error: any) {
            this.recordError(error);
            fnLogger.error("Failed to start sync", { error });
            throw error;
        }
    }

    /**
     * Stops replicating and releases the changes-feed listeners.
     *
     * Idempotent. Called for every live handle when the stack closes.
     */
    public cancel(): void {
        this.cancelled = true;
        if (this.replication) {
            try {
                this.replication.cancel();
            } catch (error) {
                logger.warn("Error while cancelling replication", { error, stack: this.stack.name });
            }
            if (typeof this.replication.removeAllListeners === "function") {
                this.replication.removeAllListeners();
            }
            this.replication = null;
        }
        this.setState("stopped");
    }

    /**
     * Cancels and starts again, re-resolving the remote.
     *
     * This is the call to make when a credential is refreshed: a {@link RemoteResolver}
     * function runs again, so the new replication is built on the new token while the
     * counters and `lastConvergedAt` this handle has accumulated stay put.
     *
     * @returns This handle, once replication is running again.
     */
    public async restart(): Promise<this> {
        this.cancel();
        return this.start();
    }

    /**
     * Resolves the next time the replica converges.
     *
     * @param timeoutMs - How long to wait before rejecting. Defaults to 30 seconds;
     * pass `0` to wait indefinitely.
     * @returns The status at the moment of convergence.
     */
    public waitForConvergence(timeoutMs = 30000): Promise<SyncStatus> {
        if (this.status.state === "idle") return Promise.resolve(this.getStatus());

        return new Promise<SyncStatus>((resolve, reject) => {
            const timer = timeoutMs
                ? setTimeout(() => {
                    cleanup();
                    reject(new Error(`Stack '${this.stack.name}' did not converge within ${timeoutMs}ms`));
                }, timeoutMs)
                : null;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                this.removeEventListener("idle", onIdle);
                this.removeEventListener("error", onError);
            };

            const onIdle = () => {
                cleanup();
                resolve(this.getStatus());
            };

            const onError = () => {
                // Retrying replication recovers on its own, so only a terminal failure
                // ends the wait.
                if (this.options.retry !== false && this.live) return;
                cleanup();
                reject(this.status.lastError ? new Error(this.status.lastError.message) : new Error("Sync failed"));
            };

            this.addEventListener("idle", onIdle);
            this.addEventListener("error", onError);
        });
    }

    private async resolveRemote(): Promise<PouchDB.Database> {
        const { remote } = this.options;
        const resolved = typeof remote === "function" ? await remote(this.stack) : remote;
        if (typeof resolved === "string") {
            return new PouchDB(resolved);
        }
        if (!resolved) {
            throw new Error(`Stack '${this.stack.name}' sync: the remote resolver produced no database`);
        }
        return resolved;
    }

    private async checkSchema(remote: PouchDB.Database): Promise<void> {
        const localVersion = this.stack.schemaVersion;
        const remoteVersion = await readRemoteSchemaVersion(remote);

        if (remoteVersion) {
            const ahead = !localVersion
                || (Boolean(semver.valid(remoteVersion))
                    && Boolean(semver.valid(localVersion))
                    && semver.gt(remoteVersion, localVersion));
            if (ahead) {
                throw new SyncSchemaMismatchError(this.stack.name, localVersion, remoteVersion);
            }
        }

        // The consumer half of the gate: the system version cannot see consumer-patch
        // skew - two devices on the same build always agree on it - so a device whose
        // application patches trail the remote (deferred behind the document key, or
        // an older build) would pull documents shaped by a schema it does not have,
        // and the deferred replay would then propagate over them (ADR-0040). The
        // ledger answers locally; a remote written only by older builds records
        // nothing and gates nothing.
        const localConsumer = await this.stack.getConsumerSchemaVersion();
        const remoteConsumer = await readRemoteConsumerSchemaVersion(remote);
        if (remoteConsumer && semver.valid(remoteConsumer)) {
            const ahead = !localConsumer
                || (Boolean(semver.valid(localConsumer)) && semver.gt(remoteConsumer, localConsumer));
            if (ahead) {
                throw new SyncSchemaMismatchError(this.stack.name, localConsumer ?? undefined, remoteConsumer, "consumer");
            }
        }

        // Only a device that writes to the remote gets to claim its schema version.
        // A pull-only device publishing would lock older peers out of a remote that
        // holds nothing they cannot read.
        if (this.direction !== "pull") {
            await publishSchemaVersion(remote, localVersion, this.stack.appVersion, localConsumer);
        }
    }

    /**
     * Composes the filter chain: DocStack's internal-document rules, then the caller's
     * class rules, then their own predicate. All three use include-semantics, so the
     * chain is a conjunction - a document replicates only if every stage admits it.
     *
     * The composed function carries an identity derived from every stage's
     * configuration. PouchDB hashes `filter.toString()` into the replication checkpoint,
     * and without that these closures would all render as the same source text: changing
     * which classes replicate would silently resume from the previous configuration's
     * checkpoint and never backfill the newly-admitted documents.
     */
    /**
     * The document ids this stack's configured patches seed.
     *
     * Empty when the stack was opened without patches, which is the common case.
     */
    /**
     * Class names declared ephemeral, resolved once when replication starts.
     *
     * See {@link ClassModel.ephemeral}.
     */
    private ephemeralClasses: string[] = [];

    private seededDocIdsFromPatches(): string[] {
        const patches = (this.stack.options?.patches ?? []) as { docs?: { _id?: unknown }[] }[];
        const ids = patches.flatMap(patch => (patch?.docs ?? [])
            .map(doc => doc?._id)
            .filter((id): id is string => typeof id === "string"));
        return [...new Set(ids)];
    }

    private buildFilter(): ((doc: any) => boolean) | undefined {
        const { internalDocs, classes, filter } = this.options;

        const stages: ((doc: any) => boolean)[] = [];
        const identities: string[] = [];

        if (internalDocs !== false) {
            // The stack's own patches seed documents on every client that applies them,
            // exactly as the system patches do, so they are reconstructible everywhere
            // and need not travel. Folded in here rather than left to the caller: an
            // application should not have to enumerate its own seeded ids to get correct
            // replication. See ADR-0023.
            const configured = internalDocs || {};
            const internalFilter = createReplicationFilter({
                ...configured,
                ephemeralClasses: [
                    ...(configured.ephemeralClasses || []),
                    ...this.ephemeralClasses,
                ],
                extraSeededDocIds: [
                    ...(configured.extraSeededDocIds || []),
                    ...this.seededDocIdsFromPatches(),
                ],
            });
            stages.push(internalFilter);
            identities.push(String(internalFilter));
        }

        if (hasClassRules(classes)) {
            const classFilter = createClassFilter(classes);
            stages.push(classFilter);
            identities.push(String(classFilter));
        }

        if (filter) {
            stages.push(filter);
            // A caller's function has no configuration to describe, so its own source is
            // the only identity available.
            identities.push(describeFilter("custom", String(filter)));
        }

        if (!stages.length) return undefined;
        if (stages.length === 1) return stages[0];

        const composed = (doc: any) => stages.every(stage => stage(doc));
        return withFilterIdentity(composed, composeFilterIdentity(identities));
    }

    private buildReplicationOptions(): PouchDB.Replication.SyncOptions {
        const opts: PouchDB.Replication.SyncOptions = {
            live: this.live,
            retry: this.options.retry !== false,
        };

        const filter = this.buildFilter();
        if (filter) opts.filter = filter;
        if (typeof this.options.batchSize === "number") opts.batch_size = this.options.batchSize;
        if (typeof this.options.batchesLimit === "number") opts.batches_limit = this.options.batchesLimit;
        if (this.options.heartbeat !== undefined) opts.heartbeat = this.options.heartbeat;
        if (this.options.timeout !== undefined) opts.timeout = this.options.timeout;

        return opts;
    }

    private startReplication(remote: PouchDB.Database) {
        // Replication reads and writes the database as it is stored: documents keep the
        // revisions they were authored with, and encrypted attributes stay encrypted
        // rather than being decrypted on the way out by the plugin's `bulkGet`.
        const local = this.stack.getReplicationHandle();
        const opts = this.buildReplicationOptions();

        if (this.direction === "both") {
            if (typeof (PouchDB as any).sync !== "function") {
                throw new Error("The bundled PouchDB has no replication support; 'direction: \"both\"' is unavailable");
            }
            const sync = PouchDB.sync(local, remote, opts);
            sync.on("change", (info: any) => this.onChange(info.direction === "pull" ? "pull" : "push", info.change));
            this.wireCommonEvents(sync);
            return sync;
        }

        if (typeof (PouchDB as any).replicate !== "function") {
            throw new Error("The bundled PouchDB has no replication support; 'sync' is unavailable");
        }

        const [source, target] = this.direction === "push" ? [local, remote] : [remote, local];
        const replication = PouchDB.replicate(source, target, opts);
        replication.on("change", (info: any) => this.onChange(this.direction === "push" ? "push" : "pull", info));
        this.wireCommonEvents(replication);
        return replication;
    }

    private wireCommonEvents(replication: any) {
        replication.on("active", () => this.setState("active"));

        replication.on("paused", (error: any) => {
            // PouchDB pauses both when it has caught up (no argument) and when a retrying
            // replication has lost the remote (with one). Only the first is convergence.
            if (error) {
                this.recordError(error);
            } else {
                this.markConverged();
            }
        });

        replication.on("denied", (error: any) => {
            this.status.lastError = this.describeError(error);
            this.setState("denied");
            this.dispatchEvent(new CustomEvent("denied", { detail: this.status.lastError }));
        });

        replication.on("error", (error: any) => {
            this.recordError(error);
        });

        replication.on("complete", (info: any) => {
            this.dispatchEvent(new CustomEvent("complete", { detail: info }));
            if (!this.live && !this.cancelled) this.markConverged();
        });
    }

    private onChange(direction: "push" | "pull", change: any) {
        const written = typeof change?.docs_written === "number" ? change.docs_written : 0;
        if (direction === "push") this.status.pushed += written;
        else this.status.pulled += written;

        this.status.lastActiveAt = Date.now();
        this.dispatchEvent(new CustomEvent("change", { detail: { direction, change } }));
        this.setState("active");
    }

    private markConverged() {
        this.status.lastConvergedAt = Date.now();
        this.setState("idle");
        this.dispatchEvent(new CustomEvent("idle", { detail: this.getStatus() }));
    }

    private recordError(error: any) {
        this.status.lastError = this.describeError(error);
        this.setState("error");
        this.dispatchEvent(new CustomEvent("error", { detail: this.status.lastError }));
    }

    private describeError(error: any) {
        return {
            name: error?.name,
            message: error?.message || String(error),
            status: error?.status,
        };
    }

    private setState(state: SyncState) {
        // Announced even when the name has not changed: counters and timestamps move
        // without it, and a UI reading `lastConvergedAt` needs to hear about those.
        this.status.state = state;
        const detail = this.getStatus();
        this.dispatchEvent(new CustomEvent("status", { detail }));
        // Also on the stack, so a consumer can subscribe to sync state without holding
        // the handle - the stack outlives any individual replication.
        this.stack.dispatchEvent(new CustomEvent("sync-status", { detail }));
    }
}

/** Options for {@link DocStack.sync}, which starts one handle per stack. */
export interface DocStackSyncOptions extends Omit<StackSyncOptions, "remote"> {
    /**
     * The remote for a given stack. Called once per stack, so an application with a
     * database per workspace answers with a folder per workspace.
     */
    remote: RemoteResolver;
    /**
     * Which stacks to sync. Defaults to all of them.
     */
    stacks?: string[];
    /**
     * The tenant entitlement this replication serves, compiled into per-stack
     * configuration by {@link deriveTenantScope}: stacks outside the scope are not
     * synced at all - withheld structurally, not filtered - and stacks holding a mix of
     * declarations get a class filter. Combines with `stacks` (which pre-narrows the
     * candidates) but not with `classes`, whose slot the compiled rules occupy; narrow
     * further with `filter`. See ADR-0030.
     */
    tenants?: string[];
}

/**
 * Every stack's replication under one object.
 *
 * Returned by {@link DocStack.sync}. Holds one {@link StackSyncHandle} per stack and
 * re-dispatches their `"status"` events, so an application renders one badge from one
 * listener however many databases it has open.
 *
 * @example
 * ```typescript
 * const sync = await docstack.sync({ remote: (stack) => driveFor(stack.name) });
 * sync.addEventListener("status", () => render(sync.getStatus()));
 * ```
 */
export class DocStackSyncHandle extends EventTarget {
    /** One handle per stack, keyed by stack name. */
    readonly handles: Map<string, StackSyncHandle> = new Map();

    /** @internal - use {@link DocStack.sync}. */
    public add(name: string, handle: StackSyncHandle) {
        this.handles.set(name, handle);
        handle.addEventListener("status", () => {
            this.dispatchEvent(new CustomEvent("status", { detail: this.getStatus() }));
        });
    }

    /** The stacks this handle covers. What is missing from this list is not
     *  replicating - compare against `DocStack.getStacks()`, or use
     *  `DocStack.getSyncCoverage()` which does exactly that. */
    public get names(): string[] {
        return [...this.handles.keys()];
    }

    /** @internal - use {@link DocStack.removeStack}. Cancels and drops one stack's
     *  replication; the rest are untouched. */
    public remove(name: string): boolean {
        const handle = this.handles.get(name);
        if (!handle) return false;
        handle.cancel();
        this.handles.delete(name);
        return true;
    }

    /** Every stack's status, keyed by stack name. */
    public getStatus(): Record<string, SyncStatus> {
        const status: Record<string, SyncStatus> = {};
        for (const [name, handle] of this.handles) {
            status[name] = handle.getStatus();
        }
        return status;
    }

    /**
     * The oldest convergence across all stacks - the honest answer to "when was
     * everything last up to date". `null` while any stack has never converged.
     */
    public getLastConvergedAt(): number | null {
        let oldest: number | null = null;
        for (const handle of this.handles.values()) {
            const converged = handle.getStatus().lastConvergedAt;
            if (converged === null) return null;
            if (oldest === null || converged < oldest) oldest = converged;
        }
        return oldest;
    }

    /** Cancels every stack's replication. */
    public cancel(): void {
        for (const handle of this.handles.values()) handle.cancel();
    }

    /** Restarts every stack's replication, re-resolving each remote. */
    public async restart(): Promise<void> {
        await Promise.all([...this.handles.values()].map(handle => handle.restart()));
    }
}

export {
    createReplicationFilter,
    isInternalDoc,
    resolveInternalClasses,
    INTERNAL_DOC_IDS,
    INTERNAL_DOC_ID_PREFIXES,
    INTERNAL_DOC_CLASSES,
    OPTIONAL_INTERNAL_DOC_CLASSES,
} from "./internal-docs.js";
export type { InternalDocFilterOptions } from "./internal-docs.js";
export { createClassFilter, hasClassRules, DATA_MODEL_CLASSES } from "./class-filter.js";
export type { ClassFilterOptions } from "./class-filter.js";
export { deriveTenantScope, classTenants } from "./tenants.js";
export type { TenantScope } from "./tenants.js";
export { withFilterIdentity, describeFilter, composeFilterIdentity } from "./filter-identity.js";
