import { STACK_NAME } from "../config/schema.js";
import { openRequestSession, type RequestSession } from "../session/index.js";
import { HttpError } from "./errors.js";
import type { Router } from "./router.js";
import type { AuthedContext } from "./server.js";
import { serveFeed } from "./feed.js";

/**
 * Resolves the stack, the principal's grant for it and the engine session one API
 * request runs under. The order of refusals is the reachability rule of spec 03 §5:
 * a stack the grant does not name is 404 whether or not it exists; a stack it names
 * but without `api` is 403; no principal at all is 401.
 */
export const openApiSession = async (ctx: AuthedContext): Promise<RequestSession> => {
    const name = ctx.params.stack;
    if (!STACK_NAME.test(name)) throw new HttpError(404, "not_found", "Database does not exist.");
    if (!ctx.principal) throw new HttpError(401, "unauthorized", "This request needs a principal.");
    const grant = await ctx.grant();
    const stackGrant = grant.stackFor(name);
    if (!stackGrant) throw new HttpError(404, "not_found", "Database does not exist.");
    const host = await ctx.app.registry.resolve(name);
    if (!host) throw new HttpError(404, "not_found", "Database does not exist.");
    if (!stackGrant.api) throw new HttpError(403, "forbidden", `The API surface of '${name}' is not granted to this principal.`);
    return openRequestSession({ requestId: ctx.requestId, host, principal: ctx.principal, grant, stackGrant, entitlements: ctx.app.entitlements });
};

/** A model write the grant must admit explicitly: `accept` absent or false refuses. */
const assertModelWrite = (session: RequestSession, model: Record<string, unknown>, kind: string): void => {
    const accept = session.stackGrant.accept;
    let admitted = false;
    try {
        admitted = typeof accept === "function" && accept(model) === true;
    } catch {
        admitted = false;
    }
    if (!admitted) throw new HttpError(403, "forbidden", `Writing ${kind} models on '${session.host.name}' is not granted to this principal.`);
};

const asRecord = (value: unknown, what: string): Record<string, any> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "bad_request", `${what} must be an object.`);
    return value as Record<string, any>;
};

/**
 * The API surface (spec 03 §3.1): `/s/:stack/_ds/*`, every route under the request's
 * session view, so reads narrow, writes attribute and refuse, and triggers see who is
 * asking.
 */
