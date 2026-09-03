import { Document } from "@docstack/shared";
import type ClientStack from "../stack.js";
import { TransactionHandle } from "./handle.js";
import { sweepEntry } from "./sweep.js";
import { TransactionsDisabledError, TransactionStateError, TransactionConflictError } from "./errors.js";
import createLogger from "../../utils/logger/index.js";

export { TransactionHandle, TransactionDb } from "./handle.js";
export type { TransactionStatus } from "./handle.js";
export { TransactionStage } from "./stage.js";
export type { StagedEntry, StagedOp } from "./stage.js";
export { stageCoversSelector, mergeStageIntoResults, widenProjection } from "./overlay.js";
export {
    TransactionsDisabledError,
    TransactionStateError,
    TransactionValidationError,
    TransactionConflictError,
    TransactionUnsupportedDocError,
} from "./errors.js";

const logger = createLogger().child({ module: "TransactionEngine" });

/** What one commit did, and on what guarantee. */
export type TransactionCommitReport = {
    transactionId: string;
    /** Documents that landed, with their new revisions. */
    written: { id: string; rev: string }[];
    /** Documents that did not - possible only on adapters where `atomicBatch` is false. */
    failed: { id: string; error: string; name?: string }[];
    /** Journal size at the moment commit ran. */
    stagedCount: number;
    durationMs: number;
    /**
     * The storage adapter's honest guarantee for this commit: `atomicBatch: true`
     * means the batch landed (or failed) as one storage transaction; `false` means
     * per-document results, mitigated by the rev pre-flight but not eliminated.
     */
    adapter: { name: string; atomicBatch: boolean };
};

/**
 * Which adapters commit one `bulkDocs` batch as a single storage transaction.
 * tauri-sqlite composes the whole batch into one `BEGIN IMMEDIATE … COMMIT`;
 * IndexedDB and the bridge/channel adapters report per document. Reported to
 * consumers on every commit rather than silently assumed (ADR-0039).
 */
const ADAPTER_ATOMICITY: { [adapterName: string]: boolean } = {
    "tauri-sqlite": true,
};

const now = () => (globalThis.performance?.now() ?? Date.now());

/**
 * Named write transactions for one stack (ADR-0039).
 *
 * Enabled per stack by `transactions: true` in its configuration - the flag only
 * unlocks {@link begin}; direct writes stay immediate, and the framework's own
 * writers (scheduler, jobs, sync) always write directly. The stage lives above the
 * plugin: nothing a transaction does touches the database until commit, and commit
 * is exactly one `stack.db.bulkDocs` through the full authoring pipeline.
 */
export class TransactionEngine {
    private readonly stack: ClientStack;
    private readonly enabled: boolean;
    private readonly handles = new Map<string, TransactionHandle>();
    /** Commits serialize here so one commit's rev pre-flight cannot be invalidated by another's write. */
    private commitChain: Promise<unknown> = Promise.resolve();

