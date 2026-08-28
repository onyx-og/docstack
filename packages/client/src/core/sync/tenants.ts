import type { ClassModel } from "@docstack/shared";
import type { ClassFilterOptions } from "./class-filter.js";
import type ClientStack from "../stack.js";

/**
 * Tenant scoping for replication channels.
 *
 * A tenant is a stack (ADR-0030). `Class.tenants` declares which tenant spaces a class
 * belongs to - a static list, so partitioning and channel scopes are derivable before
 * any data exists. This module compiles a channel's *entitlement* (the tenants it may
 * see) into configuration the sync layer already understands: which stacks the channel
 * is served at all, and a class filter for stacks holding a mix of declarations.
 *
 * The split matters (ADR-0030 §5): the *partition* is the datamodel's, but the
 * *entitlement* is the serving side's to grant - it cannot come from the datamodel,
 * because every application ships its own model and none is authoritative about the
 * others' entitlements. Enforcement then rides the existing filter chain, which is a
 * conjunction: a derived filter can only narrow what the declarations admit.
 *
 * The strongest grant here is the one that is not a filter at all: a stack outside the
 * scope is simply never served, so its namespace is unreachable rather than filtered.
 *
 * @module
 */

/** A channel's entitlement, compiled into sync configuration. */
export interface TenantScope {
    /**
     * Stacks this entitlement is served at all. A stack not listed is withheld
     * structurally - no replication is started against it, which is a stronger grant
     * than any filter.
     */
    stacks: string[];
    /**
     * Class rules per served stack, present only where the stack needs them: an
     * `exclude` where classes declared for other tenants share an entitled stack, an
     * `include` where a stack is served only because entitled classes live in it.
     */
    classes: Record<string, ClassFilterOptions>;
}

/**
 * Normalizes a class model's tenant declaration.
 *
 * @param model - Any object carrying (or omitting) a `tenants` declaration.
 * @returns The declared tenant names; empty for a tenant-neutral class.
 */
export const classTenants = (
    model: Partial<Pick<ClassModel, "tenants">> | null | undefined
): string[] => {
    const declared = model?.tenants;
    if (!Array.isArray(declared)) return [];
    return declared.filter((t): t is string => typeof t === "string" && t.length > 0);
};

/**
 * Compiles an entitlement into the stacks it reaches and the class rules it needs.
 *
 * A stack is served when its name is an entitled tenant - a tenant *is* a stack - or
 * when it holds at least one class declared for an entitled tenant. Within a served
 * stack:
 *
 * - classes declared for an entitled tenant travel;
 * - tenant-neutral classes follow their stack: they travel when the stack itself is the
 *   entitled tenant, which is what keeps a datamodel with no declarations at today's
 *   behavior exactly;
 * - classes declared only for other tenants are excluded.
 *
 * Resolved once per call, the way the sync layer resolves ephemeral classes when a
 * replication starts (ADR-0028): a declaration that changes later takes effect on the
 * next `sync()`, never silently mid-stream.
 *
 * @param stacks - The candidate stacks, typically every open stack.
 * @param entitlement - The tenant names this channel may see.
 * @returns Which stacks to serve, and per-stack class rules where needed.
 */
export const deriveTenantScope = async (
    stacks: ClientStack[],
    entitlement: string[]
): Promise<TenantScope> => {
    const entitled = new Set(entitlement.filter(t => typeof t === "string" && t.length > 0));
    const scope: TenantScope = { stacks: [], classes: {} };

    for (const stack of stacks) {
        const { list } = await stack.getClassModels();
        const admitted: string[] = [];
        const foreign: string[] = [];
        for (const model of list) {
            const declared = classTenants(model);
            if (!declared.length) continue;
            if (declared.some(t => entitled.has(t))) admitted.push(model.name);
            else foreign.push(model.name);
        }

        const stackIsTenant = entitled.has(stack.name);
        if (!stackIsTenant && !admitted.length) continue;

        scope.stacks.push(stack.name);
        if (stackIsTenant) {
            // The stack is itself an entitled tenant: everything follows it except
            // classes spoken for by tenants outside the entitlement.
            if (foreign.length) scope.classes[stack.name] = { exclude: foreign.sort() };
        } else {
            // Served only because entitled classes live here: nothing else travels.
            // `include` keeps the data-model classes automatically (class-filter.ts),
            // so the receiving end stays a readable replica.
            scope.classes[stack.name] = { include: admitted.sort() };
        }
    }

    return scope;
};
