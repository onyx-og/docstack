import { Document } from "@docstack/shared";
import { readNewEdits } from "../../plugins/pouchdb.js";
import type ClientStack from "../stack.js";
import { TransactionStage, StagedEntry } from "./stage.js";
import { sweepEntry } from "./sweep.js";
import { overlayGet, overlayBulkGet, mergeStageIntoResults, widenProjection, notFoundError, MangoSort } from "./overlay.js";
import { TransactionStateError } from "./errors.js";
import type { TransactionEngine, TransactionCommitReport } from "./index.js";

export type TransactionStatus = "open" | "committed" | "discarded" | "partial";

const conflictError = (id: string) => {
    const error: any = new Error("Document update conflict");
    error.status = 409;
    error.name = "conflict";
    error.error = true;
    error.docId = id;
    return error;
};

/**
 * One transaction: a private write journal plus a read view that overlays it on
 * committed state (ADR-0039).
 *
 * Writes through the handle are validated at the call site (the sweep - failing
 * stages nothing) and stage in memory; nothing reaches the database until
 * {@link commit}, which flushes the journal as one batch through the stack's full
 * authoring pipeline. Reads through the handle see the journal; `stack.db`, other
 * handles, replication and live subscriptions see only committed state.
 *
 * @example
 * ```typescript
 * const t = stack.beginTransaction();
 * await t.createDoc(null, "Task", { title: "write-up" });
 * await t.db.put({ ...(await t.db.get("Task-77")), done: true });
 * const drafted = await t.findDocuments({ "~class": { $eq: "Task" } });
 * const report = await t.commit();   // or stack.commit(t)
 * ```
 */
export class TransactionHandle {
    readonly id: string;
    /** @internal */
    readonly stage = new TransactionStage();
    /** @internal - ids this handle minted, counted into the id counter after commit. */
    readonly mintedIds = new Set<string>();

    private statusValue: TransactionStatus = "open";
    private readonly stack: ClientStack;
    private readonly engine: TransactionEngine;

    /** The db-like surface: staged writes, overlaid reads. */
    readonly db: TransactionDb;

    /** @internal */
    constructor(stack: ClientStack, engine: TransactionEngine, id: string) {
        this.stack = stack;
        this.engine = engine;
        this.id = id;
        this.db = new TransactionDb(stack, this);
    }

    get status(): TransactionStatus {
        return this.statusValue;
    }

    /** @internal */
    setStatus(status: TransactionStatus) {
        this.statusValue = status;
    }

    stagedCount(): number {
        return this.stage.size;
    }

    /** @internal */
    assertWritable(operation: string) {
        if (this.statusValue !== "open" && this.statusValue !== "partial") {
            throw new TransactionStateError(this.id, this.statusValue, operation);
        }
    }

    /**
     * Stages a write. The sweep runs first: a document that fails validation, policy,
     * or the locked-stack check is not staged and the journal is untouched.
     * @internal
     */
    async stageWrite(doc: Document, op: "write" | "delete" = "write"): Promise<StagedEntry> {
        this.assertWritable("accept writes");
        const docId = (doc as any)._id;
        if (typeof docId !== "string" || !docId) {
            throw new Error("A staged document needs an '_id' - transactions do not mint ids implicitly; use createDoc(null, ...).");
        }

        const already = this.stage.get(docId);
        let baseRev: string | undefined;
        let isNew: boolean;
        if (already) {
            baseRev = already.baseRev;
            isNew = already.isNew;
        } else {
            baseRev = await this.stack.getDocRevision(docId).catch(() => undefined) || undefined;
            isNew = baseRev === undefined;
        }

        // PouchDB's optimistic-concurrency contract, kept: updating requires stating
        // the revision being replaced - here, the overlay-visible one.
        const statedRev = (doc as any)._rev;
        if (!isNew && statedRev !== baseRev) throw conflictError(docId);
        if (isNew && statedRev !== undefined) throw conflictError(docId);

        const entry: StagedEntry = {
            doc: structuredClone({ ...doc, _rev: undefined }) as Document,
            baseRev,
            op,
            isNew,
            stagedAt: Date.now(),
        };
        delete (entry.doc as any)._rev;
        await sweepEntry(this.stack, this.stage, entry);
        this.stage.set(docId, entry);
        return this.stage.get(docId)!;
    }

