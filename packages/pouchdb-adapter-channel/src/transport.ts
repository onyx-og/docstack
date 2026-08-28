/**
 * Transport bindings: how frames physically cross between two realms.
 *
 * The adapter and the host never touch a MessagePort or a socket - they see this
 * interface, and everything transport-specific (serialization above all - ADR-0030 §3)
 * stays inside the binding. MessagePort is the first binding; a WebSocket or WebRTC
 * DataChannel binding is a new implementation of the same four methods, with its own
 * encoding, and neither half notices.
 *
 * @module
 */

/** A duplex, ordered frame pipe between two realms. */
export interface ChannelTransport {
    /** Sends one frame to the far end. Must preserve send order. */
    send(frame: unknown): void;
    /** Registers a frame handler. Returns its unsubscriber. */
    onFrame(handler: (frame: any) => void): () => void;
    /** Registers a close handler, fired once when the pipe dies. */
    onClose(handler: () => void): () => void;
    /** Closes the pipe. The far end's close handlers fire where the medium can tell. */
    close(): void;
}

type Handler = (frame: any) => void;

/**
 * Binds a `MessagePort` as a transport.
 *
 * Structured clone does the serialization, so frames may carry binary attachment data
 * as-is. `port.close()` is not observable from the far end (the platform fires no event
 * there), which is fine for the hub topology this binding serves: both ends live in one
 * browser, and a vanished peer surfaces as pending calls that never resolve plus the
 * page/worker lifecycle the application already watches.
 *
 * @param port - One end of a `MessageChannel`, or a port received over `postMessage`.
 */
export const createMessagePortTransport = (port: MessagePort): ChannelTransport => {
    const frameHandlers = new Set<Handler>();
    const closeHandlers = new Set<() => void>();
    let closed = false;

    port.addEventListener("message", (event: MessageEvent) => {
        for (const handler of frameHandlers) handler(event.data);
    });
    port.start?.();

    return {
        send: frame => {
            if (!closed) port.postMessage(frame);
        },
        onFrame: handler => {
            frameHandlers.add(handler);
            return () => frameHandlers.delete(handler);
        },
        onClose: handler => {
            closeHandlers.add(handler);
            return () => closeHandlers.delete(handler);
        },
        close: () => {
            if (closed) return;
            closed = true;
            port.close();
            for (const handler of closeHandlers) handler();
        },
    };
};

/**
 * An in-process transport pair, for tests and same-realm composition.
 *
 * Every frame is passed through `structuredClone` and delivered asynchronously - the
 * loopback deliberately behaves like a real port, so a function smuggled into a frame or
 * code relying on synchronous delivery fails here, in the test, rather than on the first
 * real binding.
 *
 * @returns Two connected transports; frames sent on one arrive on the other.
 */
export const createLoopbackPair = (): [ChannelTransport, ChannelTransport] => {
    const make = () => ({
        frameHandlers: new Set<Handler>(),
        closeHandlers: new Set<() => void>(),
        closed: false,
    });
    const a = make();
    const b = make();

    const endpoint = (self: ReturnType<typeof make>, peer: ReturnType<typeof make>): ChannelTransport => ({
        send: frame => {
            if (self.closed || peer.closed) return;
            const delivered = structuredClone(frame);
            queueMicrotask(() => {
                if (peer.closed) return;
                for (const handler of peer.frameHandlers) handler(delivered);
            });
        },
        onFrame: handler => {
            self.frameHandlers.add(handler);
            return () => self.frameHandlers.delete(handler);
        },
        onClose: handler => {
            self.closeHandlers.add(handler);
            return () => self.closeHandlers.delete(handler);
        },
        close: () => {
            if (self.closed) return;
            self.closed = true;
            for (const handler of self.closeHandlers) handler();
            if (!peer.closed) {
                peer.closed = true;
                for (const handler of peer.closeHandlers) handler();
            }
        },
    });

    return [endpoint(a, b), endpoint(b, a)];
};
