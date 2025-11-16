import { isClassModel, isDocument, Stack, Domain } from "@docstack/shared";
import type {AttributeTypeReference, ClassModel, Document, DomainRelationParams, StackPluginType} from "@docstack/shared";
// import Stack from "../utils/stack";
import PouchDB from "pouchdb-browser";
import { Trigger } from "../core/trigger";
import createLogger from "../utils/logger";
import * as jsondiff from 'jsondiffpatch';
import { applySchemaDelta } from "../utils/";
import {Class} from "../core";

const logger = createLogger().child({module: "pouchdb"});
/**
 * Plugin Factory method that returns a PouchDB plugin object
 * which performs on documents (before) triggers and validation against
 * their class schema 
 * @param stack 
 * @returns 
 */
export const StackPlugin: StackPluginType = (stack: Stack) => {
    const pouchBulkDocs = PouchDB.prototype.bulkDocs;
    return {
        bulkDocs: async function (docs, options: PouchDB.Core.BulkDocsOptions & {
            isPostOp?: boolean
        } | null, callback) {
            const fnLogger = logger.child({method: "bulkDocs"});
            if (typeof options == 'function') {
                callback = options
                options = {}
            }

            // const originalFn: typeof this.bulkDocs = () => {
            //     if (callback) {
            //         return pouchBulkDocs.call(this, docs, options, callback);
            //     } else {
            //         return pouchBulkDocs.call(this, docs, options);
            //     }
            // }

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
                    console.log("Processing relation queue entry", {entry})
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

            const postOperations = async (
                error: PouchDB.Core.Error | null,
                result: (PouchDB.Core.Error | PouchDB.Core.Response)[] | null
            ) => {
                if (error) {
                    return {error, result}
                } else if (result) {
                    const docs: Document[] = []
                    for (const docRes of result) {
                        if (docRes.id) {
                            // const doc = await stack.db.get(docRes.id, { rev: (docRes as any).rev }) as Document;
                            const doc = documentsToProcess.find(d => d._id === docRes.id) as Document | undefined;
                            if (doc) {
                                const afterTriggers = triggerQueue[docRes.id]
                                if (afterTriggers && afterTriggers.length) {
                                    debugger;
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
                        const {error: rErr, result: rRes} = await recurse;
                        await flushRelationQueue();
                        return {error: rErr, result: rRes}
                    }
                }
                await flushRelationQueue();
                return {error, result}
            }

            const postExec: typeof callback = async (error, result) => {
                if (!options?.isPostOp) {
                    const {error: err, result: res} = await postOperations(error, result);
                    if (callback) callback(err, res);
                } else if (callback) {
                    callback(error, result);
                }
            }

            for (const doc of documentsToProcess) {
                if (isClassModel(doc)) {
                    // Validate against parent class
                    if (doc.type !== "~self") {
                        const parentClass = await stack.getClass(doc.type);
                        if (parentClass) {
                            fnLogger.info("Validating class model against parent class", {doc, parentClass: parentClass.name});
                            const validationResult = await parentClass.validate(doc);
                            if (!validationResult) {
                                fnLogger.error("Class model is not valid for its parent class", {doc, parentClass: parentClass.name});
                                throw new Error(`Discarded class model because model not valid for its parent class '${parentClass.name}' schema`);
                            }
                        } else {
                            fnLogger.error("Parent class not found", {doc});
                            throw new Error(`Parent class '${doc.type}' not found for class model '${doc._id}'`);
                        }
                    } else {
                        // TODO: Consider validating against self after registering the class?
                        fnLogger.info("Class model is of type '~self', skipping parent class validation", {doc});
                    }
                    
                    fnLogger.info("Document is class model, following update propagation procedure.");
                    // When a class document is updated, its change must have an effect on its children
                    const classDocId = doc._id;
                    const className = typeof doc.name === "string" ? doc.name : classDocId;
                    try {
                        // Get the previous version of the class model
                        const docWithRevs = await stack.db.get(classDocId, {revs: true});
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
                    fnLogger.info("Retrieved documents", {doc, previousClassDoc});
                    const schemaDelta = jsondiff.diff(previousClassDoc.schema, doc.schema);

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
                } else if (isDocument(doc)) {
                    const className = doc.type;

                    try {
                        const classObj = await stack.getClass(className, true);
                        if (classObj) {
                            // console.log("Validating document", {doc, className, classAttributes: classObj.getAttributes()})
                            const relationalAttrs = Object.values(classObj.getAttributes()).filter(a => {
                                console.log("Checking attribute for relation", {class: classObj.getName(),attr: a.name, type: a.model.type})
                                return a.model.type === "reference"
                            });
                            for (const attr of relationalAttrs) {
                                console.log("Validating relation for attribute", {attr, docId: doc._id})
                                const relationValue = doc[attr.name];
                                if (!relationValue) continue;
                                const domainId = (attr.model.config as AttributeTypeReference["config"]).domain;
                                const domain = await stack.getDomain(domainId);
                                if (!domain) throw new Error(`Domain not found: ${domainId}`);

                                // Validate relation constraint
                                const validation = await domain.validateRelation(doc, relationValue);
                                if (!validation.exists) {
                                    console.log("Queuing relation creation for doc", {docId: doc._id, domain: domain.name, params: validation.params})
                                    relationQueue.push({
                                        domain,
                                        params: validation.params,
                                    });
                                }
                            }
                            // TODO: skip execution of before triggers if option.isPostOp
                            const beforeTriggers = classObj.triggers.filter( t => t.order === "before");
                            const afterTriggers = classObj.triggers.filter( t => t.order === "before");

                            for (const trigger of beforeTriggers) {
                                const updatedDoc = await trigger.execute(doc);
                                Object.assign(doc, updatedDoc); // Merge changes back.
                            }

                            triggerQueue[doc._id] = [
                                ...(triggerQueue[doc._id] || []),
                                ...afterTriggers
                            ];

                            // Perform validation using the schema.
                            const validationResult = await classObj.validate(doc);
                            if (!validationResult) {
                                console.error("Document is not valid for its class schema", {doc, className});
                                throw new Error("Discarded object because object not valid for its Class schema");
                            }
                        }
                    } catch (error) {
                        return Promise.reject(error);
                    }
                }
            }            
            
            return pouchBulkDocs.call(this, docs, options, postExec);
        },

    };
};