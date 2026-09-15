import { HttpError } from "./errors.js";
import type { Router } from "./router.js";
import type { AuthedContext } from "./server.js";
import { resolveGrant } from "../auth/grants.js";
import type { Principal } from "../types.js";

const cookieHeader = (ctx: AuthedContext, value: string, maxAgeSeconds: number): string => {
    const cookie = ctx.app.config.auth.session.cookie;
    const parts = [`${cookie.name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${cookie.sameSite}`, `Max-Age=${maxAgeSeconds}`];
    if (cookie.secure || cookie.sameSite === "None") parts.push("Secure");
    return parts.join("; ");
};

/** The session payload (spec 03 §6): the token, what the grant reaches, and the key material a replica adopts. */
const describeSession = async (ctx: AuthedContext, principal: Principal, extra: Record<string, unknown> = {}) => {
    const grant = await resolveGrant(ctx.app.config, principal);
    const attributeKey = ctx.app.authority ? await ctx.app.authority.keygen(grant.attributes) : null;
    const stacks = Object.keys(grant.grant.stacks);
    return { principal: { sub: principal.sub, attributes: grant.attributes, via: principal.via }, stacks, ui: grant.grant.ui === true, attributeKey, ...extra };
};

/**
 * `/auth/*` (spec 03 §6): sessions the node issues from its own credential store,
 * their teardown, and what the current principal is.
 */
export const registerSessionRoutes = (router: Router): void => {
    router.add("POST", "/auth/session", async (ctx: AuthedContext) => {
        const { app } = ctx;
        if (!app.users || !app.config.auth.users) throw new HttpError(404, "not_found", "This node does not issue sessions; present a bearer token instead.");
        const body = await ctx.body<{ username?: unknown; password?: unknown }>();
        if (typeof body.username !== "string" || typeof body.password !== "string") throw new HttpError(400, "bad_request", "'username' and 'password' are required.");
        const record = await app.users.verify(body.username, body.password);
        if (!record) throw new HttpError(401, "unauthorized", "Name or password is incorrect.");
        const principal: Principal = { sub: record.username, attributes: record.attributes, claims: { ...(record.claims ?? {}), username: record.username }, via: "basic" };
        const grant = await resolveGrant(app.config, principal);
        const ttl = app.config.auth.session.ttlSeconds;
        const { token, expiresAt } = await app.tokens.issue({ sub: record.username, attributes: grant.attributes, ...(record.claims ?? {}) }, ttl);
        const payload = await describeSession(ctx, { ...principal, attributes: grant.attributes }, {
            token,
            expiresAt,
            keyDerivationSalt: record.keyDerivationSalt ?? null,
            wrappedDocumentKey: record.wrappedDocumentKey ?? null,
        });
        ctx.json(200, payload, { "Set-Cookie": cookieHeader(ctx, token, ttl) });
    });

    router.add("DELETE", "/auth/session", async (ctx: AuthedContext) => {
        ctx.json(200, { ok: true }, { "Set-Cookie": cookieHeader(ctx, "", 0) });
    });

    router.add("GET", "/auth/me", async (ctx: AuthedContext) => {
        if (!ctx.principal) throw new HttpError(401, "unauthorized", "No principal.");
        ctx.json(200, await describeSession(ctx, ctx.principal));
    });
};
