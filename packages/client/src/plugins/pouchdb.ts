import { isClassModel, isDocument, isRelation, isPatch, Domain } from "@docstack/shared";
import type { AttributeTypeReference, ClassModel, Document, DomainRelationParams, PristineDbMethods, StackPluginType } from "@docstack/shared";
// import Stack from "../utils/stack";
import Stack from "../core/stack.js"
import PouchDB from "pouchdb-browser";
import { Trigger } from "../core/trigger/index.js";
import createLogger from "../utils/logger/index.js";
import {diff} from 'jsondiffpatch';
import { applySchemaDelta } from "../utils/index.js";
import Class from "../core/class.js";

const logger = createLogger().child({ module: "pouchdb" });

/**
 * Raised when a locked stack is asked to write a class carrying encrypted attributes.
 *
 * A stack is locked when encryption is enabled but no document key has been supplied.
 * Writing then would store the encrypted fields as plaintext, so the write is refused.
 *
 * @example
 * ```typescript
 * try {
 *     await secretClass.addCard({ ssn: "..." });
 * } catch (error) {
 *     error instanceof StackLockedError; // true - call stack.unlock(key) first
 * }
 * ```
 */
export class StackLockedError extends Error {
    override name = "StackLockedError";
    /** The class the refused document belongs to. */
    readonly className: string;

    constructor(className: string) {
        super(
            `Stack is locked: '${className}' has encrypted attributes and no document key has been supplied, ` +
            `so writing it would store those fields in the clear. Call 'stack.unlock(documentKey)' first.`
        );
        this.className = className;
    }
}

/**
 * Resolves the effective `new_edits` flag for a `bulkDocs` call.
 *
 * `pouchdb-core` accepts it either on the request body or on the options object and
 * normalizes the two before handing over to the adapter. {@link StackPlugin} replaces
 * `bulkDocs` outright, so it never sees that normalization and has to repeat it -
 * reading only `options.new_edits` misses every write `pouchdb-replication` makes.
 *
 * @param docs - The `bulkDocs` request: an array of documents or a `{ docs }` envelope.
 * @param options - The `bulkDocs` options object, possibly `null`.
 * @returns The resolved flag; `true` when neither side carries one.
 */
export const readNewEdits = (
    docs: unknown,
    options?: (PouchDB.Core.BulkDocsOptions & { new_edits?: boolean }) | null
): boolean => {
    if (options && typeof options === "object" && "new_edits" in options) {
        return (options as { new_edits?: boolean }).new_edits !== false;
    }
    if (docs && !Array.isArray(docs) && typeof docs === "object" && "new_edits" in docs) {
        return (docs as { new_edits?: boolean }).new_edits !== false;
    }
    return true;
};

/**
 * Plugin Factory method that returns a PouchDB plugin object
 * which performs on documents (before) triggers and validation against
 * their class schema.
 *
 * @param pouch - The PouchDB constructor, for adapter-level lookups.
 * @param stack - The stack the wrapped database belongs to.
 * @param pristine - The database's own `bulkDocs`/`bulkGet`, captured before this plugin
 * replaced them. Handed in rather than looked up, because both places it could be looked
 * up are wrong - see {@link StackPluginType} and ADR-0019.
 */
