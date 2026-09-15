import type { IncomingMessage, ServerResponse } from "node:http";

export type Method = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "HEAD";

/** What a route handler gets. Built once per request by the server. */
export interface RequestContext {
    req: IncomingMessage;
    res: ServerResponse;
    method: Method;
    url: URL;
    /** `:name` captures from the matched pattern, already URL-decoded. */
    params: Record<string, string>;
    /** A per-request id, the session id for engine sessions. */
    requestId: string;
    /** The parsed JSON body, read at most once; `{}` for an empty body. */
    body<T = Record<string, unknown>>(): Promise<T>;
    /** Sends a JSON response and ends. */
    json(status: number, data: unknown, headers?: Record<string, string>): void;
}

export type Handler = (ctx: RequestContext) => Promise<void> | void;

interface Route {
    method: Method;
    segments: string[];
    handler: Handler;
}

/**
 * A pattern router: `/s/:stack/_ds/docs/:id`, exact segments or `:captures`. Enough for
 * the twenty-odd routes the host serves; no framework, so the longpoll and the
 * upgrade are plain `node:http`.
 */
export class Router {
    private readonly routes: Route[] = [];

    add(method: Method, pattern: string, handler: Handler): this {
        this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler });
        return this;
    }

    /** The first route matching the method and path, with its captures. */
    match(method: Method, pathname: string): { handler: Handler; params: Record<string, string> } | null {
        const parts = pathname.split("/").filter(Boolean);
        for (const route of this.routes) {
            if (route.method !== method || route.segments.length !== parts.length) continue;
            const params: Record<string, string> = {};
            let ok = true;
            for (let i = 0; i < route.segments.length; i++) {
                const segment = route.segments[i];
                if (segment.startsWith(":")) {
                    try {
                        params[segment.slice(1)] = decodeURIComponent(parts[i]);
                    } catch {
                        ok = false;
                        break;
                    }
                } else if (segment !== parts[i]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return { handler: route.handler, params };
        }
        return null;
    }

    /** Whether any route exists for the path, whatever the method (for 405 versus 404). */
    knows(pathname: string): boolean {
        const parts = pathname.split("/").filter(Boolean);
        return this.routes.some((route) =>
            route.segments.length === parts.length
            && route.segments.every((segment, i) => segment.startsWith(":") || segment === parts[i]));
    }
}
