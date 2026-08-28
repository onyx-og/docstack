import type { ChannelTransport } from "./transport.js";
import { PROTOCOL_VERSION, describeError, reviveError } from "./protocol.js";
import type { Frame } from "./protocol.js";

/**
 * The driver half's client side of the protocol: correlated calls and subscriptions.
 *
 * Backpressure needs nothing here by design (ADR-0030 §3): every call is
 * request/response, so the replicator driving this client paces itself batch by batch.
 * Only subscriptions push, and they carry change notifications, not bulk data.
 *
 * @module
 */

type EventHandler = (kind: string, data: unknown) => void;

export class RpcClient {
    private seq = 0;
    private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    private readonly subscriptions = new Map<number, EventHandler>();
    private readonly transport: ChannelTransport;
    private closed = false;

    constructor(transport: ChannelTransport) {
        this.transport = transport;
        transport.onFrame(frame => this.onFrame(frame as Frame));
        transport.onClose(() => this.failAll(new Error("The channel closed with calls outstanding")));
    }

    /** One RPC round trip. Rejects with the host's error, `status` intact. */
    call<T = unknown>(method: string, args: unknown[]): Promise<T> {
        if (this.closed) return Promise.reject(new Error("The channel is closed"));
        return new Promise<T>((resolve, reject) => {
            const id = ++this.seq;
            this.pending.set(id, { resolve, reject });
            this.transport.send({ v: PROTOCOL_VERSION, t: "req", id, m: method, a: args });
        });
    }

    /** Opens a subscription; `onEvent` fires per event until {@link unsubscribe}. */
    subscribe(method: string, args: unknown[], onEvent: EventHandler): number {
        const id = ++this.seq;
        this.subscriptions.set(id, onEvent);
        this.transport.send({ v: PROTOCOL_VERSION, t: "sub", id, m: method, a: args });
        return id;
    }

    /** Closes one subscription. Safe to call for an id already gone. */
    unsubscribe(id: number): void {
        if (!this.subscriptions.delete(id)) return;
        if (!this.closed) {
            this.transport.send({ v: PROTOCOL_VERSION, t: "unsub", id });
        }
    }

    /** Closes the transport. Outstanding calls reject; subscriptions go quiet. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.transport.close();
        this.failAll(new Error("The channel was closed"));
    }

    private onFrame(frame: Frame): void {
        if (!frame || typeof frame !== "object") return;
        if (frame.t === "res") {
            const waiter = this.pending.get(frame.id);
            if (!waiter) return;
            this.pending.delete(frame.id);
            if (frame.ok) waiter.resolve(frame.r);
            else waiter.reject(reviveError(frame.e));
            return;
        }
        if (frame.t === "evt") {
            this.subscriptions.get(frame.id)?.(frame.k, frame.d);
        }
    }

    private failAll(error: Error): void {
        this.closed = true;
        for (const { reject } of this.pending.values()) reject(error);
        this.pending.clear();
        this.subscriptions.clear();
    }
}

export { describeError };
