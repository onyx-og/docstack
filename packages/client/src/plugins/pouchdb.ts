import { isClassModel, isDocument, isRelation, isPatch, Domain } from "@docstack/shared";
import type { AttributeTypeReference, ClassModel, Document, DomainRelationParams, StackPluginType } from "@docstack/shared";
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
 * their class schema 
 * @param stack 
 * @returns 
 */
export const StackPlugin: StackPluginType = (pouch: PouchDB.Static, stack: Stack) => {
    const pouchBulkDocs = stack.db ? stack.db.bulkDocs : pouch.prototype.bulkDocs;
    const pouchBulkGet = stack.db ? stack.db.bulkGet : pouch.prototype.bulkGet;
    // const pouchPut = pouch.prototype.put;
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
                return pouchBulkDocs.call(this, docs as any, options, callback);
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

            // TODO: use promise.all for concurrency
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
                        console.log("Class model is of type '~self', skipping parent class validation", { doc });
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
                    const classObj = await Class.buildFromModel(stack, previousClassDoc);
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
                        return pouchBulkDocs.call(this, docs, options, postExec);
                    }

                    const documents = await classObj.getCards();

                    if (documents.length === 0) {
                        fnLogger.info(`No documents found for class '${className}' after its update.`);
                        continue;
                        return pouchBulkDocs.call(this, docs, options, postExec);
                    }

                    const updates = await Promise.all(documents.map(async doc => {
                        const updatedDoc = await applySchemaDelta(doc, schemaDelta, classObj);
                        return updatedDoc;
                    }));

                    const result = await stack.db.bulkDocs(updates);
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

                    try {
                        let classObj: Class | null;
                        try {
                            classObj = classCache.get(className) || await stack.getClass(className, true);
                        } catch (error) {
                            throw new Error(`Class '${className}' not found for document '${doc._id}'.`);
                        }

                        if (!classObj) {
                            throw new Error(`Class '${className}' not found for document '${doc._id}'.`);
                        }

                        classCache.set(className, classObj);
                        const encryptableAttributes = classObj.getEncryptedAttributes();
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
                        return Promise.reject(error);
                    }
                }
            }

            if (!stack.cryptoEngine.isEnabled()) {
                console.log("Crypto engine not enabled, skipping encryption.");
                return await new Promise<(PouchDB.Core.Error | PouchDB.Core.Response)[]>((resolve, reject) => {
                    pouchBulkDocs.call(this, docs as any, options, async (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            await postExec(null, res).then(() => {
                                resolve(res);
                            }).catch(reject);
                        }
                    })
                });
            } else {
                console.log("Crypto engine enabled, processing encryption.");
            }

            const originalDocs = Array.isArray(docs) ? documentsToProcess : (docs as any).docs;
            const encryptedDocs = await Promise.all((originalDocs || []).map(async (doc) => {
                if (isDocument(doc)) {
                    const className = doc["~class"];
                    const classObj = classCache.get(className) || await stack.getClass(className, true);
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
                                    let classObj = classCache.get(className);
                                    if (!classObj) {
                                        classObj = await stack.getClass(className, true).catch(() => null) || undefined;
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
        /*
        get: async function (docId, options?: PouchDB.Core.GetOptions | null, callback?) {
            if (typeof options === "function") {
                callback = options;
                options = undefined;
            }

            const exec = async () => {
                const result = await pouchGet.call(this, docId, options ?? {});
                if (result && isDocument(result) && stack.cryptoEngine.isEnabled()) {
                    const classObj = await stack.getClass(result["~class"], true).catch(() => null);
                    if (classObj && classObj.getEncryptedAttributes().length) {
                        await stack.cryptoEngine.decryptDocument(result as Document, classObj);
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
        
        put: async function (doc, options?: PouchDB.Core.PutOptions | null, callback?) {
            if (typeof options === "function") {
                callback = options;
                options = undefined;
            }
            const exec = async () => {
                let payload = doc as any;
                if (isDocument(doc) && stack.cryptoEngine.isEnabled()) {
                    const classObj = await stack.getClass(doc["~class"], true).catch(() => null);
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