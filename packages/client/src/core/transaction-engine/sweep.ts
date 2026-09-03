import { Document, isClassModel, isRelation, isPatch } from "@docstack/shared";
import { StackLockedError } from "../../plugins/pouchdb.js";
import type ClientStack from "../stack.js";
import { TransactionStage, StagedEntry } from "./stage.js";
import { TransactionUnsupportedDocError, TransactionValidationError } from "./errors.js";

/**
 * The validation sweep - the transaction's atomicity boundary in practice.
 *
 * Runs read-only checks against public stack APIs: it decides whether a document
 * *could* be written, and touches nothing. Stage time runs it so a bad write fails at
 * the call site with zero consequences; commit re-runs it so the batch is judged
 * against the world as it stands at commit. The commit-time pipeline (the plugin's
 * `bulkDocs`) remains the sole authority - this sweep is a deliberate subset, and a
 * document it passes can still be refused there, atomically for the whole batch.
 */
export const sweepEntry = async (stack: ClientStack, stage: TransactionStage, entry: StagedEntry): Promise<void> => {
    const doc = entry.doc;
    const docId = doc._id;

    if (typeof docId === "string") {
        if (docId.startsWith("_local/")) {
            throw new TransactionUnsupportedDocError(docId, "'_local/' documents are device state, not transactional content.");
        }
        if (docId.startsWith("_design/")) {
            throw new TransactionUnsupportedDocError(docId, "design documents are index machinery, not transactional content.");
        }
    }
    if (isClassModel(doc) || (doc as any)["~class"] === "class" || (doc as any)["~class"] === "~self") {
        throw new TransactionUnsupportedDocError(
            docId,
            "a class-model write propagates to the class's documents mid-pipeline and cannot be staged or rolled back (ADR-0039)."
        );
    }
    if (isPatch(doc)) {
        throw new TransactionUnsupportedDocError(docId, "patches carry class models and apply through 'applyPatch'.");
    }

    // A hard delete carries no content to validate; write access is still the
    // author's to prove.
    if (entry.op === "delete") {
        const type = (doc as any)["~class"];
        if (typeof type === "string") {
            await stack.policyEngine.ensureWriteAllowed(type, doc as Document);
        }
        return;
    }

    if (isRelation(doc)) {
        const domain = await stack.getDomain((doc as any)["~domain"]);
        if (!domain) {
            throw new TransactionValidationError(`Domain not found: ${(doc as any)["~domain"]}`, docId);
        }
        // An endpoint is resolvable if it is committed, or staged in this same
        // transaction - the batch commits together (the plugin resolves batch-mates
        // since ADR-0039).
        for (const endpoint of [(doc as any).sourceId, (doc as any).targetId]) {
            if (stage.has(endpoint) && stage.get(endpoint)!.op !== "delete") continue;
            const stored = await stack.db.get(endpoint).catch(() => null);
            if (!stored) {
                throw new TransactionValidationError(
                    `Relation endpoint '${endpoint}' does not exist, committed or staged, for domain '${domain.name}'.`,
                    docId
                );
            }
        }
        return;
    }

    const type = (doc as any)["~class"];
    if (typeof type !== "string" || !type) {
        throw new TransactionValidationError(`Document '${docId}' carries no '~class'.`, docId);
    }

    if (stack.isSimpleClass(type)) return;

    const classObj = await stack.getClassSnapshot(type).catch(() => null);
    if (!classObj) {
        throw new TransactionValidationError(`Class '${type}' not found for document '${docId}'.`, docId);
    }

    // Same refusal the plugin makes (ADR-0018): a locked stack cannot encrypt, and
    // committing later while still locked would land the fields in the clear.
    if (classObj.getEncryptedAttributes().length && stack.isLocked()) {
        throw new StackLockedError(type);
    }

    const valid = await classObj.validate(doc);
    if (!valid) {
        throw new TransactionValidationError(
            `Document '${docId}' does not validate against class '${type}'.`,
            docId
        );
    }

    await stack.policyEngine.ensureWriteAllowed(type, doc as Document);
};