export const registerApiRoutes = (router: Router): void => {
    router.add("GET", "/s/:stack/_ds/classes", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        ctx.json(200, { classes: await view.getClassNames() });
    });

    router.add("GET", "/s/:stack/_ds/classes/:name", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const model = await view.getClassModel(ctx.params.name);
        if (!model) throw new HttpError(404, "not_found", `Class '${ctx.params.name}' not found.`);
        ctx.json(200, { model });
    });

    router.add("POST", "/s/:stack/_ds/classes", async (ctx: AuthedContext) => {
        const session = await openApiSession(ctx);
        const { model } = await ctx.body<{ model?: unknown }>();
        const record = asRecord(model, "model");
        if (record["~class"] !== "class") throw new HttpError(400, "bad_request", "A class model carries '~class': 'class'.");
        assertModelWrite(session, record, "class");
        const [result] = await session.view.db.bulkDocs([record]) as any[];
        if (!result?.ok) throw Object.assign(new Error(result?.message ?? "class write refused"), { name: result?.name, status: result?.status });
        ctx.json(200, { ok: true, id: result.id, rev: result.rev });
    });

    router.add("GET", "/s/:stack/_ds/domains", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const found = await view.findDocuments({ "~class": { $eq: "domain" } }, ["_id", "name"]);
        ctx.json(200, { domains: found.docs.map((doc: any) => doc.name ?? doc._id) });
    });

    router.add("GET", "/s/:stack/_ds/domains/:name", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const model = await view.getDomainModel(ctx.params.name);
        if (!model) throw new HttpError(404, "not_found", `Domain '${ctx.params.name}' not found.`);
        ctx.json(200, { model });
    });

    router.add("POST", "/s/:stack/_ds/domains", async (ctx: AuthedContext) => {
        const session = await openApiSession(ctx);
        const { model } = await ctx.body<{ model?: unknown }>();
        const record = asRecord(model, "model");
        if (record["~class"] !== "domain") throw new HttpError(400, "bad_request", "A domain model carries '~class': 'domain'.");
        assertModelWrite(session, record, "domain");
        const [result] = await session.view.db.bulkDocs([record]) as any[];
        if (!result?.ok) throw Object.assign(new Error(result?.message ?? "domain write refused"), { name: result?.name, status: result?.status });
        ctx.json(200, { ok: true, id: result.id, rev: result.rev });
    });

    router.add("POST", "/s/:stack/_ds/find", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const body = await ctx.body<{ selector?: unknown; fields?: string[]; skip?: number; limit?: number; sort?: any }>();
        const selector = asRecord(body.selector ?? {}, "selector");
        const found = await view.findDocuments(selector, body.fields, body.skip, body.limit, body.sort);
        ctx.json(200, { docs: found.docs });
    });

    router.add("POST", "/s/:stack/_ds/query", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const body = await ctx.body<{ sql?: unknown; params?: unknown[] }>();
        if (typeof body.sql !== "string") throw new HttpError(400, "bad_request", "'sql' must be a string.");
        const params = Array.isArray(body.params) ? body.params : [];
        const result = await view.query(body.sql, ...params);
        ctx.json(200, { rows: result.rows, ast: result.ast });
    });

    router.add("POST", "/s/:stack/_ds/docs", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const body = await ctx.body<{ type?: unknown; docs?: unknown }>();
        if (typeof body.type !== "string") throw new HttpError(400, "bad_request", "'type' must be a class name.");
        if (!Array.isArray(body.docs)) throw new HttpError(400, "bad_request", "'docs' must be an array of { docId, params }.");
        const classObj = await view.getClass(body.type);
        if (!classObj) throw new HttpError(404, "not_found", `Class '${body.type}' not found.`);
        const drafts = body.docs.map((entry: any) => ({ docId: typeof entry?.docId === "string" ? entry.docId : null, params: asRecord(entry?.params ?? {}, "params") }));
        const docs = await view.createDocs(drafts, body.type, classObj);
        ctx.json(200, { docs });
    });

    router.add("PUT", "/s/:stack/_ds/docs/:id", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const body = await ctx.body<{ type?: unknown; params?: unknown }>();
        if (typeof body.type !== "string") throw new HttpError(400, "bad_request", "'type' must be a class name.");
        const classObj = await view.getClass(body.type);
        if (!classObj) throw new HttpError(404, "not_found", `Class '${body.type}' not found.`);
        const doc = await view.createDoc(ctx.params.id, body.type, classObj, asRecord(body.params ?? {}, "params"));
        ctx.json(200, { doc });
    });

    router.add("DELETE", "/s/:stack/_ds/docs/:id", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const ok = await view.deleteDocument(ctx.params.id);
        if (!ok) throw new HttpError(404, "not_found", "missing");
        ctx.json(200, { ok: true });
    });

    router.add("POST", "/s/:stack/_ds/relations", async (ctx: AuthedContext) => {
        const { view } = await openApiSession(ctx);
        const body = await ctx.body<{ domain?: unknown; docs?: unknown }>();
        if (typeof body.domain !== "string") throw new HttpError(400, "bad_request", "'domain' must be a domain name.");
        if (!Array.isArray(body.docs)) throw new HttpError(400, "bad_request", "'docs' must be an array of { docId, params }.");
        const domainObj = await view.getDomain(body.domain);
        if (!domainObj) throw new HttpError(404, "not_found", `Domain '${body.domain}' not found.`);
        const drafts = body.docs.map((entry: any) => ({ docId: typeof entry?.docId === "string" ? entry.docId : null, params: asRecord(entry?.params ?? {}, "params") as any }));
        const docs = await view.createRelationDocs(drafts, body.domain, domainObj);
        ctx.json(200, { docs });
    });

    router.add("GET", "/s/:stack/_ds/feed", async (ctx: AuthedContext) => {
        const session = await openApiSession(ctx);
        await serveFeed(ctx, session);
    });
};
