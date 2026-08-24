/**
 * Filter identity, and why a replication filter needs one.
 *
 * PouchDB derives a replication's checkpoint id from the source id, the target id and
 * `opts.filter.toString()` (`generateReplicationId` in `pouchdb-replication`). The
 * checkpoint is what "resume where we left off" means, so two replications that share
 * an id share a resume point.
 *
 * That is a problem for filters built by a factory. Every filter DocStack produces is
 * the *same closure source text* whatever options went into it, so without help they
 * would all hash to one checkpoint: switching a stack from `exclude: ["Draft"]` to
 * `exclude: ["Archive"]` would resume from the old checkpoint and never re-scan history
 * for the documents the new filter admits. They would simply be missing on the remote,
 * with no error anywhere.
 *
 * Stamping the function with a `toString` derived from its configuration makes the
 * checkpoint follow the configuration: change what you filter, and replication starts
 * again from the beginning and backfills. Keep the configuration, and it resumes.
 *
 * @module
 */

/**
 * Replaces a filter's `toString` with a stable, configuration-derived identity.
 *
 * @param filter - The filter function to stamp.
 * @param identity - A string that changes if and only if the filter's behaviour does.
 * @returns The same function, stamped.
 *
 * @example
 * ```typescript
 * const filter = withFilterIdentity(
 *     (doc) => doc["~class"] !== "Draft",
 *     describeFilter("app", { exclude: ["Draft"] })
 * );
 * String(filter); // "docstack-filter/1:app:{\"exclude\":[\"Draft\"]}"
 * ```
 */
export const withFilterIdentity = <T extends (...args: any[]) => any>(filter: T, identity: string): T => {
    Object.defineProperty(filter, "toString", {
        value: () => identity,
        configurable: true,
        writable: true,
    });
    return filter;
};

/**
 * Renders a value deterministically: object keys sorted, arrays of strings sorted.
 *
 * Order carries no meaning in any of the filter options - they are all sets of class
 * names, ids or prefixes - so sorting them means listing the same classes in a
 * different order does not invalidate a checkpoint and re-replicate a whole database.
 *
 * @param value - The value to render.
 * @returns A stable string form.
 */
const stableRender = (value: unknown): string => {
    if (Array.isArray(value)) {
        const rendered = value.map(stableRender);
        return `[${rendered.every(item => typeof item === "string") ? rendered.sort().join(",") : rendered.join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.keys(value as object)
            .sort()
            .map(key => `${key}:${stableRender((value as Record<string, unknown>)[key])}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
};

/**
 * Builds the identity string for a filter of a given kind and configuration.
 *
 * @param kind - What sort of filter this is, e.g. `"internal"` or `"class"`.
 * @param config - The options the filter was built from.
 * @returns A string suitable for {@link withFilterIdentity}.
 */
export const describeFilter = (kind: string, config: unknown): string =>
    `docstack-filter/1:${kind}:${stableRender(config)}`;

/**
 * Combines identities for a composed filter.
 *
 * @param parts - The identities of the filters being composed, in order.
 * @returns One identity covering all of them.
 */
export const composeFilterIdentity = (parts: string[]): string =>
    `docstack-filter/1:composed:[${parts.join("|")}]`;
