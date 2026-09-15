import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { setDefaultLogLevel } from "@docstack/client";
import { resolveConfig, defineConfig, type ServerConfig, type ServerConfigInput } from "./config/schema.js";
import { createHostLogger, type HostLogger } from "./engine/logging.js";
import { StackRegistry } from "./engine/stacks.js";
import { Authority } from "./auth/authority.js";
import { CredentialStore } from "./auth/users.js";
import { TokenService } from "./auth/jwt.js";
import { Entitlements } from "./session/entitlement.js";
import { Router } from "./http/router.js";
import { createHttpServer, type AppContext, type AuthedContext } from "./http/server.js";
import { registerApiRoutes } from "./http/api.js";
import { registerSessionRoutes } from "./http/session.js";
import { HttpError } from "./http/errors.js";

export { defineConfig, resolveConfig };
export { loadConfig, applyEnvironment } from "./config/load.js";
export type { ServerConfig, ServerConfigInput } from "./config/schema.js";
export type { Principal, Grant, StackGrant, GrantClassFilter, AuthorityMaterial, HostStackConfig, UserRecord } from "./types.js";
export { Authority } from "./auth/authority.js";
export { CredentialStore } from "./auth/users.js";
export { StackRegistry, HostStack } from "./engine/stacks.js";
export { HttpError } from "./http/errors.js";
export type { FeedEvent } from "./http/feed.js";

export const VERSION = "0.1.0";

/** A running (or startable) node. */
export interface DocStackServer {
    config: ServerConfig;
    registry: StackRegistry;
    users: CredentialStore | null;
    authority: Authority | null;
    logger: HostLogger;
    httpServer: Server;
    /** Binds and resolves with where the node listens; port `0` picks a free one. */
    listen(options?: { port?: number; host?: string }): Promise<{ url: string; port: number; host: string }>;
    /** Stops listening, closes every stack. */
    close(): Promise<void>;
}

/**
 * Builds a node from configuration: opens every stack, wires the surfaces, does not
 * listen yet. `createServer(config).listen()` is what `ds serve` does.
 */
export const createServer = async (input: ServerConfigInput | ServerConfig): Promise<DocStackServer> => {
    const config = resolveConfig(input as ServerConfigInput);
    const logger = createHostLogger(config.logLevel);
    setDefaultLogLevel(config.engineLogLevel);

    const authority = await Authority.load(config.authority);
    const users = config.auth.users ? new CredentialStore(config.auth.store === "memory" ? undefined : join(config.state.dir, "users.json")) : null;
    const tokens = new TokenService(config.auth);
    const registry = new StackRegistry(config, authority, logger);
    const entitlements = new Entitlements(authority);

    const app: AppContext = { config, registry, logger, tokens, users, authority, entitlements, uuid: randomUUID(), version: VERSION };
    const router = new Router();

    router.add("GET", "/health", async (ctx: AuthedContext) => {
        const ready = registry.isReady;
        ctx.json(ready ? 200 : 503, { status: ready ? "ok" : "starting", version: VERSION, stacks: registry.status() });
    });
    router.add("GET", "/s", async (ctx: AuthedContext) => {
        ctx.json(200, { docstack: "Welcome", uuid: app.uuid, version: VERSION, vendor: { name: "DocStack", version: VERSION } });
    });
    registerSessionRoutes(router);
    registerApiRoutes(router);

    const httpServer = createHttpServer(app, router);
    await registry.openAll();
    logger.info("stacks open", { stacks: registry.names(), blind: registry.names().map((name) => registry.get(name)?.blind) });

    return {
        config, registry, users, authority, logger, httpServer,
        listen: (options) => new Promise((resolve, reject) => {
            const host = options?.host ?? config.host;
            const port = options?.port ?? config.port;
            httpServer.once("error", reject);
            httpServer.listen(port, host, () => {
                httpServer.off("error", reject);
                const address = httpServer.address() as AddressInfo;
                const url = `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`;
                logger.info("listening", { url });
                resolve({ url, port: address.port, host });
            });
        }),
        close: async () => {
            await new Promise<void>((resolve) => { httpServer.closeAllConnections?.(); httpServer.close(() => resolve()); });
            await registry.close();
        },
    };
};

export { HttpError as ServerHttpError };
