import { Document, RelationDocument } from "@docstack/shared";

/**
 * Moving a stack's *content* between databases, without its datamodel.
 *
 * `stack.dump()` is the other kind of export: every document exactly as stored, which
 * means class models, patches, users, sessions, policies, design documents - and
 * encrypted attributes as unreadable {@link EncryptedPayload} blobs. That is a debugging
 * tool and a backup of one database.
 *
 * This is the portable one. It carries the documents an application put in, in the clear,
 * so that {@link ClientStack.importContent} can place them into a *different* stack -
 * different device, different key, schema built by that stack's own patches.
 *
 * @module
 */

/** The envelope format identifier, so an importer can refuse what it does not understand. */
export const CONTENT_EXPORT_FORMAT = "docstack/content-export@1";

/**
 * `~class` values that describe the stack rather than hold its content.
 *
 * `~self` is the bootstrap class-of-classes; `class` and `superclass` are class models;
 * `domain` is a relation definition; `patch` is the local ledger of applied patches.
 */
export const META_CLASSES: readonly string[] = ["~self", "class", "superclass", "domain", "patch"];

/**
 * Reports whether a class name belongs to application content.
 *
 * DocStack names everything it owns with a leading `~` - `~User`, `~Group`, `~Policy`,
 * `~Job`, `~JobRun`, `~UserSession`, `~AuthModule`, `~lock` - and reserves the handful of
 * unprefixed names in {@link META_CLASSES} for the datamodel itself. Everything else was
 * created by an application.
 *
 * @param className - A `~class` value or class-model id.
 *
 * @example
 * ```typescript
 * isContentClassName("Task");   // true
 * isContentClassName("~User");  // false - DocStack's own
 * isContentClassName("class");  // false - a class model
 * ```
 */
export const isContentClassName = (className: unknown): className is string => {
    if (typeof className !== "string" || !className.length) return false;
    if (className.startsWith("~")) return false;
    return !META_CLASSES.includes(className);
};

/** The shape the predicates need. */
type MaybeDoc = { _id?: unknown; "~class"?: unknown; "~domain"?: unknown; active?: unknown };

/**
 * Reports whether a document is application content rather than part of the stack.
 *
 * @param doc - Any stored document.
 */
export const isContentDocument = (doc: MaybeDoc | null | undefined): boolean => {
    if (!doc || typeof doc._id !== "string") return false;
    // A design document has no `~class` and would fall through the class test.
    if (doc._id.startsWith("_")) return false;
    return isContentClassName(doc["~class"]);
};

/**
 * Reports whether a document is an application relation.
 *
 * Relations carry `~domain` and no `~class` (see `isRelation` in `@docstack/shared`), so
 * they need their own test rather than falling out of {@link isContentDocument}.
 *
 * @param doc - Any stored document.
 */
export const isContentRelation = (doc: MaybeDoc | null | undefined): boolean => {
    if (!doc || typeof doc._id !== "string") return false;
    if (doc["~class"] !== undefined) return false;
    return isContentClassName(doc["~domain"]);
};

/** Fields PouchDB owns, or that describe one database's copy of a document. */
const TRANSIENT_FIELDS = ["_rev", "_revisions", "_revs_info", "_conflicts", "_deleted"] as const;

/**
 * Strips the fields that belong to the source database rather than to the document.
 *
 * `_rev` above all: a revision from one database means nothing in another, and carrying
 * it into an import turns every write into a conflict.
 *
 * @param doc - The document to clean.
 * @returns A copy without the transient fields.
 */
export const stripTransientFields = <T extends object>(doc: T): T => {
    const clone = { ...doc } as Record<string, unknown>;
    for (const field of TRANSIENT_FIELDS) delete clone[field];
    return clone as T;
};

/**
 * A stack's content, portable to another stack.
 *
 * **The documents are plaintext.** Encrypted attributes are decrypted on the way out so
 * that a stack holding a different document key can read them; the file is therefore as
 * sensitive as the data it holds, and protecting it is the caller's job.
 */