    /**
     * Creates or updates a document in the transaction - `stack.createDoc`'s UX with
     * a staged destination: `docId: null` mints an id, an existing id merges params
     * over the overlay-visible document.
     */
    async createDoc(docId: string | null, type: string, params: { [key: string]: any }): Promise<Document> {
        this.assertWritable("create documents");
        let base: Document | null = null;
        if (docId) {
            base = await overlayGet(this.stack, this.stage, docId).catch(() => null) as Document | null;
            if (base && (base as any)["~class"] !== type) {
                throw new Error(`Existing document '${docId}' is a '${(base as any)["~class"]}', not a '${type}'.`);
            }
        } else {
            docId = this.stack.generateDocId(type);
            this.mintedIds.add(docId);
        }
        const draft: any = base
            ? { ...base, ...params, _id: docId, "~updateTimestamp": new Date().getTime() }
            : { ...this.stack.prepareDoc(docId, type, params as any, "~class"), ...params, _id: docId };
        const entry = await this.stageWrite(draft as Document, "write").catch(error => {
            // An id minted for a write that never staged is simply dropped - the
            // counter only ever advances for committed documents.
            if (!base && docId) this.mintedIds.delete(docId);
            throw error;
        });
        return structuredClone(entry.doc);
    }

    /** Batch counterpart of {@link createDoc}; validated sequentially, fail-fast. */
    async createDocs(docs: { docId: string | null; params: { [key: string]: any } }[], type: string): Promise<Document[]> {
        const created: Document[] = [];
        for (const draft of docs) {
            created.push(await this.createDoc(draft.docId, type, draft.params));
        }
        return created;
    }

    /** Soft-deletes in the transaction: the overlay stops showing the document under the default `active: true`. */
    async deleteDocument(docId: string): Promise<boolean> {
        this.assertWritable("delete documents");
        const doc: any = await overlayGet(this.stack, this.stage, docId).catch(() => null);
        if (!doc) return false;
        await this.stageWrite({ ...doc, active: false, _rev: this.stage.get(docId)?.baseRev ?? doc._rev } as Document, "write");
        return true;
    }

    /** The stack's polished read, against this transaction's view. */
    async findDocuments<T extends Document = Document>(
        selector: { [key: string]: any },
        fields?: string[],
        skip?: number,
        limit?: number,
        sort?: MangoSort
    ) {
        this.assertWritable("read");
        return this.stack.findDocumentsForView<T>(this.stage, selector, fields, skip, limit, sort as any);
    }

    /**
     * SQL against this transaction's view. The executor reaches data only through
     * stack APIs, so a facade routes them at the overlay; LIMIT/OFFSET pushdown and
     * sort indexes are disabled while staged - staged documents exist in no index,
     * so windows and orderings must be computed after the merge.
     */
    async query(sql: string, ...params: any[]) {
        this.assertWritable("query");
        const stack = this.stack;
        const stage = this.stage;
        const handle = this;
        const facade: any = Object.create(stack);
        facade.findDocuments = (selector: any, fields?: string[], skip?: number, limit?: number, sort?: any) =>
            stack.findDocumentsForView(stage, selector, fields, skip, limit, sort);
        facade.findDocumentsIterator = async function* (selector: any, options: { fields?: string[] } = {}) {
            const result = await facade.findDocuments(selector, options.fields);
            for (const doc of result.docs) yield doc;
        };
        facade.canApplyQueryLimitEarly = async () => false;
        facade.ensureSortIndex = async () => false;
        facade.getClass = async (name: string, ...rest: any[]) => {
            const real = await stack.getClass(name, ...rest);
            if (!real) return real;
            const wrapped = Object.create(real);
            // `getCards` is an own arrow property bound to the real stack; shadowed so
            // the executor's fetches route through the overlay.
            wrapped.getCards = (selector?: any, fields?: string[], skip?: number, limit?: number, sort?: any) =>
                facade.findDocuments({ ...(selector || {}), "~class": { $eq: (real as any).name } }, fields, skip, limit, sort)
                    .then((result: any) => result.docs);
            return wrapped;
        };
        void handle;
        return stack.runQuery(sql, params, facade);
    }

    /** Flushes the journal - sugar for `stack.commit(t)`. */
    commit(): Promise<TransactionCommitReport> {
        return this.engine.commit(this);
    }

    /** Drops the journal - sugar for `stack.discardTransaction(t)`. */
    discard(): void {
        this.engine.discard(this);
    }
}

/**
 * The handle's db-like surface. Writes stage; reads overlay. Not a Proxy over the
 * guarded db on purpose: this object *has no* adapter methods or escape hatches to
 * forward, so staging cannot become a fourth door around the authoring path.
 */
export class TransactionDb {
    private readonly stack: ClientStack;
    private readonly handle: TransactionHandle;

    /** @internal */
    constructor(stack: ClientStack, handle: TransactionHandle) {
        this.stack = stack;
        this.handle = handle;
    }

    async get(docId: string, options?: any): Promise<Document> {
        this.handle.assertWritable("read");
        return overlayGet(this.stack, this.handle.stage, docId, options);
    }

