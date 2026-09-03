/**
 * Errors of the transaction engine (ADR-0039).
 *
 * Every one of them leaves the database untouched: a transaction failure is a refusal,
 * never a partial application. The one exception is named where it happens -
 * a commit on a non-atomic adapter can land a subset, and that outcome is reported as
 * a `partial` status on the handle, not thrown as one of these.
 *
 * @module
 */

/** Raised by `beginTransaction()` on a stack opened without `transactions: true`. */
export class TransactionsDisabledError extends Error {
    override name = "TransactionsDisabledError";
    constructor(stackName: string) {
        super(
            `Stack '${stackName}' was opened without 'transactions: true'. ` +
            `Transactions are enabled per stack through its configuration, like encryption.`
        );
    }
}

/** Raised when a handle is used in a state that cannot accept the operation. */
export class TransactionStateError extends Error {
    override name = "TransactionStateError";
    constructor(transactionId: string, status: string, operation: string) {
        super(`Transaction '${transactionId}' is '${status}' and cannot ${operation}.`);
    }
}

/**
 * Raised when the validation sweep refuses a document - at stage time (the write is
 * not staged) or at commit time (nothing is written, the transaction stays open).
 */
export class TransactionValidationError extends Error {
    override name = "TransactionValidationError";
    /** The document that failed. */
    readonly docId: string | undefined;
    constructor(message: string, docId?: string) {
        super(message);
        this.docId = docId;
    }
}

/**
 * Raised by commit when a staged document's base revision no longer matches the
 * stored winner - a direct write, another transaction's commit, or replication moved
 * it. Nothing is written; the transaction stays open for re-staging or discard.
 */
export class TransactionConflictError extends Error {
    override name = "TransactionConflictError";
    readonly conflicts: { id: string; baseRev: string | undefined; currentRev: string | undefined }[];
    constructor(conflicts: { id: string; baseRev: string | undefined; currentRev: string | undefined }[]) {
        super(
            `Commit refused: ${conflicts.length} staged document(s) changed underneath the transaction: ` +
            conflicts.map(conflict => conflict.id).join(", ")
        );
        this.conflicts = conflicts;
    }
}

/**
 * Raised at stage time for documents transactions cannot carry: class models (their
 * write propagates to other documents mid-pipeline and cannot be staged or rolled
 * back - ADR-0039), `_local/` device state, and design documents.
 */
export class TransactionUnsupportedDocError extends Error {
    override name = "TransactionUnsupportedDocError";
    constructor(docId: string, reason: string) {
        super(`Document '${docId}' cannot be staged: ${reason}`);
    }
}
