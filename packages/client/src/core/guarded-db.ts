import type PouchDB from "pouchdb-browser";
import { readNewEdits } from "../plugins/pouchdb.js";

/**
 * Guards the PouchDB handle a stack hands out.
 *
 * `stack.db` is the documented way to read a stack and to write through its authoring
 * path - {@link StackPlugin} replaces `bulkDocs`, and `put`/`post`/`remove` route
 * through it, so schema validation, relation checks and triggers cannot be skipped by
 * picking a different method.
 *
 * Three doors are left open by PouchDB itself and are closed here:
 *
 * 1. `bulkDocs(docs, { new_edits: false })` tells the plugin the caller already owns
 *    the revisions being written, which is exactly the case replication is in and
 *    exactly the case validation must not run for. Left reachable it is a one-line way
 *    to write anything at all into a stack.
 * 2. `put(doc, { new_edits: false })` is the same escape hatch for a single document.
 * 3. The `_`-prefixed adapter methods (`_bulkDocs`, `_put`, ...) sit *below* the plugin
 *    and never see it at all.
 *
 * Replication needs all of them, so DocStack keeps them for itself: the sync layer
 * works against {@link ClientStack.getReplicationHandle}, which is internal, rather
 * than against this handle.
 *
 * @module
 */

/** Adapter-level methods that sit below the plugin and would skip the authoring path. */
const BLOCKED_ADAPTER_METHODS: readonly string[] = [
    "_bulkDocs",
    "_put",
    "_remove",
    "_bulkGet",
];

/**
 * Raised when application code tries to write around a stack's authoring path.
 *
 * @example
 * ```typescript
 * try {
 *     await stack.db.bulkDocs({ docs: incoming, new_edits: false });
 * } catch (error) {
 *     error instanceof StackWriteGuardError; // true
 * }
 * ```
 */
export class StackWriteGuardError extends Error {
    override name = "StackWriteGuardError";
    /** The method the caller reached for. */
    readonly method: string;

    constructor(method: string, reason: string) {
        super(`${reason} Reach for 'stack.sync(...)' if you are replicating, or the stack's document APIs otherwise.`);
        this.method = method;
    }
}

const NEW_EDITS_REFUSAL =
    "Writing with 'new_edits: false' skips schema validation, relation checks and triggers, so it is reserved for DocStack's own sync layer.";

/**
 * Forwards a property from the underlying database, bound to it.
 *
 * Binding matters: PouchDB's public methods delegate to the adapter through `this`
 * (`bulkGet` calls `this._bulkGet`, `put` may call `this._put`), and if `this` were the
 * wrapper those internal hops would hit the blocks below instead of the adapter. Bound
 * to the real instance, the blocks only ever catch a caller reading the method off the
 * handle - which is the only thing they are meant to catch.
 *
 * `constructor` is the exception: `Function.prototype.bind` drops static properties, so
 * binding it would quietly strip `PouchDB.plugin`, `PouchDB.replicate` and the rest.
 */
const forward = (target: object, property: string | symbol) => {
    const value = Reflect.get(target, property, target);
    if (typeof value !== "function" || property === "constructor") return value;
    return value.bind(target);
};

/**
 * Wraps a PouchDB instance so the validation-skipping paths are unreachable.
 *
 * @param db - The stack's PouchDB instance, already carrying {@link StackPlugin}'s
 * replaced `bulkDocs`/`bulkGet`.
 * @returns A handle with the same surface, minus the escape hatches.
 *
 * @example
 * ```typescript
 * const guarded = createGuardedDb(rawDb);
 * await guarded.put({ _id: "Task-1", "~class": "Task" });   // validated as usual
 * await guarded.bulkDocs({ docs, new_edits: false });       // rejects with StackWriteGuardError
 * ```
 */
export const createGuardedDb = <T extends {}>(db: PouchDB.Database<T>): PouchDB.Database<T> => {
    /**
     * Refuses in whichever style the caller asked in: a callback gets the error, a
     * promise call gets a rejection. Throwing synchronously would be the one shape
     * PouchDB never produces.
     */
    const refuse = (method: string, handler: unknown) => {
        const error = new StackWriteGuardError(method, NEW_EDITS_REFUSAL);
        if (typeof handler === "function") {
            (handler as (err: unknown) => void)(error);
            return undefined;
        }
        return Promise.reject(error);
    };

    const guardedBulkDocs = function (docs: unknown, options?: unknown, callback?: unknown) {
        const handler = typeof options === "function" ? options : callback;
        const opts = typeof options === "function" ? null : (options as PouchDB.Core.BulkDocsOptions | null);

        if (readNewEdits(docs, opts) === false) return refuse("bulkDocs", handler);
        // Forward exactly the arguments this call received: PouchDB's adapters use
        // arguments.length to decide whether to normalize a missing `options`, so
        // passing `options`/`callback` through as explicit `undefined`s (instead of
        // omitting them) skips that normalization and crashes downstream.
        return (db.bulkDocs as any).apply(db, arguments);
    };

    const guardedPut = function (doc: unknown, options?: unknown, callback?: unknown) {
        const handler = typeof options === "function" ? options : callback;
        const opts = typeof options === "function" ? null : (options as { new_edits?: boolean; force?: boolean } | null);

        // `put` carries the flag on its options only - there is no request envelope.
        // `force` is the same hatch under another name: PouchDB rewrites it into
        // `new_edits: false` to mint a deliberately conflicting revision.
        if (opts && (opts.new_edits === false || opts.force)) return refuse("put", handler);
        // See guardedBulkDocs above: forward the real arity, not a padded 3-arg call.
        return (db.put as any).apply(db, arguments);
    };

    return new Proxy(db, {
        get(target, property) {
            if (property === "bulkDocs") return guardedBulkDocs;
            if (property === "put") return guardedPut;

            if (typeof property === "string" && BLOCKED_ADAPTER_METHODS.includes(property)) {
                return function blocked() {
                    throw new StackWriteGuardError(
                        property,
                        `'${property}' is a PouchDB adapter method that bypasses the stack's authoring path entirely.`
                    );
                };
            }

            return forward(target, property);
        },
    }) as PouchDB.Database<T>;
};

/**
 * Restores the pristine PouchDB methods on a stack's database.
 *
 * Replication has to write documents verbatim (`new_edits: false`) and has to read them
 * exactly as they are stored - {@link StackPlugin}'s `bulkGet` decrypts on read, which
 * would push plaintext to a remote that is supposed to hold ciphertext. This handle
 * skips the plugin on both methods while leaving every other method, and the database's
 * own identity, untouched.
 *
 * @param db - The stack's PouchDB instance.
 * @param pristine - The `bulkDocs`/`bulkGet` captured before the plugin replaced them.
 * @returns A handle suitable for `PouchDB.replicate`/`PouchDB.sync`.
 *
 * @internal
 */
export const createReplicationDb = <T extends {}>(
    db: PouchDB.Database<T>,
    pristine: { bulkDocs: Function; bulkGet: Function; get: Function }
): PouchDB.Database<T> => {
    const bulkDocs = pristine.bulkDocs.bind(db);
    const bulkGet = pristine.bulkGet.bind(db);
    // `get` restored for the same reason as `bulkGet`: since ADR-0032 the plugin
    // decrypts single-document reads too, and this handle's whole contract is reading
    // documents exactly as they are stored.
    const get = pristine.get.bind(db);

    return new Proxy(db, {
        get(target, property) {
            if (property === "bulkDocs") return bulkDocs;
            if (property === "bulkGet") return bulkGet;
            if (property === "get") return get;
            return forward(target, property);
        },
    }) as PouchDB.Database<T>;
};
