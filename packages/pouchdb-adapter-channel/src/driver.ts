import { RpcClient } from "./rpc.js";
import type { ChannelTransport } from "./transport.js";

/**
 * The driver half: a PouchDB adapter whose database lives across a channel.
 *
 * The far end of the channel is a *real PouchDB* served by `serveChannel` (host.ts), so
 * this adapter holds no storage logic at all - no revision trees, no winner selection,
 * no sequence discipline. Every `api._*` method the replicator drives (the surface the
 * gdrive adapter enumerated the hard way - ADR-0030 §2) forwards as one RPC to the
 * host's same-shaped method, and the host's own adapter answers with native semantics:
 * `style: 'all_docs'` leaves, ordered sequences, real rev trees.
 *
 * Intended use is as a replication endpoint (`stack.sync({ remote })` - one instance
 * per channel, one channel per database). It behaves as an ordinary database too, but
 * every operation pays a channel round trip - which is the ops-proxy cost ADR-0029
 * refused for primary storage, and the reason to keep primary reads on a local adapter.
 *
 * @module
 */

const ADAPTER_NAME = "channel";

type Callback = (error: any, result?: any) => void;

/** Options `new PouchDB(name, { adapter: "channel", ... })` understands. */
export interface ChannelOpenOptions {
    name: string;
    /** The transport to the host half. Required, per database. */
    channel: ChannelTransport;
}

/**
 * Copies only the named scalar options onto a wire-safe object.
 *
 * Options objects PouchDB hands an adapter routinely carry functions (`filter`,
 * callbacks) and context objects; none of that may reach a frame. Explicit picking is
 * the guarantee.
 */
const pick = (source: any, keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (!source) return out;
    for (const key of keys) {
        if (source[key] !== undefined) out[key] = source[key];
    }
    return out;
};

const GET_OPTS = ["rev", "revs", "revs_info", "open_revs", "conflicts", "attachments", "latest", "binary"];
const ALL_DOCS_OPTS = [
    "include_docs", "conflicts", "attachments", "binary", "startkey", "endkey", "start_key", "end_key",
    "inclusive_end", "limit", "skip", "descending", "key", "keys", "update_seq", "deleted",
];
const BULK_GET_OPTS = ["revs", "attachments", "binary", "latest"];
const CHANGES_OPTS = ["since", "limit", "style", "include_docs", "conflicts", "attachments", "binary", "descending", "seq_interval"];

/**
 * The subset of PouchDB's changes filtering an adapter must honor itself.
 *
 * Function filters cannot cross the wire, and must not: on a pull, the *driver's* filter
 * is the receiving side's business while the host applies its own scope independently -
 * the two-sided enforcement of ADR-0030 §4. So the host streams its (scope-filtered)
 * feed, and this predicate applies the caller's `filter`/`doc_ids` here, exactly as the
 * local adapters do.
 */
const makeLocalFilter = (opts: any): ((row: any) => boolean) => {
    if (typeof opts.filter === "string") {
        // Core resolves design-document filters to functions for local adapters before
        // the adapter sees them; a string here means that resolution did not happen.
        throw new Error(`The channel adapter cannot evaluate the named filter '${opts.filter}'; pass a function.`);
    }
    const docIds = Array.isArray(opts.doc_ids) ? new Set(opts.doc_ids) : null;
    const filter = typeof opts.filter === "function" ? opts.filter : null;
    return row => {
        if (docIds && !docIds.has(row.id)) return false;
        if (filter && !filter(row.doc || {}, {})) return false;
        return true;
    };
};

/**
 * The adapter constructor PouchDB applies to its instance shell.
 */
