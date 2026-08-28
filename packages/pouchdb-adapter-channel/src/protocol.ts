/**
 * The wire protocol: what crosses a channel, and nothing else.
 *
 * Four frame kinds. `req`/`res` carry one RPC round trip; `sub` opens a named
 * subscription whose `evt` frames flow until `unsub`. Every frame carries the protocol
 * version - apps on the two ends of a channel ship independently (ADR-0030 §3's version
 * skew risk), so the version is checked per frame and a mismatch is refused with an
 * error the driver surfaces, never guessed around.
 *
 * Frames must survive the transport binding's serialization. Structured clone is the
 * *ceiling* (MessagePort, in-process loopback); a wire binding may support less and must
 * encode what it forwards - serialization lives in the binding, not here (ADR-0030 §3).
 * Nothing in a frame is ever a function.
 *
 * @module
 */

/** The one protocol version this build speaks. */
export const PROTOCOL_VERSION = 1;

/** One RPC request. `m` names a host method, `a` its arguments. */
export interface RequestFrame {
    v: number;
    t: "req";
    id: number;
    m: string;
    a: unknown[];
}

/** The reply to a `req` or the refusal of any frame. */
export interface ResponseFrame {
    v: number;
    t: "res";
    id: number;
    ok: boolean;
    r?: unknown;
    e?: WireError;
}

/** Opens a subscription (today: the live changes feed). */
export interface SubscribeFrame {
    v: number;
    t: "sub";
    id: number;
    m: string;
    a: unknown[];
}

/** One event on an open subscription. */
export interface EventFrame {
    v: number;
    t: "evt";
    id: number;
    k: string;
    d?: unknown;
}

/** Closes a subscription. Idempotent on the host. */
export interface UnsubscribeFrame {
    v: number;
    t: "unsub";
    id: number;
}

export type Frame = RequestFrame | ResponseFrame | SubscribeFrame | EventFrame | UnsubscribeFrame;

/**
 * An error flattened for the wire.
 *
 * `status` matters most: PouchDB drives control flow off it - a 404 from `getLocal` is
 * "no checkpoint yet, start from zero", not a failure - so it must survive the round
 * trip exactly.
 */
export interface WireError {
    name?: string;
    message: string;
    status?: number;
    error?: true;
}

/** Flattens an error for the wire, keeping the fields PouchDB keys on. */
export const describeError = (error: any): WireError => ({
    name: error?.name,
    message: error?.message || String(error),
    status: typeof error?.status === "number" ? error.status : undefined,
    error: true,
});

/** Rebuilds a throwable error from its wire form, `status` and `name` intact. */
export const reviveError = (wire: WireError | undefined): Error => {
    const error = new Error(wire?.message || "channel error") as Error & { status?: number; error?: true };
    if (wire?.name) error.name = wire.name;
    if (typeof wire?.status === "number") error.status = wire.status;
    error.error = true;
    return error;
};
