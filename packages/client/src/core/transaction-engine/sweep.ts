import { Document, isClassModel, isRelation, isPatch } from "@docstack/shared";
import { StackLockedError } from "../../plugins/pouchdb.js";
import Class from "../class.js";
import type ClientStack from "../stack.js";
import { TransactionStage, StagedEntry } from "./stage.js";
import { TransactionUnsupportedDocError, TransactionValidationError } from "./errors.js";

/**
 * Resolves a class from the transaction's own stage: the ADR-0043 rule
 * (the batch outranks the store - it is what is about to be committed) applied to
 * staging. A patch chain's job can create documents of a class an earlier patch
 * staged (ADR-0044), and the sweep must judge them by that staged model, not by a
 * committed predecessor or a not-found. Built DETACHED - `Class.get` + `setModel`,
 * never `buildFromModel`, which writes rev-less models (ADR-0043).
 */
export const classFromStage = (stack: ClientStack, stage: TransactionStage, className: string): Class | null => {
    for (const entry of stage.values()) {
        const doc: any = entry.doc;
        if (entry.op !== "delete" && isClassModel(doc) && (doc._id === className || doc.name === className)) {
            const built = Class.get(
                stack, doc._id, doc.name, doc["~class"], doc.description, doc.schema, { subscribe: false }
            );
            built.setModel(doc);
            return built;
        }
    }
    return null;
};

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
export const sweepEntry = async (
    stack: ClientStack,
    stage: TransactionStage,
    entry: StagedEntry,
    options?: { allowClassModels?: boolean; skipPolicy?: boolean }
): Promise<void> => {
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
    if (isClassModel(doc)) {
        // Public transactions refuse class models: a class commit's propagation is a
        // side effect beyond the batch, and a public handle promises none (ADR-0039).
        // An INTERNAL handle - patch application, ADR-0042 - claims only staged
        // validation and a single class-write batch, so it stages them; the parent
        // validation the pipeline would run at commit runs here instead, where a
        // refusal still costs nothing.
        if (!options?.allowClassModels) {
            throw new TransactionUnsupportedDocError(
                docId,
                "a class-model write propagates to the class's documents mid-pipeline and cannot be staged or rolled back (ADR-0039)."
            );
        }
        const parentName = (doc as any)["~class"];
        if (parentName !== "~self") {
            const parentClass = await stack.getClass(parentName);
            if (!parentClass) {
                throw new TransactionValidationError(`Parent class '${parentName}' not found for class model '${docId}'.`, docId);
            }
            const valid = await parentClass.validate(doc);
            if (!valid) {
                throw new TransactionValidationError(`Class model '${docId}' is not valid for its parent class '${parentName}'.`, docId);
            }
        }
        return;
    }
    if (isPatch(doc)) {
        throw new TransactionUnsupportedDocError(docId, "patches carry class models and apply through 'applyPatch'.");
    }

    // A hard delete carries no content to validate; write access is still the
    // author's to prove - unless this is DocStack's own machinery (an internal
    // handle: patch application runs before any session exists, and the patch
    // path's direct writes never pass through policy either - ADR-0044).
    if (entry.op === "delete") {
        const type = (doc as any)["~class"];
        if (typeof type === "string" && !options?.skipPolicy) {
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

    const classObj = classFromStage(stack, stage, type)
        ?? await stack.getClassSnapshot(type).catch(() => null);
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

    if (!options?.skipPolicy) {
        await stack.policyEngine.ensureWriteAllowed(type, doc as Document);
    }
};
