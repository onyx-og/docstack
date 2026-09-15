import { decryptCek } from "@docstack/abe";
import type { AccessScopeModel } from "@docstack/shared";
import type { Authority } from "../auth/authority.js";
import type { HostStack } from "../engine/stacks.js";

/** What a principal's attribute set opens on one stack. */
export interface Entitlement {
    /** Scope ids whose current version the attribute key opens. */
    scopes: string[];
    /** The attribute key minted for the set, for a replica to adopt; `null` on a node without an authority. */
    attributeKey: string | null;
}

/**
 * Decides entitlement the way a device would (spec 03 §4): mint the principal's
 * attribute key, attempt every active scope's sealed CEK with it, keep the ones that
 * open. Cached per stack, attribute set and scope-registry generation, so a rotated
 * scope or a changed attribute set recomputes; ~24 ms per scope otherwise.
 */
export class Entitlements {
    private readonly cache = new Map<string, Promise<Entitlement>>();

    constructor(private readonly authority: Authority | null) {}

    async resolve(host: HostStack, attributes: string[]): Promise<Entitlement> {
        if (!this.authority) return { scopes: [], attributeKey: null };
        const registry = await host.scopes();
        const attributeSet = [...new Set(attributes)].sort();
        const prefix = JSON.stringify([host.name, registry.generation]);
        const key = JSON.stringify([host.name, registry.generation, attributeSet]);
        let pending = this.cache.get(key);
        if (!pending) {
            pending = this.compute(registry.current, attributeSet);
            this.cache.set(key, pending);
            // One generation per stack is enough to keep; older ones only pin memory.
            for (const other of this.cache.keys()) {
                if (other.startsWith(JSON.stringify([host.name]).slice(0, -1)) && !other.startsWith(prefix.slice(0, -1))) this.cache.delete(other);
            }
        }
        return pending;
    }

    private async compute(scopes: AccessScopeModel[], attributes: string[]): Promise<Entitlement> {
        const attributeKey = await this.authority!.keygen(attributes);
        const opened: string[] = [];
        for (const scope of scopes) {
            const cek = await decryptCek(attributeKey, scope.abeWrappedCek).catch(() => null);
            if (cek) opened.push(scope.scopeId);
        }
        return { scopes: opened, attributeKey };
    }
}