function ChannelPouch(this: any, opts: ChannelOpenOptions & Record<string, any>, callback: Callback): void {
    const api = this;
    const transport = opts.channel;
    if (!transport || typeof transport.send !== "function") {
        queueMicrotask(() => callback(new Error(
            "The 'channel' adapter needs a `channel` transport option - one end of a pair whose other end a host serves."
        )));
        return;
    }
    const rpc = new RpcClient(transport);

    const forward = (method: string, args: unknown[], cb: Callback) => {
        rpc.call(method, args).then(result => cb(null, result), error => cb(error));
    };

    api._remote = false;
    api.type = () => ADAPTER_NAME;

    // The host database's identity, on purpose: this adapter *is* that database seen
    // from another realm, and replication ids derived from it must say so.
    api._id = (cb: Callback) => forward("id", [], cb);

    api._info = (cb: Callback) => forward("info", [], cb);

    api._get = (id: string, getOpts: any, cb: Callback) =>
        forward("get", [id, pick(getOpts, GET_OPTS)], cb);

    api._getRevisionTree = (id: string, cb: Callback) => forward("getRevisionTree", [id], cb);

    api._allDocs = (allDocsOpts: any, cb: Callback) =>
        forward("allDocs", [pick(allDocsOpts, ALL_DOCS_OPTS)], cb);

    api._bulkGet = (bulkGetOpts: any, cb: Callback) =>
        forward("bulkGet", [{ docs: bulkGetOpts?.docs ?? [], ...pick(bulkGetOpts, BULK_GET_OPTS) }], cb);

    // Raw documents forward untouched; the host's own core and adapter run the full
    // authoring or `new_edits: false` pipeline natively.
    api._bulkDocs = (req: any, bulkOpts: any, cb: Callback) =>
        forward("bulkDocs", [req?.docs ?? [], { new_edits: bulkOpts?.new_edits !== false }], cb);

    // Replication checkpoints on both databases, so `_local` documents must land on the
    // host - a driver keeping them to itself would restart every replication from zero.
    api._getLocal = (id: string, cb: Callback) => forward("getLocal", [id], cb);
    api._putLocal = (doc: any, localOpts: any, cb?: Callback) => {
        if (typeof localOpts === "function") { cb = localOpts; }
        forward("putLocal", [doc], cb as Callback);
    };
    api._removeLocal = (doc: any, localOpts: any, cb?: Callback) => {
        if (typeof localOpts === "function") { cb = localOpts; }
        forward("removeLocal", [doc], cb as Callback);
    };

    api._getAttachment = (docId: string, attachId: string, _attachment: any, attOpts: any, cb: Callback) =>
        forward("getAttachment", [docId, attachId, pick(attOpts, ["rev"])], cb);

    api._changes = (changesOpts: any): { cancel: () => void } => {
        const localFilter = makeLocalFilter(changesOpts);
        const wantsDocs = Boolean(changesOpts.include_docs);
        const returnDocs = changesOpts.return_docs !== false;
        const results: any[] = [];
        let lastSeq = changesOpts.since || 0;
        let cancelled = false;
        let subId: number | null = null;

        const wireOpts = pick(changesOpts, CHANGES_OPTS);
        // The caller's filter runs here and needs the body; ask the host for it and
        // strip it again before emitting if the caller did not want documents.
        if (!wantsDocs && (changesOpts.filter || changesOpts.doc_ids)) wireOpts.include_docs = true;
        if (!Number.isFinite(wireOpts.limit as number)) delete wireOpts.limit;

        const emit = (row: any) => {
            lastSeq = Math.max(lastSeq, row.seq || 0);
            if (!localFilter(row)) return;
            if (!wantsDocs && row.doc) {
                row = { ...row };
                delete row.doc;
            }
            if (changesOpts.onChange) changesOpts.onChange(row);
            if (returnDocs) results.push(row);
        };

        rpc.call<{ results: any[]; last_seq: number }>("changes", [wireOpts]).then(page => {
            if (cancelled) return;
            for (const row of page.results) emit(row);
            lastSeq = Math.max(lastSeq, page.last_seq || 0);

            if (!changesOpts.live) {
                if (changesOpts.complete) changesOpts.complete(null, { results, last_seq: lastSeq });
                return;
            }

            // Live: follow from where the catch-up page ended. The host feed emits in
            // seq order and the transport preserves it, so the checkpoint can never
            // pass an unemitted change - the gate the gdrive adapter had to build by
            // hand (ADR-0030 §2) holds here structurally.
            subId = rpc.subscribe("changesLive", [{ ...wireOpts, since: lastSeq, limit: undefined }], (kind, data) => {
                if (cancelled) return;
                if (kind === "change") emit(data);
                // A host-side feed error is terminal for the subscription; live
                // consumers (replication with retry) reconnect by calling again.
                if (kind === "error" && changesOpts.complete) changesOpts.complete(data);
            });
        }).catch(error => {
            if (!cancelled && changesOpts.complete) changesOpts.complete(error);
        });

        return {
            cancel: () => {
                cancelled = true;
                if (subId !== null) rpc.unsubscribe(subId);
            },
        };
    };

    // Key distribution (ADR-0030 §8): the channel grant and the key grant are one
    // decision, so a host serving encrypted content offers the document key on the same
    // channel - being served at all is the entitlement. Hosts that do not offer one
    // answer 404, which `stack.unlock` never sees because the caller checks first.
    api.channelDocumentKey = (): Promise<string> => rpc.call<string>("documentKey", []);

    // Compaction is the owner realm's business - every database has exactly one
    // (ADR-0030 §2) - and destruction crosses it only when the host explicitly allows.
    api._doCompaction = (_opts: any, cb: Callback) =>
        queueMicrotask(() => cb(Object.assign(
            new Error("Compaction belongs to the database's owner realm; run it there, not over a channel."),
            { status: 403 }
        )));

    api._destroy = (_destroyOpts: any, cb: Callback) => {
        forward("destroy", [], (error, result) => {
            if (!error) rpc.close();
            cb(error, result);
        });
    };

    api._close = (cb: Callback) => {
        rpc.close();
        queueMicrotask(() => cb(null));
    };

    queueMicrotask(() => callback(null, api));
}

ChannelPouch.valid = (): boolean => true;
// The name names the channel, not a storage location; nothing to prefix.
ChannelPouch.use_prefix = false;

export { ChannelPouch, ADAPTER_NAME };
