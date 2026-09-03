import { Document } from "@docstack/shared";
// pouchdb-find's own matcher and collation - using anything else would let overlay
// semantics drift from what the same selector means against the database.
import { matchesSelector, compare, parseField, getFieldFromDoc } from "pouchdb-selector-core";
import { TransactionStage } from "./stage.js";

/** The sort shape `findDocuments` accepts. */
export type MangoSort = { [field: string]: "asc" | "desc" }[] | string[];

/**
 * True when a query with this selector could see documents this stage holds.
 *
 * Derived from the selector's `~class` / `~domain` constraint against the stage's
 * partitions; a selector naming no class is answered conservatively. This is the
 * per-query fast path: a find over a class the transaction never touched runs
 * exactly as it would outside the transaction.
 */
export const stageCoversSelector = (stage: TransactionStage, selector: { [key: string]: any }): boolean => {
    if (stage.size === 0) return false;
    const names = [
        ...constraintNames(selector["~class"]),
        ...constraintNames(selector["~domain"]),
    ];
    if (!names.length) return true;
    return names.some(name => stage.hasPartition(name));
};

const constraintNames = (constraint: unknown): string[] => {
    if (typeof constraint === "string") return [constraint];
    if (constraint && typeof constraint === "object") {
        const eq = (constraint as any).$eq;
        if (typeof eq === "string") return [eq];
        const within = (constraint as any).$in;
        if (Array.isArray(within)) return within.filter((name): name is string => typeof name === "string");
    }
    return [];
};

/**
 * Fields the widened committed query (and the staged docs) must carry beyond the
 * caller's projection, so masking, sorting and the read pipeline can work; the
 * extras are stripped again after the merge.
 */
export const widenProjection = (fields: string[] | undefined, sort: MangoSort | undefined): { queryFields: string[] | undefined; extras: string[] } => {
    if (!fields || !fields.length) return { queryFields: undefined, extras: [] };
    const needed = new Set(["_id", "~class"]);
    for (const entry of sort ?? []) {
        needed.add(typeof entry === "string" ? entry : Object.keys(entry)[0]);
    }
    const extras = [...needed].filter(field => !fields.includes(field));
    return { queryFields: [...fields, ...extras], extras };
};

const projectDoc = (doc: Document, fields: string[]): Document => {
    const projected: any = {};
    for (const field of fields) {
        const value = getFieldFromDoc(doc, parseField(field));
        if (value !== undefined) projected[field] = value;
    }
    return projected as Document;
};

const sortComparator = (sort: MangoSort) => {
    const parts = sort.map(entry => {
        const field = typeof entry === "string" ? entry : Object.keys(entry)[0];
        const direction = typeof entry === "string" ? "asc" : (entry as any)[field];
        return { parsed: parseField(field), factor: direction === "desc" ? -1 : 1 };
    });
    return (a: Document, b: Document) => {
        for (const { parsed, factor } of parts) {
            const result = compare(getFieldFromDoc(a, parsed), getFieldFromDoc(b, parsed)) * factor;
            if (result !== 0) return result;
        }
        return 0;
    };
};

/**
 * Merges a stage into a committed query result: every staged id masks its committed
 * row (superseded and deleted alike), staged writes matching the selector join the
 * set, then sort, window and projection apply in memory - the database's index can
 * never see a staged document, so the window has to be computed after the union.
 *
 * `committedDocs` must come from a query WITHOUT skip/limit (the mask changes what
 * the window contains) and carrying `widenProjection`'s fields.
 */
export const mergeStageIntoResults = (
    stage: TransactionStage,
    selector: { [key: string]: any },
    committedDocs: Document[],
    options: { sort?: MangoSort; skip?: number; limit?: number; fields?: string[]; extras?: string[] } = {}
): Document[] => {
    const survivors = committedDocs.filter(doc => !stage.has(doc._id));

    for (const entry of stage.values()) {
        if (entry.op !== "write") continue;
        if (!matchesSelector(entry.doc, selector)) continue;
        const overlaid: any = { ...structuredClone(entry.doc) };
        if (entry.baseRev) overlaid._rev = overlaid._rev ?? entry.baseRev;
        survivors.push(
            options.fields?.length
                ? projectDoc(overlaid, [...options.fields, ...(options.extras ?? [])])
                : overlaid
        );
    }

    if (options.sort?.length) survivors.sort(sortComparator(options.sort));

    const skip = options.skip ?? 0;
    const limit = options.limit ?? survivors.length;
    const windowed = survivors.slice(skip, skip + limit);

    if (options.fields?.length && options.extras?.length) {
        return windowed.map(doc => projectDoc(doc, options.fields!));
    }
    return windowed;
};

/** A PouchDB-shaped `not_found`, so overlay reads refuse like the database does. */
export const notFoundError = (id: string) => {
    const error: any = new Error("missing");
    error.status = 404;
    error.name = "not_found";
    error.error = true;
    error.reason = "deleted";
    error.docId = id;
    return error;
};

/**
 * Read-your-writes for a point read: a staged delete is a 404, a staged write is the
 * authored plaintext (its `_rev` is the base revision - the revision the commit will
 * replace), anything else is the stack's ordinary decrypting read.
 */
export const overlayGet = async (stack: { db: any }, stage: TransactionStage, id: string, options?: any): Promise<Document> => {
    const entry = stage.get(id);
    if (entry) {
        if (entry.op === "delete") throw notFoundError(id);
        const doc: any = structuredClone(entry.doc);
        if (entry.baseRev && doc._rev === undefined) doc._rev = entry.baseRev;
        return doc as Document;
    }
    return stack.db.get(id, options ?? {});
};

/** `bulkGet` counterpart of {@link overlayGet}, preserving request order. */
export const overlayBulkGet = async (
    stack: { db: any },
    stage: TransactionStage,
    request: { docs: { id: string; rev?: string }[]; [key: string]: any }
): Promise<{ results: any[] }> => {
    const passthrough = (request.docs ?? []).filter(item => !stage.has(item.id));
    const fetched = passthrough.length
        ? await stack.db.bulkGet({ ...request, docs: passthrough })
        : { results: [] };
    const byId = new Map<string, any[]>();
    for (const result of fetched.results ?? []) {
        const list = byId.get(result.id) ?? [];
        list.push(result);
        byId.set(result.id, list);
    }
    const results = (request.docs ?? []).map(item => {
        const entry = stage.get(item.id);
        if (!entry) return byId.get(item.id)?.shift() ?? { id: item.id, docs: [{ error: notFoundError(item.id) }] };
        if (entry.op === "delete") return { id: item.id, docs: [{ error: notFoundError(item.id) }] };
        const doc: any = structuredClone(entry.doc);
        if (entry.baseRev && doc._rev === undefined) doc._rev = entry.baseRev;
        return { id: item.id, docs: [{ ok: doc }] };
    });
    return { results };
};