    async bulkGet(request: { docs: { id: string; rev?: string }[] }): Promise<{ results: any[] }> {
        this.handle.assertWritable("read");
        return overlayBulkGet(this.stack, this.handle.stage, request);
    }

    /**
     * Raw-style Mango find over the transaction's view. Like `stack.db.find`, this
     * skips the read pipeline (no policy filter, no decryption of committed rows);
     * `findDocuments` on the handle is the polished read.
     */
    async find(query: { selector: { [key: string]: any }; fields?: string[]; skip?: number; limit?: number; sort?: any }): Promise<{ docs: Document[] }> {
        this.handle.assertWritable("read");
        const stage = this.handle.stage;
        const { selector, fields, skip, limit, sort } = query;
        const { queryFields, extras } = widenProjection(fields, sort);
        const committed = await this.stack.db.find({
            selector,
            ...(queryFields ? { fields: queryFields } : {}),
            limit: 2 ** 31 - 1,
        });
        const docs = mergeStageIntoResults(stage, selector, committed.docs as unknown as Document[], { sort, skip, limit, fields, extras });
        return { docs };
    }

    async put(doc: Document, options?: any): Promise<{ ok: true; id: string; rev?: string; staged: true }> {
        if (options && (options.new_edits === false || options.force)) {
            throw new Error("Writing with 'new_edits: false' or 'force' is reserved for DocStack's sync layer, in and out of transactions.");
        }
        const entry = await this.handle.stageWrite(doc, "write");
        return { ok: true, id: (doc as any)._id, rev: entry.baseRev, staged: true };
    }

    async post(doc: Document): Promise<{ ok: true; id: string; rev?: string; staged: true }> {
        const type = (doc as any)["~class"] ?? (doc as any)["~domain"];
        if (typeof type !== "string" || !type) {
            throw new Error("post needs '~class' (or '~domain') to mint an id for the document.");
        }
        const id = this.stack.generateDocId(type);
        this.handle.mintedIds.add(id);
        const entry = await this.handle.stageWrite({ ...doc, _id: id } as Document, "write").catch(error => {
            this.handle.mintedIds.delete(id);
            throw error;
        });
        return { ok: true, id, rev: entry.baseRev, staged: true };
    }

    /** Hard removal, staged: the commit writes `_deleted: true`. Soft deletion is `handle.deleteDocument`. */
    async remove(doc: { _id: string; _rev?: string } | string, rev?: string): Promise<{ ok: true; id: string; staged: true }> {
        const id = typeof doc === "string" ? doc : doc._id;
        const statedRev = typeof doc === "string" ? rev : doc._rev;
        const current: any = await overlayGet(this.stack, this.handle.stage, id).catch(() => { throw notFoundError(id); });
        await this.handle.stageWrite({ ...current, _id: id, _rev: statedRev ?? current._rev } as Document, "delete");
        return { ok: true, id, staged: true };
    }

    /**
     * Stages a batch. Validated sequentially - the first refusal unwinds every entry
     * this call staged, so a failing batch stages nothing. Documents stage before
     * relations, mirroring the commit batch, so a relation and its endpoint can
     * arrive in one array in any order.
     */
    async bulkDocs(docs: Document[] | { docs: Document[] }, options?: any): Promise<{ ok: true; id: string; staged: true }[]> {
        const list = Array.isArray(docs) ? docs : docs?.docs;
        if (!Array.isArray(list)) throw new Error("bulkDocs expects an array of documents or { docs: [...] }.");
        if (readNewEdits(docs, options ?? null) === false || options?.force) {
            throw new Error("Writing with 'new_edits: false' or 'force' is reserved for DocStack's sync layer, in and out of transactions.");
        }
        this.handle.assertWritable("accept writes");

        const stage = this.handle.stage;
        const before = new Map<string, StagedEntry | undefined>();
        const ordered = [
            ...list.filter(doc => typeof (doc as any)["~domain"] !== "string"),
            ...list.filter(doc => typeof (doc as any)["~domain"] === "string"),
        ];
        try {
            const results: { ok: true; id: string; staged: true }[] = [];
            for (const doc of ordered) {
                const id = (doc as any)._id;
                if (typeof id === "string" && !before.has(id)) before.set(id, stage.get(id));
                await this.handle.stageWrite(doc as Document, "write");
                results.push({ ok: true, id, staged: true });
            }
            return results;
        } catch (error) {
            // Unwind this call's staging so a failed batch has no consequences at all.
            for (const [id, previous] of before) {
                if (previous) stage.set(id, previous);
                else stage.remove(id);
            }
            throw error;
        }
    }
}
