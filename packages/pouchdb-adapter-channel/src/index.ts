import { ChannelPouch, ADAPTER_NAME } from "./driver.js";
import type { ChannelTransport } from "./transport.js";

/**
 * `@docstack/pouchdb-adapter-channel` - PouchDB replication over a message channel.
 *
 * Two halves and a binding, kept separable on purpose (ADR-0030, Decisions 1-3 and 7):
 *
 * - the **driver half** (this plugin): a PouchDB adapter presenting a database that
 *   lives across a channel - built to be the `remote` of `stack.sync()`;
 * - the **host half** ({@link serveChannel}): binds a channel to any local, real
 *   PouchDB and enforces that channel's grant, two-sided;
 * - the **transport bindings** ({@link createMessagePortTransport},
 *   {@link createLoopbackPair}): how frames physically cross. New topologies are new
 *   bindings, never changes to the halves.
 *
 * @example
 * ```typescript
 * // Hub realm (SharedWorker / iframe): serve each tenant stack per channel.
 * serveChannel(hubDb, createMessagePortTransport(port), { serve: grantFor(origin) });
 *
 * // App realm: replicate against the hub through the paired port.
 * PouchDB.plugin(ChannelPlugin());
 * const remote = new PouchDB("workspace", {
 *     adapter: "channel",
 *     channel: createMessagePortTransport(myPort),
 * });
 * stack.sync({ remote: () => remote });
 * ```
 *
 * @module
 */

export type { ChannelTransport } from "./transport.js";
export { createMessagePortTransport, createLoopbackPair } from "./transport.js";
export { serveChannel } from "./host.js";
export type { ServeChannelOptions, ChannelServer } from "./host.js";
export { PROTOCOL_VERSION } from "./protocol.js";
export type { WireError } from "./protocol.js";
export { ADAPTER_NAME };

/**
 * Fetches the document key a host offers on this channel (ADR-0030 §8).
 *
 * The channel grant and the key grant are one decision: being served this channel is
 * the entitlement, so there is no separate handshake - the host either offers a key
 * (`documentKey` in its {@link ServeChannelOptions}) or answers with a 404-status
 * `no_key` error, which callers should treat as "this content is not encrypted, or not
 * mine to read".
 *
 * The intended use is unlocking the local replica of an encrypted tenant:
 *
 * @example
 * ```typescript
 * const remote = new PouchDB("workspace", { adapter: "channel", channel: transport });
 * await stack.unlock(await requestDocumentKey(remote));
 * await stack.sync({ remote: () => remote });
 * ```
 *
 * `stack.unlock` verifies the key against the stack's own canary (ADR-0018), so a wrong
 * or stale key from the host is rejected there rather than becoming unreadable data.
 *
 * @param db - A PouchDB opened with the `channel` adapter.
 * @returns The hex-encoded document key.
 */
export const requestDocumentKey = (db: any): Promise<string> => {
    if (typeof db?.channelDocumentKey !== "function") {
        return Promise.reject(new Error(
            "requestDocumentKey needs a database opened with the 'channel' adapter."
        ));
    }
    return db.channelDocumentKey();
};

/** Factory-level defaults; per-database options override them. */
export interface ChannelAdapterOptions {
    /** Default transport, for the single-channel case. */
    channel?: ChannelTransport;
}

type Callback = (error: any, result?: any) => void;

/**
 * Plugin factory. Returns a PouchDB plugin registering the `channel` adapter.
 *
 * @param config - Defaults for every database opened through this adapter.
 * @returns A PouchDB plugin function.
 */
export default function ChannelPlugin(config: ChannelAdapterOptions = {}): (PouchDB: any) => void {
    return function (PouchDB: any): void {
        function ConfiguredAdapter(this: unknown, opts: any, callback: Callback): void {
            const mergedOpts = Object.assign({}, config, opts);
            (ChannelPouch as any).call(this, mergedOpts, callback);
        }
        ConfiguredAdapter.valid = ChannelPouch.valid;
        ConfiguredAdapter.use_prefix = ChannelPouch.use_prefix;

        if (PouchDB.adapters) {
            PouchDB.adapters[ADAPTER_NAME] = ConfiguredAdapter;
        } else if (typeof PouchDB.adapter === "function") {
            PouchDB.adapter(ADAPTER_NAME, ConfiguredAdapter, false);
        }
    };
}
