import { Document } from "@docstack/shared";

/** What one staged entry means for its document id. */
export type StagedOp = "write" | "delete";

export interface StagedEntry {
    /** The authored document, plaintext, cloned at stage time. */
    doc: Document;
    /** The winning revision the entry was staged against; absent for a new document. */
    baseRev?: string;
    op: StagedOp;
    /** True when the id did not exist (in stage or store) when first staged. */
    isNew: boolean;
    stagedAt: number;
}

/**
 * The write journal of one transaction: authored documents keyed by id, in memory.
 *
 * Also partitioned by class (`~class`, or `~domain` for relations) so a read can ask
 * "could this stage affect a query over class X" in O(1) - the overlay only pays the
 * merge for queries whose class the transaction actually touched (ADR-0039).
 */
export class TransactionStage {
    private entries = new Map<string, StagedEntry>();
    private partitions = new Map<string, Set<string>>();

    private partitionKeys(doc: Document): string[] {
        const keys: string[] = [];
        const className = (doc as any)["~class"];
        const domainName = (doc as any)["~domain"];
        if (typeof className === "string") keys.push(className);
        if (typeof domainName === "string") keys.push(domainName);
        return keys;
    }

    /**
     * Stages an entry. Re-staging an id replaces the document but keeps the original
     * `baseRev` and `isNew` - the conflict check is against the world as it was when
     * the transaction first touched the id, not against its own previous draft.
     */
    set(id: string, entry: StagedEntry) {
        const existing = this.entries.get(id);
        if (existing) {
            for (const key of this.partitionKeys(existing.doc)) {
                this.partitions.get(key)?.delete(id);
            }
            entry = { ...entry, baseRev: existing.baseRev, isNew: existing.isNew };
        }
        this.entries.set(id, entry);
        for (const key of this.partitionKeys(entry.doc)) {
            let ids = this.partitions.get(key);
            if (!ids) this.partitions.set(key, (ids = new Set()));
            ids.add(id);
        }
    }

    get(id: string): StagedEntry | undefined {
        return this.entries.get(id);
    }

    has(id: string): boolean {
        return this.entries.has(id);
    }

    get size(): number {
        return this.entries.size;
    }

    ids(): string[] {
        return [...this.entries.keys()];
    }

    /** Entries in stage order (insertion order of first staging). */
    values(): StagedEntry[] {
        return [...this.entries.values()];
    }

    hasPartition(name: string): boolean {
        return (this.partitions.get(name)?.size ?? 0) > 0;
    }

    /** Keeps only the given ids - what a partial commit leaves behind. */
    retain(ids: Set<string>) {
        for (const id of [...this.entries.keys()]) {
            if (!ids.has(id)) this.remove(id);
        }
    }

    /**
     * A point-in-time copy of the journal, for {@link restore}. Used by the patch
     * chain (ADR-0044) to unwind exactly one patch's staging - a pre-apply job's
     * writes included - when a locked refusal converts that patch to a deferral
     * while the already-staged prefix goes on to commit.
     */
    snapshot(): Map<string, StagedEntry> {
        return new Map(this.entries);
    }

    restore(snapshot: Map<string, StagedEntry>) {
        this.clear();
        for (const [id, entry] of snapshot) {
            this.set(id, entry);
        }
    }

    remove(id: string) {
        const entry = this.entries.get(id);
        if (!entry) return;
        for (const key of this.partitionKeys(entry.doc)) {
            this.partitions.get(key)?.delete(id);
        }
        this.entries.delete(id);
    }

    clear() {
        this.entries.clear();
        this.partitions.clear();
    }
}