    constructor(stack: ClientStack, enabled: boolean) {
        this.stack = stack;
        this.enabled = enabled;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    /** How many transactions are currently open (or partial). */
    openCount(): number {
        return this.handles.size;
    }

    begin(): TransactionHandle {
        if (!this.enabled) throw new TransactionsDisabledError(this.stack.name ?? "");
        const id = `tx-${this.stack.cryptoEngine.generateRandomString(8)}`;
        const handle = new TransactionHandle(this.stack, this, id);
        this.handles.set(id, handle);
        return handle;
    }

    private resolve(t: TransactionHandle | string, operation: string): TransactionHandle {
        const handle = typeof t === "string" ? this.handles.get(t) : t;
        if (!handle) throw new TransactionStateError(typeof t === "string" ? t : "(unknown)", "unknown", operation);
        return handle;
    }

    /**
     * Drops a transaction's journal. Idempotent, and a no-op on a handle already in
     * a terminal state - discarding what is already gone is not an error.
     */
    discard(t: TransactionHandle | string): void {
        const handle = this.resolve(t, "be discarded");
        if (handle.status === "discarded" || handle.status === "committed") return;
        handle.stage.clear();
        handle.setStatus("discarded");
        this.handles.delete(handle.id);
        this.stack.dispatchEvent(new CustomEvent("transactionDiscard", { detail: { transactionId: handle.id } }));
    }

    /** Discards every open transaction - what `close()` and `reset()` do. */
    discardAll(): void {
        for (const handle of [...this.handles.values()]) this.discard(handle);
    }

    /**
     * Flushes a transaction's journal as one batch through the stack's authoring
     * pipeline. Refusals - validation, or a staged document whose base revision
     * moved - throw with nothing persisted and the transaction still open.
     */
    commit(t: TransactionHandle | string): Promise<TransactionCommitReport> {
        const handle = this.resolve(t, "commit");
        const run = () => this.commitNow(handle);
        const chained = this.commitChain.then(run, run);
        // The chain must survive a refused commit; the caller still sees the rejection.
        this.commitChain = chained.catch(() => undefined);
        return chained;
    }

    private async commitNow(handle: TransactionHandle): Promise<TransactionCommitReport> {
        const started = now();
        if (handle.status !== "open" && handle.status !== "partial") {
            throw new TransactionStateError(handle.id, handle.status, "commit");
        }
        const stage = handle.stage;
        const entries = stage.values();
        const stagedCount = entries.length;

        const report: TransactionCommitReport = {
            transactionId: handle.id,
            written: [],
            failed: [],
            stagedCount,
            durationMs: 0,
            adapter: this.adapterInfo(),
        };

        if (!stagedCount) {
            handle.setStatus("committed");
            this.handles.delete(handle.id);
            report.durationMs = now() - started;
            return report;
        }

        // 1. The sweep again, against the world as it stands now - stage-time answers
        //    can be stale (a policy changed, a class tightened). Zero consequences on
        //    refusal.
        for (const entry of entries) {
            await sweepEntry(this.stack, stage, entry);
        }

        // 2. Rev pre-flight: every staged id's stored winner must still be the
        //    revision it was staged against. `allDocs` is below the plugin - revs
        //    only, no decrypt cost.
        const ids = stage.ids();
        const stored = await (this.stack.db as any).allDocs({ keys: ids });
        const currentRevs = new Map<string, string | undefined>();
        for (const row of stored.rows ?? []) {
            const id = row.key ?? row.id;
            currentRevs.set(id, row.value && !row.value.deleted ? row.value.rev : undefined);
        }
        const conflicts: { id: string; baseRev: string | undefined; currentRev: string | undefined }[] = [];
        for (const id of ids) {
            const entry = stage.get(id)!;
            const current = currentRevs.get(id);
            const expected = entry.isNew ? undefined : entry.baseRev;
            if (current !== expected) conflicts.push({ id, baseRev: entry.baseRev, currentRev: current });
        }
        if (conflicts.length) throw new TransactionConflictError(conflicts);

        // 3. One batch: stage order, documents before relations so endpoint checks
        //    can resolve batch-mates.
        const toBatchDoc = (id: string) => {
            const entry = stage.get(id)!;
            const doc: any = structuredClone(entry.doc);
            if (entry.baseRev) doc._rev = entry.baseRev;
            else delete doc._rev;
            if (entry.op === "delete") doc._deleted = true;
            return doc as Document;
        };
        const batchIds = [
            ...ids.filter(id => typeof (stage.get(id)!.doc as any)["~domain"] !== "string"),
            ...ids.filter(id => typeof (stage.get(id)!.doc as any)["~domain"] === "string"),
        ];
        const batch = batchIds.map(toBatchDoc);

        // 4. The full authoring pipeline, unchanged: triggers, relation checks,
        //    encryption, and the single adapter write. A pipeline refusal rejects the
        //    whole call before anything is written.
        const response = await (this.stack.db as any).bulkDocs(batch) as any[];

        const failedIds = new Set<string>();
        for (let index = 0; index < response.length; index++) {
            const result = response[index];
            const id = result?.id ?? batchIds[index];
            if (result && result.ok) {
                report.written.push({ id, rev: result.rev });
            } else {
                failedIds.add(id);
                report.failed.push({
                    id,
                    error: result?.message ?? result?.reason ?? String(result?.name ?? "write failed"),
                    name: result?.name,
                });
            }
        }

        // 5. The id counter advances only for minted ids that actually landed -
        //    uniqueness is the promise, not density (as in createDocs).
        const mintedWritten = report.written.filter(entry => handle.mintedIds.has(entry.id)).length;
        if (mintedWritten > 0) {
            await this.stack.advanceLastDocId(mintedWritten);
        }

        if (failedIds.size === 0) {
            stage.clear();
            handle.setStatus("committed");
            this.handles.delete(handle.id);
        } else {
            // Possible only on adapters without an atomic batch (or a write racing
            // the pre-flight window). Failed entries keep their base revisions: a
            // straggler that simply didn't land retries cleanly, and one that was
            // raced surfaces as a conflict on the next commit instead of being
            // silently overwritten.
            stage.retain(failedIds);
            handle.setStatus("partial");
            logger.warn("Transaction committed partially", { transactionId: handle.id, failed: report.failed });
        }

        report.durationMs = now() - started;
        this.stack.dispatchEvent(new CustomEvent("transactionCommit", { detail: report }));
        return report;
    }

    private adapterInfo(): { name: string; atomicBatch: boolean } {
        const name = String((this.stack as any).rawDb?.adapter ?? "unknown");
        const atomicBatch = ADAPTER_ATOMICITY[name] === true;
        if (!(name in ADAPTER_ATOMICITY) && name !== "idb" && name !== "indexeddb") {
            logger.warn("Unknown adapter for transaction atomicity - reporting atomicBatch: false", { adapter: name });
        }
        return { name, atomicBatch };
    }
}
