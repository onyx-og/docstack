import { describeFilter, withFilterIdentity } from "./filter-identity.js";

/**
 * Class-level replication filtering.
 *
 * The obvious way for an application to filter a DocStack stack is by class - "sync
 * Tasks and Projects, leave Drafts on this device". Doing that correctly needs two
 * pieces of knowledge an application author has no reason to have, which is why it
 * lives here rather than in a hand-written predicate:
 *
 * 1. **An allow-list has to keep the data model.** Class models, domains, policies,
 *    users and groups are not "documents of a class the user picked" - they are what
 *    makes the replica readable at all. An `include: ["Task"]` that took the phrase
 *    literally would produce a remote holding Task documents and no Task class, which
 *    the next device could not open.
 * 2. **Relations are not classified by `~class`.** A relation document carries
 *    `~domain` plus `sourceClass`/`targetClass`, so a filter that only looks at
 *    `~class` lets every relation through - including relations pointing at documents
 *    that were filtered out, which arrive on the peer as dangling references.
 *
 * @module
 */

/**
 * Classes that describe the stack itself rather than its subject matter.
 *
 * Kept by an allow-list unless {@link ClassFilterOptions.includeDataModel} turns that
 * off. `~self` is the bootstrap class model; `patch` is here for completeness even
 * though the internal-document filter already keeps it local.
 */
export const DATA_MODEL_CLASSES: readonly string[] = [
    "class",
    "~self",
    "domain",
    "~Policy",
    "~User",
    "~Group",
    "~AuthModule",
    "~Job",
];

/**
 * Which classes replicate.
 *
 * `include` and `exclude` may be combined; `exclude` wins where they overlap. Entries
 * are matched against a document's `~class` and against a relation's
 * `sourceClass`/`targetClass`, which hold class ids - the same string for any class
 * created through `Class.create`, where the id is the name.
 *
 * @example
 * ```typescript
 * // Everything except one class.
 * { exclude: ["Draft"] }
 *
 * // Only these classes, plus the data model that makes them readable.
 * { include: ["Task", "Project"] }
 * ```
 */
export interface ClassFilterOptions {
    /** Replicate only these classes. Omit to replicate all but `exclude`. */
    include?: string[];
    /**
     * Never replicate these classes. Applied after `include`.
     *
     * This drops documents *of* those classes. The class models themselves still
     * replicate, so the remote stays a readable replica - a class model is
     * `~class: "class"`, not `~class: "<the class>"`. To keep a class model on the
     * device too, add its id to `internalDocs.extraDocIds`; a class created through
     * `Class.create` has its name as its id.
     */
    exclude?: string[];
    /**
     * Keep {@link DATA_MODEL_CLASSES} when `include` is set. Defaults to `true`; turn
     * it off only when the remote is not meant to be a readable replica.
     */
    includeDataModel?: boolean;
}

type MaybeClassedDoc = {
    _id?: string;
    "~class"?: unknown;
    "~domain"?: unknown;
    sourceClass?: unknown;
    targetClass?: unknown;
    [key: string]: unknown;
};

const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

/**
 * Reports whether a set of options would filter anything at all.
 *
 * @param options - The class filter options.
 * @returns `true` when at least one rule is present.
 */
export const hasClassRules = (options?: ClassFilterOptions): boolean =>
    Boolean(options && ((options.include && options.include.length) || (options.exclude && options.exclude.length)));

/**
 * Builds a class-level replication filter.
 *
 * PouchDB filter functions use include-semantics: `true` replicates the document. The
 * returned function is pure and carries a configuration-derived identity so that
 * changing which classes replicate also changes the replication checkpoint - see
 * {@link withFilterIdentity}.
 *
 * Documents that carry no `~class` and no `~domain` pass through untouched. That
 * matters for deletions: a tombstone is `{ _id, _rev, _deleted }` with no class on it,
 * and dropping those would mean a deletion never reaches the peer.
 *
 * @param options - Which classes to replicate.
 * @returns A predicate suitable for `replicate`'s `filter` option.
 *
 * @example
 * ```typescript
 * const filter = createClassFilter({ include: ["Task"] });
 * filter({ _id: "Task-1", "~class": "Task" });                  // true
 * filter({ _id: "Draft-1", "~class": "Draft" });                // false
 * filter({ _id: "Task", "~class": "class" });                   // true - the data model
 * filter({ _id: "r1", "~domain": "TaskDraft",
 *          sourceClass: "Task", targetClass: "Draft" });        // false - dangling end
 * ```
 */
export const createClassFilter = (
    options: ClassFilterOptions = {}
): ((doc: MaybeClassedDoc) => boolean) => {
    const include = options.include && options.include.length ? new Set(options.include) : null;
    const exclude = new Set(options.exclude || []);
    const keepDataModel = options.includeDataModel !== false;

    const allows = (className: string | undefined): boolean => {
        if (!className) return false;
        if (exclude.has(className)) return false;
        if (!include) return true;
        if (include.has(className)) return true;
        return keepDataModel && DATA_MODEL_CLASSES.includes(className);
    };

    const filter = (doc: MaybeClassedDoc) => {
        if (!doc) return false;

        // Relations are classified by their endpoints, not by `~class`.
        const domain = asString(doc["~domain"]);
        if (domain && !asString(doc["~class"])) {
            return allows(asString(doc.sourceClass)) && allows(asString(doc.targetClass));
        }

        const className = asString(doc["~class"]);
        // No class to judge by - a tombstone, or a document DocStack does not type.
        // Other rules in the chain decide; this one abstains.
        if (!className) return true;

        return allows(className);
    };

    return withFilterIdentity(filter, describeFilter("class", {
        include: options.include || [],
        exclude: options.exclude || [],
        includeDataModel: keepDataModel,
    }));
};
