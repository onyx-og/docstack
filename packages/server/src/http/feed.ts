import type { ChangesSubscription, Document } from "@docstack/shared";
import type { RequestSession } from "../session/index.js";
import type { AuthedContext } from "./server.js";
import { HttpError } from "./errors.js";

/** One change as the feed emits it: the change, narrowed to the session, plus which subscription it belongs to. */
export interface FeedEvent {
    seq: string | number;
    id: string;
    deleted?: boolean;
    doc?: Document;
    class?: string;
    domain?: string;
}

const listOf = (value: string | null): string[] => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []);

/**
 * The live feed (spec 03 §3.1): server-sent events, one `doc` event per change on the
 * classes and domains asked for, narrowed through the session so sealed fields read
 * `null`. `since` replays what the session missed, then the live subscriptions take
 * over; a heartbeat comment keeps the connection warm and an idle timeout lets the
 * client reconnect from its last `id`.
 */
export const serveFeed = async (ctx: AuthedContext, session: RequestSession): Promise<void> => {
    const classes = listOf(ctx.url.searchParams.get("classes"));
    const domains = listOf(ctx.url.searchParams.get("domains"));
    if (!classes.length && !domains.length) throw new HttpError(400, "bad_request", "The feed needs 'classes' and/or 'domains'.");
    const sinceParam = ctx.url.searchParams.get("since") ?? ctx.req.headers["last-event-id"];
    const { res, app } = ctx;
    const { view, host } = session;

    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.write(`retry: 3000\n: open\n\n`);

    const subscriptions: ChangesSubscription[] = [];
    let closed = false;
    let lastSeq: string | number | null = null;
    // Live events arriving during the catch-up wait here; they flush after it, minus
    // whatever the catch-up already delivered.
    let catchingUp = typeof sinceParam === "string" && sinceParam !== "";
    const buffered: FeedEvent[] = [];
    const delivered = new Set<string>();

    const emit = (event: FeedEvent) => {
        if (closed) return;
        const key = `${event.id}@${event.seq}`;
        if (delivered.has(key)) return;
        delivered.add(key);
        if (delivered.size > 10_000) delivered.clear();
        lastSeq = event.seq;
        res.write(`event: doc\nid: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        resetIdle();
    };

    const heartbeat = setInterval(() => { if (!closed) res.write(`: ping ${Date.now()}\n\n`); }, app.config.feed.heartbeatMs);
    let idle: NodeJS.Timeout | null = null;
    const resetIdle = () => {
        if (idle) clearTimeout(idle);
        idle = setTimeout(() => close(), app.config.feed.idleMs);
    };
    const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (idle) clearTimeout(idle);
        for (const subscription of subscriptions) view.releaseListener(subscription);
        if (!res.writableEnded) res.end();
    };
    ctx.req.on("close", close);
    resetIdle();

    const subscribe = (name: string, kind: "class" | "domain") => {
        const target = new EventTarget();
        target.addEventListener("doc", (raw: Event) => {
            const change = (raw as CustomEvent).detail;
            const event: FeedEvent = { seq: change.seq, id: change.id, deleted: change.deleted, doc: change.doc, [kind]: name };
            if (catchingUp) buffered.push(event);
            else emit(event);
        });
        subscriptions.push(kind === "class" ? view.subscribeClassDocs(name, target) : view.subscribeDomainDocs(name, target));
    };
    for (const name of classes) subscribe(name, "class");
    for (const name of domains) subscribe(name, "domain");

    if (catchingUp) {
        try {
            const classSet = new Set(classes);
            const domainSet = new Set(domains);
            const since = /^\d+$/.test(sinceParam as string) ? Number(sinceParam) : (sinceParam as string);
            const changes = await host.stack.db.changes({ since, include_docs: true, live: false });
            for (const change of changes.results) {
                const raw = change.doc as Document | undefined;
                if (!raw) continue;
                const className = (raw as any)["~class"] as string | undefined;
                const domainName = (raw as any)["~domain"] as string | undefined;
                if (className && classSet.has(className)) {
                    const classObj = (await host.stack.getClassSnapshot(className)) ?? undefined;
                    const doc = await host.stack.prepareChangeDocument(raw, classObj, session.session);
                    emit({ seq: change.seq, id: change.id, deleted: change.deleted, doc, class: className });
                } else if (domainName && domainSet.has(domainName)) {
                    const doc = await host.stack.prepareChangeDocument(raw, undefined, session.session);
                    emit({ seq: change.seq, id: change.id, deleted: change.deleted, doc, domain: domainName });
                }
            }
        } catch (error) {
            app.logger.warn("feed catch-up failed", { stack: host.name, error: (error as Error)?.message });
        } finally {
            catchingUp = false;
            for (const event of buffered.splice(0)) emit(event);
        }
    }

    await new Promise<void>((resolve) => {
        const done = () => resolve();
        ctx.req.on("close", done);
        res.on("close", done);
        if (closed) done();
    });
    void lastSeq;
};