export interface ContentExport {
    /** Always {@link CONTENT_EXPORT_FORMAT}. */
    format: string;
    /** ISO-8601, when the export was taken. */
    exportedAt: string;
    /** Where it came from. Advisory - an import does not require a match. */
    source: {
        stack: string;
        appVersion: string;
        schemaVersion?: string;
    };
    /** Class names present in {@link documents}, so an import can report gaps up front. */
    classes: string[];
    /** Domain names present in {@link relations}. */
    domains: string[];
    /** Content documents, decrypted, without `_rev`. */
    documents: Document[];
    /** Relation documents, ordered after the documents they connect. */
    relations: RelationDocument[];
}

/** Controls what {@link ClientStack.exportContent} collects. */
export interface ContentExportOptions {
    /** Restrict to these class names. Defaults to every content class in the stack. */
    classes?: string[];
    /** Restrict to these domain names. Defaults to every content domain. */
    domains?: string[];
    /** Include relation documents. Defaults to `true`. */
    includeRelations?: boolean;
    /**
     * Include soft-deleted documents (`active: false`). Defaults to `false` - an export
     * is the live content, not the tombstones.
     */
    includeInactive?: boolean;
    /**
     * Export encrypted attributes as `null` instead of refusing when the stack is locked.
     * Defaults to `false`.
     *
     * A locked stack cannot decrypt, so those attributes read back as `null` and an export
     * taken that way is lossy in a way nothing downstream can detect. Refusing is the safe
     * default; this is the escape hatch for a caller that genuinely wants the rest.
     */
    allowLossyWhenLocked?: boolean;
}

/** What an import did, per category. */
export interface ContentImportReport {
    documents: { written: number; skipped: number };
    relations: { written: number; skipped: number };
    /** Everything that did not go in cleanly, with the reason. */
    issues: ContentImportIssue[];
}

/** One document that could not be imported, or that was changed on the way in. */
export interface ContentImportIssue {
    docId: string;
    kind: "missing-class" | "missing-domain" | "unknown-attribute" | "conflict" | "rejected";
    detail: string;
}

/** Controls how {@link ClientStack.importContent} reconciles against the datamodel. */
export interface ContentImportOptions {
    /**
     * What to do with a document whose class this stack does not have.
     * `"skip"` (default) records an issue and carries on; `"fail"` throws.
     *
     * Creating the class is deliberately not offered: the export carries no schema, so
     * DocStack would have to infer one from the data and would get it wrong. Apply the
     * patch that defines the class first.
     */
    onMissingClass?: "skip" | "fail";
    /**
     * What to do with an attribute the target class does not define.
     * `"strip"` (default) drops it and records an issue; `"fail"` throws; `"keep"` passes
     * it through to schema validation, which will reject it.
     */
    onUnknownAttribute?: "strip" | "fail" | "keep";
    /**
     * Replace a document that already exists. Defaults to `false`, which records a
     * conflict and leaves the stored document alone.
     */
    overwrite?: boolean;
}

/**
 * Validates an import payload's envelope before anything is written.
 *
 * A plain validator rather than an `asserts` signature: the caller already types its
 * parameter, so there is nothing to narrow, and an assertion function reached through an
 * import needs a declaration TypeScript can see (TS2775).
 *
 * @param payload - The value handed to {@link ClientStack.importContent}.
 * @throws Error when it is not a content export this version understands.
 */
export const assertContentExport = (payload: unknown): void => {
    const value = payload as Partial<ContentExport> | null;
    if (!value || typeof value !== "object") {
        throw new Error("importContent - payload is not a content export.");
    }
    if (value.format !== CONTENT_EXPORT_FORMAT) {
        throw new Error(
            `importContent - unsupported format '${String(value.format)}'. ` +
            `This build reads '${CONTENT_EXPORT_FORMAT}'.`
        );
    }
    if (!Array.isArray(value.documents) || !Array.isArray(value.relations)) {
        throw new Error("importContent - payload is missing its 'documents' or 'relations' array.");
    }
};
