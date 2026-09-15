import type { SessionView } from "@docstack/client";
import type { StackSession } from "@docstack/shared";
import type { HostStack } from "../engine/stacks.js";
import type { CompiledGrant } from "../auth/grants.js";
import type { Entitlements, Entitlement } from "./entitlement.js";
import type { Principal, StackGrant } from "../types.js";

/** Everything one API request runs with. */
export interface RequestSession {
    principal: Principal;
    grant: CompiledGrant;
    stackGrant: StackGrant;
    host: HostStack;
    entitlement: Entitlement;
    session: StackSession;
    /** The engine's view of the stack as this session sees it. Every read and write goes through it. */
    view: SessionView;
}

/**
 * Builds the engine session for one request (spec 03 §4): the entitlement decided by
 * the authority's mathematics, `documentKey` from the grant, and the view from
 * `stack.forSession`. Cheap; one per request is the intended granularity.
 */
export const openRequestSession = async (input: {
    requestId: string;
    host: HostStack;
    principal: Principal;
    grant: CompiledGrant;
    stackGrant: StackGrant;
    entitlements: Entitlements;
}): Promise<RequestSession> => {
    const { requestId, host, principal, grant, stackGrant, entitlements } = input;
    const entitlement = await entitlements.resolve(host, grant.attributes);
    const session: StackSession = {
        id: requestId,
        principal: { sub: principal.sub, attributes: grant.attributes, via: principal.via },
        scopes: entitlement.scopes,
        documentKey: stackGrant.documentKey === true,
    };
    return { principal, grant, stackGrant, host, entitlement, session, view: host.stack.forSession(session) };
};
