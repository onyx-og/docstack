import type { IncomingHttpHeaders } from "node:http";
import type { TokenService } from "./jwt.js";
import type { CredentialStore } from "./users.js";
import type { Principal } from "../types.js";
import { HttpError } from "../http/errors.js";

const attributesOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The value of one cookie from a `Cookie` header, or `undefined`. */
export const readCookie = (header: string | undefined, name: string): string | undefined => {
    if (!header) return undefined;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return decodeURIComponent(rest.join("="));
    }
    return undefined;
};

/**
 * Who is asking (spec 03 §5), in order: a bearer JWT, the node's own session cookie,
 * Basic credentials against the store. `null` when the request carries nothing;
 * 401 when it carries something the node does not accept.
 */
export const resolvePrincipal = async (
    headers: IncomingHttpHeaders,
    deps: { tokens: TokenService; users: CredentialStore | null; cookieName: string },
): Promise<Principal | null> => {
    const authorization = headers.authorization;
    if (authorization) {
        const [scheme, ...rest] = authorization.split(" ");
        const credential = rest.join(" ").trim();
        if (/^bearer$/i.test(scheme)) {
            const verified = deps.tokens.canVerify ? await deps.tokens.verify(credential) : null;
            if (!verified || typeof verified.payload.sub !== "string") throw new HttpError(401, "unauthorized", "The bearer token is not accepted by this node.");
            return { sub: verified.payload.sub, attributes: attributesOf(verified.payload.attributes), claims: verified.payload as Record<string, unknown>, via: "bearer" };
        }
        if (/^basic$/i.test(scheme)) {
            if (!deps.users) throw new HttpError(401, "unauthorized", "This node has no credential store.");
            const decoded = Buffer.from(credential, "base64").toString("utf8");
            const separator = decoded.indexOf(":");
            const username = separator === -1 ? decoded : decoded.slice(0, separator);
            const password = separator === -1 ? "" : decoded.slice(separator + 1);
            const record = await deps.users.verify(username, password);
            if (!record) throw new HttpError(401, "unauthorized", "Name or password is incorrect.");
            return { sub: record.username, attributes: record.attributes, claims: { ...(record.claims ?? {}), username: record.username }, via: "basic" };
        }
        throw new HttpError(401, "unauthorized", `Unsupported authorization scheme '${scheme}'.`);
    }
    const cookie = readCookie(headers.cookie, deps.cookieName);
    if (cookie) {
        const verified = deps.tokens.canVerify ? await deps.tokens.verify(cookie) : null;
        if (!verified || typeof verified.payload.sub !== "string") throw new HttpError(401, "unauthorized", "The session cookie is not accepted by this node.");
        return { sub: verified.payload.sub, attributes: attributesOf(verified.payload.attributes), claims: verified.payload as Record<string, unknown>, via: "cookie" };
    }
    return null;
};
