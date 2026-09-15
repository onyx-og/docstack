import type { Grant, Principal, StackGrant } from "../types.js";
import type { ServerConfig } from "../config/schema.js";

/** A grant with every stack pattern compiled once. */
export interface CompiledGrant {
    grant: Grant;
    /** What `keygen` sees for this principal. */
    attributes: string[];
    /** The grant for one stack, by exact name first and then by template pattern; `null` when unreachable. */
    stackFor(name: string): StackGrant | null;
}

const patternToRegExp = (pattern: string): RegExp =>
    new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/**
 * Runs the configured `grant(principal)` and compiles the result: exact stack names
 * first, then template patterns (`user-*`) in declaration order. A stack the grant
 * does not name is unreachable, which the routes answer with 404 (spec 03 §5).
 */
export const resolveGrant = async (config: ServerConfig, principal: Principal): Promise<CompiledGrant> => {
    const grant = await config.grant(principal);
    const stacks = grant?.stacks ?? {};
    const patterns = Object.entries(stacks)
        .filter(([name]) => name.includes("*"))
        .map(([name, stackGrant]) => ({ test: patternToRegExp(name), stackGrant }));
    return {
        grant: { ...grant, stacks },
        attributes: grant?.attributes ?? principal.attributes,
        stackFor: (name) => {
            if (!name.includes("*") && Object.prototype.hasOwnProperty.call(stacks, name)) return stacks[name];
            const match = patterns.find((entry) => entry.test.test(name));
            return match ? match.stackGrant : null;
        },
    };
};