export const StackPlugin: StackPluginType = (pouch: PouchDB.Static, stack: Stack, pristine: PristineDbMethods) => {
    const pouchBulkDocs = pristine.bulkDocs;
    const pouchBulkGet = pristine.bulkGet;
    // Captured from the pristine instance like the two above, and for the same
    // ADR-0019 reason - `pouch.prototype.get` is not a reliable source under the
    // plugin-loading shim (it resolves undefined in the UMD build), which is exactly
    // what got the decrypting `get` override commented out instead of recaptured.
    const pouchGet = pristine.get;
    return {
        ping: () => {
            return Promise.resolve("pong");
        },
        bulkDocs: async function (docs, options: PouchDB.Core.BulkDocsOptions & {
            isPostOp?: boolean
        } | null, callback) {
            const fnLogger = logger.child({ method: "bulkDocs" });
            if (typeof options == 'function') {
                callback = options
                options = {}
            }

            // `new_edits: false` means the caller already owns the revisions it is
            // writing - replication is the one that always does. Those documents must
            // land verbatim: re-running the authoring path over them validates them
            // against a schema the writing device may not have yet, rejects relation
            // documents whose endpoints happen to arrive later in the stream (batches
            // carry no dependency order), and lets after-triggers mint a fresh
            // revision in the middle of a `new_edits: false` write.
            //
            // The flag reaches `bulkDocs` in two places: `pouchdb-replication` puts it
            // in the request body (`bulkDocs({ docs, new_edits: false })`), other
            // callers put it in `options`. Only `pouchdb-core` normalizes between the
            // two, and this method replaces it, so the normalization happens here.
            if (readNewEdits(docs, options) === false) {
                fnLogger.info("new_edits is false, storing documents verbatim");
                // Replication lands class models and policies too; the stack's derived
                // caches must not outlive them.
                const verbatimDocs: unknown[] = Array.isArray(docs) ? docs : (docs as any).docs;
                if (callback) {
                    const cb = callback as (err: unknown, res?: unknown) => void;
                    return pouchBulkDocs.call(this, docs as any, options, (err, res) => {
                        if (!err) stack.invalidateWriteCaches(verbatimDocs);
                        cb(err, res);
                    });
                }
                const result = await pouchBulkDocs.call(this, docs as any, options);
                stack.invalidateWriteCaches(verbatimDocs);
                return result;
            }

            let documentsToProcess: typeof docs;
            if (Array.isArray(docs)) {
                documentsToProcess = docs;
            } else {
                documentsToProcess = (docs as any).docs;
            }

            const relationQueue: { domain: Domain; params: DomainRelationParams; }[] = [];

            const flushRelationQueue = async () => {
                if (!relationQueue.length) return;
                const grouped = new Map<string, { domain: Domain; drafts: { docId: string | null; params: DomainRelationParams; }[] }>();
                while (relationQueue.length) {
                    const entry = relationQueue.shift();
                    if (!entry) continue;
                    const key = entry.domain.name;
                    if (!grouped.has(key)) {
                        grouped.set(key, { domain: entry.domain, drafts: [] });
                    }
                    grouped.get(key)!.drafts.push({ docId: null, params: entry.params });
                }
                for (const { domain, drafts } of grouped.values()) {
                    await stack.createRelationDocs(drafts, domain.name, domain);
                }
            };

            const triggerQueue: Record<string, Trigger[]> = Object.create(null);
            const classCache = new Map<string, Class>();

            const postOperations = async (
                error: PouchDB.Core.Error | null,
                result: (PouchDB.Core.Error | PouchDB.Core.Response)[] | null
            ) => {
                if (error) {
                    return { error, result }
                } else if (result) {
                    const docs: Document[] = []
                    for (const docRes of result) {
                        if (docRes.id) {
                            // const doc = await stack.db.get(docRes.id, { rev: (docRes as any).rev }) as Document;
                            const doc = documentsToProcess.find(d => d._id === docRes.id) as unknown as Document | undefined;
                            if (doc) {
                                const updatedRev = (docRes as any).rev;
                                if (updatedRev) {
                                    doc._rev = updatedRev;
                                }
                                const afterTriggers = triggerQueue[docRes.id]
                                if (afterTriggers && afterTriggers.length) {
                                    for (const afterTrigger of afterTriggers) {
                                        const updatedDoc = await afterTrigger.execute(doc);
                                        Object.assign(doc, updatedDoc);
                                    }
                                    docs.push(doc);
                                }
                            }
                        }
                    }
                    if (docs.length) {
                        const recurse: Promise<{
                            error: PouchDB.Core.Error | null,
                            result: (PouchDB.Core.Error | PouchDB.Core.Response)[] | null
                        }> = new Promise((resolve, reject) => {
                            (this.bulkDocs as any).apply(this, [docs, {
                                isPostOp: true
                            }, (rErr: typeof error, rRes: typeof result) => resolve({
                                error: rErr,
                                result: rRes
                            })])
                        })
                        const { error: rErr, result: rRes } = await recurse;
                        await flushRelationQueue();
                        return { error: rErr, result: rRes }
                    }
                }
                await flushRelationQueue();
                return { error, result }
            }

            const postExec = async (error, result) => {
                if (!options?.isPostOp) {
                    const { error: err, result: res } = await postOperations(error, result);
                    if (callback) callback(err, res);
                } else if (callback) {
                    callback(error, result);
                }
            }

            /**
             * Reports a refused write in whichever style the caller asked in.
             *
             * `put`, `post` and `remove` all reach this plugin through PouchDB's callback
             * form, and a callback caller is never watching the returned promise: rejecting
             * it there settles nothing, the callback never fires, and the write hangs
             * forever instead of failing. Only a caller that invoked `bulkDocs` directly
             * gets a promise back.
             */
            const fail = (error: unknown) => {
                if (callback) {
                    (callback as (err: unknown) => void)(error);
                    return undefined;
                }
                return Promise.reject(error);
            };

            // TODO: use promise.all for concurrency
            try {
            for (const doc of documentsToProcess) {
                if (isClassModel(doc)) {
                    // Validate against parent class
                    if (doc["~class"] !== "~self") {
                        const parentClass = await stack.getClass(doc["~class"]);
                        if (parentClass) {
                            fnLogger.info("Validating class model against parent class", { doc, parentClass: parentClass.name });
                            const validationResult = await parentClass.validate(doc);
                            if (!validationResult) {
                                fnLogger.error("Class model is not valid for its parent class", { doc, parentClass: parentClass.name });
                                throw new Error(`Discarded class model because model not valid for its parent class '${parentClass.name}' schema`);
                            }
                        } else {
                            fnLogger.error("Parent class not found", { doc });
                            throw new Error(`Parent class '${doc["~class"]}' not found for class model '${doc._id}'`);
                        }
                    } else {
                        // TODO: Consider validating against self after registering the class?
                        fnLogger.info("Class model is of type '~self', skipping parent class validation", { doc });
                    }
                    fnLogger.info("Document is class model, following update propagation procedure.");
                    // When a class document is updated, its change must have an effect on its children
                    const classDocId = doc._id;
                    const className = typeof doc.name === "string" ? doc.name : classDocId;
                    try {
                        // Get the previous version of the class model
                        const docWithRevs = await stack.db.get(classDocId, { revs: true });
                        const revisionIDList = docWithRevs._revisions!.ids;
                        if (revisionIDList.length == 1) {
                            fnLogger.info(`Class '${className}' (doc '${classDocId}') was just created. Nothing to do.`);
                            continue;
                            return pouchBulkDocs.call(this, docs, options, postExec);
                        }
                    } catch (e: any) {
                        if (e.name === 'not_found') {
                            fnLogger.info(`Class '${className}' (doc '${classDocId}') was just created. Nothing to do.`);
                            continue;
                            return pouchBulkDocs.call(this, docs, options, postExec);
                        }
                    }
                    // Fetch the current (next old) version of the class document.
                    const previousClassDoc = await stack.db.get<ClassModel>(classDocId);
                    // Built rather than looked up: this is the class as it was *before*
                    // this write, which the cache does not hold. Detached, because all it
                    // is used for is diffing and applying the delta.
                    const classObj = await Class.buildFromModel(stack, previousClassDoc, { subscribe: false });
                    // const classObj = await stack.getClass(className, true);
                    // if (classObj == null) {
                    //     throw new Error(`Unexpected, can't retrieve class '${className}' (doc '${classDocId}')`);
                    // }
                    // const previousClassDoc = classObj.model;
                    fnLogger.info("Retrieved documents", { doc, previousClassDoc });
                    const schemaDelta = diff(previousClassDoc.schema, doc.schema);

                    if (!schemaDelta) {
                        fnLogger.info(`Class '${className}' has no changes on schema.`);
                        continue;
                    }

                    const documents = await classObj.getCards();

                    if (documents.length === 0) {
                        fnLogger.info(`No documents found for class '${className}' after its update.`);
                        continue;
                    }

                    const updates = await Promise.all(documents.map(async doc => {
                        const updatedDoc = await applySchemaDelta(doc, schemaDelta, classObj);
                        return updatedDoc;
                    }));

                    await stack.db.bulkDocs(updates);
                    fnLogger.info('Propagated updates');
                } else if (isRelation(doc)) {
                    const domain = await stack.getDomain(doc["~domain"]);
                    if (!domain) {
                        throw new Error(`Domain not found: ${doc["~domain"]}`);
                    }
                    if (doc.sourceClass !== domain.sourceClass.id || doc.targetClass !== domain.targetClass.id) {
                        throw new Error(`Relation document classes do not match domain '${domain.name}'.`);
                    }

                    const [sourceDoc, targetDoc] = await Promise.all([
                        stack.db.get<Document>(doc.sourceId).catch(() => null),
                        stack.db.get<Document>(doc.targetId).catch(() => null),
                    ]);

                    if (!sourceDoc) {
                        throw new Error(`Source document '${doc.sourceId}' does not exist for domain '${domain.name}'.`);
                    }

                    if (!targetDoc) {
                        throw new Error(`Target document '${doc.targetId}' does not exist for domain '${domain.name}'.`);
                    }

                    continue;
                } else if (isPatch(doc)) {
                    // Patches are not validated or processed, just stored
                    continue;
                } else if (isDocument(doc)) {
                    const className = doc["~class"];

                    // A simple class stores documents as given. Everything below is
                    // schema-derived - validation, triggers, relation checks, the
                    // encrypted-attribute test - so there is nothing here to do, and the
                    // `getClassSnapshot` on the next line is a database round trip per
                    // document that would buy none of it. Answered from a set held on the
                    // stack precisely so this decision costs nothing. See ADR-0028.
                    if (stack.isSimpleClass(className)) continue;

                    try {
                        let classObj: Class | null;
                        try {
                            classObj = classCache.get(className) || await stack.getClassSnapshot(className);
                        } catch (error) {
                            throw new Error(`Class '${className}' not found for document '${doc._id}'.`);
                        }

                        if (!classObj) {
                            throw new Error(`Class '${className}' not found for document '${doc._id}'.`);
                        }

                        classCache.set(className, classObj);
                        const encryptableAttributes = classObj.getEncryptedAttributes();
                        // A locked stack has no key, so encrypting is impossible and the
                        // fields would land in the clear. Refuse instead of degrading:
                        // silent plaintext is the failure mode ADR-0018 exists to remove.
                        // Bootstrap patches are the documented exception - the seed system
                        // user has to exist before any key can be recovered, and
                        // `rekeyBootstrapDocuments` encrypts it once one arrives.
                        if (encryptableAttributes.length && stack.isLocked() && !(options as any)?.isPatch) {
                            throw new StackLockedError(className);
                        }
                        if (stack.cryptoEngine.isEnabled() && encryptableAttributes.length) {
                            await stack.cryptoEngine.decryptDocument(doc as Document, classObj);
                        }

                        if (!options?.isPostOp) {
                            const relationalAttrs = Object.values(classObj.getAttributes()).filter(a => {
                                if (classObj.getName().startsWith("Account-")) {
                                    // console.log("Checking attribute for relation", { class: classObj.getName(), attr: a.name, type: a.model.type })
                                }
                                return a.model.type === "reference"
                            });
                            for (const attr of relationalAttrs) {
                                const relationValue = doc[attr.name];
                                if (!relationValue) continue;
                                const domainId = (attr.model.config as AttributeTypeReference["config"]).domain;
                                const domain = await stack.getDomain(domainId);
                                if (!domain) throw new Error(`Domain not found: ${domainId}`);

                                // Validate relation constraint
                                const validation = await domain.validateRelation(doc, relationValue);
                                if (!validation.exists) {
                                    // console.log("Queuing relation creation for doc", {docId: doc._id, domain: domain.name, params: validation.params})
                                    relationQueue.push({
                                        domain,
                                        params: validation.params,
                                    });
                                }
                            }
                        }
                        const beforeTriggers = classObj.triggers.filter(t => t.order === "before");
                        const afterTriggers = classObj.triggers.filter(t => t.order === "after");

                        if (!options?.isPostOp) {
                            for (const trigger of beforeTriggers) {
                                const updatedDoc = await trigger.execute(doc);
                                Object.assign(doc, updatedDoc); // Merge changes back.
                            }
                        }

                        triggerQueue[doc._id] = [
                            ...(triggerQueue[doc._id] || []),
                            ...afterTriggers
                        ];

                        // Perform validation using the schema.
                        const validationResult = await classObj.validate(doc);
                        if (!validationResult) {
                            fnLogger.error("Validation failed for document", { id: doc._id, className, doc });
                            throw new Error(`Discarded document ${JSON.stringify(doc)} because object not valid for its Class schema: ${JSON.stringify(classObj.buildSchema())}`);
                        }
                    } catch (error) {
                        return fail(error);
                    }
                }
            }
            } catch (error) {
                // Branches other than `isDocument` throw directly - a class model failing
                // its parent's schema, a relation naming a domain that does not exist.
                // They need the same callback-aware answer.
                return fail(error);
            }

            if (!stack.cryptoEngine.isEnabled()) {
                fnLogger.debug("Crypto engine not enabled, skipping encryption.");
                return await new Promise<(PouchDB.Core.Error | PouchDB.Core.Response)[]>((resolve, reject) => {
                    pouchBulkDocs.call(this, docs as any, options, async (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            // Before after-triggers run: they read back through the
                            // caches and must see what this batch just wrote.
                            stack.invalidateWriteCaches(documentsToProcess as unknown[]);
                            await postExec(null, res).then(() => {
                                resolve(res);
                            }).catch(reject);
                        }
                    })
                });
            } else {
                // console.log("Crypto engine enabled, processing encryption.");
            }

            const originalDocs = Array.isArray(docs) ? documentsToProcess : (docs as any).docs;
            const encryptedDocs = await Promise.all((originalDocs || []).map(async (doc) => {
                if (isDocument(doc)) {
                    const className = doc["~class"];
                    // No schema, so no attribute can be marked encrypted.
                    if (stack.isSimpleClass(className)) return doc;
                    const classObj = classCache.get(className) || await stack.getClassSnapshot(className);
                    if (classObj) {
                        const encryptableAttributes = classObj.getEncryptedAttributes();
                        if (!stack.cryptoEngine.isEnabled() || !encryptableAttributes.length) {
                            return doc;
                        }
                        classCache.set(className, classObj);
                        const clone = { ...doc } as Document;
                        await stack.cryptoEngine.encryptDocument(clone, classObj);
                        return clone;
                    }
                }
                return doc;
            }));

            const payload = Array.isArray(docs)
                ? encryptedDocs
                : { ...(docs as any), docs: encryptedDocs };

            return await new Promise<(PouchDB.Core.Error | PouchDB.Core.Response)[]>((resolve, reject) => {
                pouchBulkDocs.call(this, payload as any, options, async (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        // Before after-triggers run: they read back through the caches
                        // and must see what this batch just wrote.
                        stack.invalidateWriteCaches(documentsToProcess as unknown[]);
                        await postExec(null, res).then(() => {
                            resolve(res);
                        }).catch(reject);
                    }
                })
            });
        },

        bulkGet: async function (options: PouchDB.Core.BulkGetOptions, callback?) {
            if (typeof options === "function") {
                callback = options;
                options = {
                    docs: []
                };
            }

            const exec = async () => {
                const result = await pouchBulkGet.call(this, options ?? {});
                if (result && result.results && stack.cryptoEngine.isEnabled()) {
                    const classCache = new Map<string, Class>();
                    for (const row of result.results) {
                        for (const docResult of row.docs) {
                            if ('ok' in docResult) {
                                const doc = docResult.ok as Document;
                                if (isDocument(doc)) {
                                    const className = doc["~class"];
                                    if (stack.isSimpleClass(className)) continue;
                                    let classObj = classCache.get(className);
                                    if (!classObj) {
                                        classObj = await stack.getClassSnapshot(className).catch(() => null) || undefined;
                                        if (classObj) classCache.set(className, classObj);
                                    }
                                    if (classObj && classObj.getEncryptedAttributes().length) {
                                        await stack.cryptoEngine.decryptDocument(doc, classObj);
                                    }
                                }
                            }
                        }
                    }
                }
                return result;
            };

            if (callback) {
                exec().then((res) => callback(null, res)).catch((err) => callback(err, null));
                return;
            }
            return exec();
        },
        // Single-document reads decrypt, symmetrically with `bulkGet`, `find` and the
        // query engine: ADR-0020 keeps ciphertext on the *changes feed*, never on
        // reads. This override spent a while commented out - disabled by a comment
        // that rode an unrelated refactor commit, with no decision recorded - which
        // left `stack.getDocument` returning ciphertext while every other read path
        // decrypted. Re-enabled with a cheaper precheck: the cached class model
        // answers "does this class encrypt anything?" first, so a class with nothing
        // encrypted pays a cache lookup here rather than a class snapshot per get.
        // See ADR-0032.
        get: async function (docId: PouchDB.Core.DocumentId, options?: PouchDB.Core.GetOptions | null, callback?: any) {
            if (typeof options === "function") {
                callback = options;
                options = undefined;
            }

            const exec = async () => {
                const result = await pouchGet.call(this, docId, options ?? {});
                // Optional-chained on purpose: this override serves `initialize` itself
                // (`checkSystem` reads `~system` through it), which runs before the
                // crypto engine is constructed. And gated on the *key*, not just the
                // engine: without a document key `decryptDocument` can do nothing, so a
                // keyless stack - initialization, a locked stack, every stack that never
                // encrypts - skips the branch and pays nothing per get. Only a keyed
                // stack reading an encrypted class pays the class lookup and decrypt.
                if (result && isDocument(result) && stack.cryptoEngine?.isEnabled()
                    && stack.cryptoEngine.getDocumentKey()
                    && !stack.isSimpleClass(result["~class"])) {
                    const model = await stack.getClassModel(result["~class"]).catch(() => null);
                    const encrypts = model && Object.values(model.schema ?? {})
                        .some((attribute: any) => attribute?.config?.encrypted === true);
                    if (encrypts) {
                        const classObj = await stack.getClassSnapshot(result["~class"]).catch(() => null);
                        if (classObj && classObj.getEncryptedAttributes().length) {
                            await stack.cryptoEngine.decryptDocument(result as Document, classObj);
                        }
                    }
                }
                return result;
            };

            if (callback) {
                exec().then((res) => callback(null, res)).catch((err) => callback(err, undefined));
                return;
            }
            return exec();
        },

        /*
        Deliberately retired, not lost: pouchdb-core routes `put` through `bulkDocs`,
        and the active `bulkDocs` above already owns encryption - a put override that
        encrypted too would encrypt twice. Kept for the record beside the `get`
        override's history. See ADR-0032.

        put: async function (doc, options?: PouchDB.Core.PutOptions | null, callback?) {
            if (typeof options === "function") {
                callback = options;
                options = undefined;
            }
            const exec = async () => {
                let payload = doc as any;
                if (isDocument(doc) && stack.cryptoEngine.isEnabled()
                    && !stack.isSimpleClass(doc["~class"])) {
                    const classObj = await stack.getClassSnapshot(doc["~class"]).catch(() => null);
                    if (classObj && classObj.getEncryptedAttributes().length) {
                        payload = { ...doc } as Document;
                        await stack.cryptoEngine.encryptDocument(payload as Document, classObj);
                    }
                }
                return pouchPut.call(this, payload, options ?? {});
            };

            if (callback) {
                exec().then((res) => callback(null, res)).catch((err) => callback(err));
                return;
            }
            return exec();
        },
        */

    };
};