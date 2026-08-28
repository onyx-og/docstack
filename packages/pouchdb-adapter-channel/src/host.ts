import type { ChannelTransport } from "./transport.js";
import { PROTOCOL_VERSION, describeError } from "./protocol.js";

/**
 * The host half: serves a local, real PouchDB over one channel.
 *
 * This is where scope is enforced, and only here (ADR-0030 §3): the driver on the far
 * end of a channel cannot be trusted to filter itself once the two halves are on
 * different machines, so what a channel may *read* and what it may *write* are both
 * decided against the database being served. The grant is two-sided (ADR-0030 §4) -
 * `serve` guards everything that leaves, `accept` everything that arrives - and the two
 * are independent: a channel can be read-only, or write-only into one class.
 *
 * One call serves one channel; a hub serving N channels calls this N times against the
 * same database, each call with that channel's own grant. The host holds no replication
 * state - drivers drive (ADR-0030 §4), the host answers.
 *
 * @module
 */

/** The grant one channel gets. Omitted hooks mean "everything". */
export interface ServeChannelOptions {
    /**
     * Pull scope: a document leaves over this channel only if this returns `true`.
     * Applied to change rows, `get`, `allDocs` and `bulkGet` results. Tombstones always
     * travel - dropping a deletion means the peer never hears of it (the gdrive
     * adapter's lesson, kept).
     */
    serve?: (doc: any) => boolean;
    /**
     * Push scope: an arriving document is written only if this returns `true`. A
     * refused document is answered with a per-document `forbidden` error, which a
     * replicating driver surfaces as a denied write.
     */
    accept?: (doc: any) => boolean;
    /**
     * Whether the channel may destroy the database. Off by default: a channel is a
     * replication peer, not an owner.
     */
    allowDestroy?: boolean;
    /**
     * The document key for the database this channel serves, offered to the driver on
     * request (ADR-0030 §8). Setting it *is* the key grant: the channel grant and the
     * key grant are one decision (ADR-0030, Decision 6), so there is no second
     * entitlement surface - a channel this host serves encrypted content to is a
     * channel it hands the key to, and a channel that must not read simply is not
     * given this option.
     *
     * A function defers to the serving realm's own key state - for a DocStack hub,
     * `() => stack.cryptoEngine.getDocumentKey()` - and may be async.
     *
     * The key crosses the channel as-is. That is the design for the hub topology,
     * where the transport is a same-browser MessagePort and the hub homes auth; over a
     * *relayed* binding a raw key would hand itself to the relay and break the
     * blind-intermediary property (ADR-0030 §3), so do not set this on a channel whose
     * transport an untrusted party carries.
     */
    documentKey?: string | (() => string | null | undefined | Promise<string | null | undefined>);
}

/** A handle on one served channel. */
export interface ChannelServer {
    /** Stops serving: cancels live feeds and detaches from the transport. */
    close(): void;
    /** Live changes subscriptions currently open, for observability and tests. */
    subscriptionCount(): number;
}

const forbidden = (message: string) => Object.assign(new Error(message), { name: "forbidden", status: 403 });

/**
 * Serves `db` to whatever driver sits across `transport`.
 *
 * @param db - Any real PouchDB instance; its own adapter provides the storage
 * semantics (rev trees, `all_docs` leaves, ordered sequences) natively.
 * @param transport - The host's end of the channel.
 * @param options - This channel's grant.
 * @returns The handle to stop serving with.
 */
