import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ServerConfig } from "../config/schema.js";
import type { StackRegistry } from "../engine/stacks.js";
import type { HostLogger } from "../engine/logging.js";
import type { TokenService } from "../auth/jwt.js";
import type { CredentialStore } from "../auth/users.js";
import type { Authority } from "../auth/authority.js";
import type { Entitlements } from "../session/entitlement.js";
import { resolvePrincipal } from "../auth/principal.js";
import { resolveGrant, type CompiledGrant } from "../auth/grants.js";
import type { Principal } from "../types.js";
import { HttpError, toHttpError } from "./errors.js";
import { Router, type Method, type RequestContext } from "./router.js";

/** What every route can reach. */
export interface AppContext {
    config: ServerConfig;
    registry: StackRegistry;
    logger: HostLogger;
    tokens: TokenService;
    users: CredentialStore | null;
    authority: Authority | null;
    entitlements: Entitlements;
    /** The node's identity for replication ids and `GET /s/`. */
    uuid: string;
    version: string;
}

/** A request context with the principal resolved, as the routes see it. */
export interface AuthedContext extends RequestContext {
    app: AppContext;
    /** `null` when the request carried no credentials. */
    principal: Principal | null;
    /** Resolved lazily from the principal; throws 401 without one. */
    grant(): Promise<CompiledGrant>;
}

const METHODS: Method[] = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"];

const readBody = (req: IncomingMessage, limit: number): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
                reject(new HttpError(413, "too_large", `The request body exceeds ${limit} bytes.`));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });

const applyCors = (config: ServerConfig, req: IncomingMessage, res: ServerResponse): void => {
    const origin = req.headers.origin;
    if (!origin || !config.cors.origins.includes(origin)) return;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "ETag, Content-Type");
};

/**
 * The `node:http` listener: CORS, the principal, the route, the body, the error
 * shape. Routes register on the router; the server owns nothing about what they do.
 */
export const createHttpServer = (app: AppContext, router: Router): Server => {
    const { config, logger } = app;

    const server = createNodeServer(async (req, res) => {
        const started = Date.now();
        const requestId = randomUUID();
        const method = (req.method ?? "GET").toUpperCase() as Method;
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        applyCors(config, req, res);
        res.setHeader("X-Request-Id", requestId);

        let bodyText: Promise<string> | null = null;
        const ctx: AuthedContext = {
            req, res, method, url, params: {}, requestId, app, principal: null,
            body: async <T,>() => {
                if (!bodyText) bodyText = readBody(req, config.maxBodyBytes);
                const text = await bodyText;
                if (!text.trim()) return {} as T;
                try {
                    return JSON.parse(text) as T;
                } catch {
                    throw new HttpError(400, "bad_request", "The request body is not valid JSON.");
                }
            },
            json: (status, data, headers) => {
                if (res.headersSent) return;
                const payload = JSON.stringify(data);
                res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), ...(headers ?? {}) });
                res.end(payload);
            },
            grant: async () => {
                if (!ctx.principal) throw new HttpError(401, "unauthorized", "This request needs a principal: a bearer token, a session cookie, or Basic credentials.");
                return resolveGrant(config, ctx.principal);
            },
        };

        try {
            if (!METHODS.includes(method)) throw new HttpError(405, "method_not_allowed", `Method ${method} is not supported.`);
            if (method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
            }
            const matched = router.match(method === "HEAD" ? "GET" : method, url.pathname);
            if (!matched) {
                throw router.knows(url.pathname)
                    ? new HttpError(405, "method_not_allowed", `${method} is not allowed on ${url.pathname}.`)
                    : new HttpError(404, "not_found", "missing");
            }
            ctx.params = matched.params;
            ctx.principal = await resolvePrincipal(req.headers, { tokens: app.tokens, users: app.users, cookieName: config.auth.session.cookie.name });
            await matched.handler(ctx);
            if (!res.headersSent) {
                res.writeHead(204);
                res.end();
            }
        } catch (error) {
            const httpError = toHttpError(error);
            if (httpError.status >= 500) logger.error("request failed", { requestId, method, path: url.pathname, error: httpError.message, stack: (error as Error)?.stack });
            if (!res.headersSent) {
                ctx.json(httpError.status, httpError.toJSON());
            } else {
                res.end();
            }
        } finally {
            logger.debug("request", { requestId, method, path: url.pathname, status: res.statusCode, ms: Date.now() - started, principal: ctx.principal?.sub ?? null });
        }
    });

    server.keepAliveTimeout = 65_000;
    return server;
};