export const serveChannel = (db: any, transport: ChannelTransport, options: ServeChannelOptions = {}): ChannelServer => {
    const { serve, accept } = options;
    const feeds = new Map<number, { cancel: () => void }>();
    let closed = false;

    // Internal adapter methods are callback-style; every real PouchDB instance carries
    // them, whatever its adapter - they are the same contract the driver re-exposes.
    const internal = (method: string, ...args: unknown[]) =>
        new Promise<any>((resolve, reject) => {
            db[method](...args, (error: any, result: any) => error ? reject(error) : resolve(result));
        });

    // A deletion must always travel; a scope that could drop tombstones would strand
    // the far end on a document that no longer exists.
    const rowAllowed = (row: any): boolean => !serve || row.deleted || !row.doc || serve(row.doc);

    const stripDoc = ({ doc, ...rest }: any) => rest;

    const methods: Record<string, (...args: any[]) => Promise<unknown> | unknown> = {
        id: () => db.id(),
        info: () => db.info(),

        get: async (id: string, opts: any) => {
            const result = await internal("_get", id, opts || {});
            if (serve && result?.doc && !result.doc._deleted && !serve(result.doc)) {
                throw forbidden(`This channel's scope does not serve '${id}'.`);
            }
            return { doc: result.doc, metadata: result.metadata };
        },

        getRevisionTree: (id: string) => internal("_getRevisionTree", id),

        allDocs: async (opts: any) => {
            const result = await internal("_allDocs", opts || {});
            if (serve && Array.isArray(result?.rows)) {
                result.rows = result.rows.filter((row: any) => !row.doc || row.value?.deleted || serve(row.doc));
            }
            return result;
        },

        bulkGet: async (opts: any) => {
            const result = await db.bulkGet(opts || { docs: [] });
            if (serve && Array.isArray(result?.results)) {
                for (const entry of result.results) {
                    entry.docs = entry.docs.map((item: any) =>
                        item.ok && !item.ok._deleted && !serve(item.ok)
                            ? { error: describeError(forbidden(`This channel's scope does not serve '${entry.id}'.`)) }
                            : item);
                }
            }
            return result;
        },

        bulkDocs: async (docs: any[], opts: { new_edits: boolean }) => {
            if (!accept) return db.bulkDocs(docs, opts);
            const verdicts = docs.map(doc => doc?._deleted ? true : accept(doc));
            const allowed = docs.filter((_, index) => verdicts[index]);
            const written: any[] = allowed.length ? await db.bulkDocs(allowed, opts) : [];
            // `new_edits: false` answers with errors only; report refusals the same way
            // and let accepted writes stay silent, so the driver's core sees the shape
            // it expects from a real adapter.
            let cursor = 0;
            const merged: any[] = [];
            docs.forEach((doc, index) => {
                if (!verdicts[index]) {
                    merged.push({
                        id: doc?._id, error: "forbidden", name: "forbidden", status: 403,
                        message: "This channel's scope does not accept this document.",
                    });
                    return;
                }
                const outcome = written[cursor++];
                if (outcome !== undefined) merged.push(outcome);
                else if (opts.new_edits !== false) merged.push({ ok: true, id: doc?._id, rev: doc?._rev });
            });
            return merged;
        },

        getLocal: (id: string) => internal("_getLocal", id),
        putLocal: (doc: any) => internal("_putLocal", doc, {}),
        removeLocal: (doc: any) => internal("_removeLocal", doc, {}),

        getAttachment: (docId: string, attachId: string, opts: any) =>
            db.getAttachment(docId, attachId, opts || {}),

        changes: (opts: any) => new Promise((resolve, reject) => {
            const wireOpts = { ...(opts || {}) };
            const callerWantsDocs = Boolean(wireOpts.include_docs);
            if (serve) wireOpts.include_docs = true;
            const feed = db.changes({ ...wireOpts, live: false, return_docs: true });
            feed.on("complete", (info: any) => {
                let rows: any[] = info.results || [];
                if (serve) {
                    rows = rows.filter(rowAllowed);
                    if (!callerWantsDocs) rows = rows.map(stripDoc);
                }
                // `last_seq` stays the feed's own: a withheld document is withheld for
                // as long as this grant stands, so the checkpoint moving past it is
                // correct - the same contract as any filtered replication.
                resolve({ results: rows, last_seq: info.last_seq });
            });
            feed.on("error", reject);
        }),

        destroy: () => {
            if (!options.allowDestroy) {
                throw forbidden("This channel may not destroy the database it is served from.");
            }
            return db.destroy();
        },

        documentKey: async () => {
            const provider = options.documentKey;
            if (provider === undefined) {
                throw Object.assign(new Error("This channel does not offer a document key."),
                    { name: "no_key", status: 404 });
            }
            const key = typeof provider === "function" ? await provider() : provider;
            if (!key) {
                // Configured but currently keyless - a locked hub stack. Same answer as
                // "not offered": the driver has nothing to unlock with either way.
                throw Object.assign(new Error("The host holds no document key right now."),
                    { name: "no_key", status: 404 });
            }
            return key;
        },
    };

    const openLiveFeed = (id: number, opts: any) => {
        const wireOpts = { ...(opts || {}) };
        const callerWantsDocs = Boolean(wireOpts.include_docs);
        if (serve) wireOpts.include_docs = true;
        delete wireOpts.limit;
        const feed = db.changes({ ...wireOpts, live: true, return_docs: false });
        feed.on("change", (row: any) => {
            if (!rowAllowed(row)) return;
            const out = serve && !callerWantsDocs ? stripDoc(row) : row;
            send({ v: PROTOCOL_VERSION, t: "evt", id, k: "change", d: out });
        });
        feed.on("error", (error: any) => {
            feeds.delete(id);
            send({ v: PROTOCOL_VERSION, t: "evt", id, k: "error", d: describeError(error) });
        });
        feeds.set(id, feed);
    };

    const send = (frame: unknown) => {
        if (!closed) transport.send(frame);
    };

    const onFrame = async (frame: any) => {
        if (!frame || typeof frame !== "object") return;

        if (frame.t === "req") {
            if (frame.v !== PROTOCOL_VERSION) {
                send({
                    v: PROTOCOL_VERSION, t: "res", id: frame.id, ok: false,
                    e: describeError(Object.assign(
                        new Error(`This host speaks channel protocol ${PROTOCOL_VERSION}, the driver sent ${frame.v}.`),
                        { name: "version_mismatch", status: 400 }
                    )),
                });
                return;
            }
            const method = methods[frame.m];
            if (!method) {
                send({
                    v: PROTOCOL_VERSION, t: "res", id: frame.id, ok: false,
                    e: describeError(Object.assign(new Error(`Unknown channel method '${frame.m}'.`), { status: 400 })),
                });
                return;
            }
            try {
                const result = await method(...(frame.a || []));
                send({ v: PROTOCOL_VERSION, t: "res", id: frame.id, ok: true, r: result });
            } catch (error) {
                send({ v: PROTOCOL_VERSION, t: "res", id: frame.id, ok: false, e: describeError(error) });
            }
            return;
        }

        if (frame.t === "sub" && frame.m === "changesLive" && frame.v === PROTOCOL_VERSION) {
            openLiveFeed(frame.id, (frame.a || [])[0]);
            return;
        }

        if (frame.t === "unsub") {
            const feed = feeds.get(frame.id);
            if (feed) {
                feeds.delete(frame.id);
                feed.cancel();
            }
        }
    };

    const offFrame = transport.onFrame(onFrame);
    const offClose = transport.onClose(() => close());

    const close = () => {
        if (closed) return;
        closed = true;
        for (const feed of feeds.values()) feed.cancel();
        feeds.clear();
        offFrame();
        offClose();
    };

    return {
        close,
        subscriptionCount: () => feeds.size,
    };
};
