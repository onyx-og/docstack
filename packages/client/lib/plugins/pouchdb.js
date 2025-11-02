import { isClassModel, isDocument } from "@docstack/shared";
// import Stack from "../utils/stack";
import PouchDB from "pouchdb-browser";
import createLogger from "../utils/logger";
import * as jsondiff from 'jsondiffpatch';
import { applySchemaDelta } from "../utils/";
const logger = createLogger().child({ module: "pouchdb" });
/**
 * Plugin Factory method that returns a PouchDB plugin object
 * which performs on documents (before) triggers and validation against
 * their class schema
 * @param stack
 * @returns
 */
export const StackPlugin = (stack) => {
    const pouchBulkDocs = PouchDB.prototype.bulkDocs;
    return {
        bulkDocs: async function (docs, options, callback) {
            const fnLogger = logger.child({ method: "bulkDocs" });
            if (typeof options == 'function') {
                callback = options;
                options = {};
            }
            // const originalFn: typeof this.bulkDocs = () => {
            //     if (callback) {
            //         return pouchBulkDocs.call(this, docs, options, callback);
            //     } else {
            //         return pouchBulkDocs.call(this, docs, options);
            //     }
            // }
            let documentsToProcess;
            if (Array.isArray(docs)) {
                documentsToProcess = docs;
            }
            else {
                documentsToProcess = docs.docs;
            }
            const relationQueue = [];
            const triggerQueue = Object.create(null);
            const postOperations = async (error, result) => {
                if (error) {
                    return { error, result };
                }
                else if (result) {
                    const docs = [];
                    for (const docRes of result) {
                        if (docRes.id) {
                            // const doc = await stack.db.get(docRes.id, { rev: (docRes as any).rev }) as Document;
                            const doc = documentsToProcess.find(d => d._id === docRes.id);
                            if (doc) {
                                const afterTriggers = triggerQueue[docRes.id];
                                if (afterTriggers) {
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
                        const recurse = new Promise((resolve, reject) => {
                            this.bulkDocs.apply(this, [docs, {
                                    isPostOp: true
                                }, (rErr, rRes) => resolve({
                                    error: rErr,
                                    result: rRes
                                })]);
                        });
                        const { error: rErr, result: rRes } = await recurse;
                        return { error: rErr, result: rRes };
                    }
                }
                return { error, result };
            };
            const postExec = async (error, result) => {
                if (!(options === null || options === void 0 ? void 0 : options.isPostOp)) {
                    const { error: err, result: res } = await postOperations(error, result);
                    if (callback)
                        callback(err, res);
                }
                else if (callback) {
                    callback(error, result);
                }
            };
            for (const doc of documentsToProcess) {
                if (isClassModel(doc)) {
                    fnLogger.info("Document is class model, following update propagation procedure.");
                    // When a class document is updated, its change must have an effect on its children
                    const className = doc._id;
                    try {
                        // Get the previous version of the class model
                        const docWithRevs = await stack.db.get(className, { revs: true });
                        const revisionIDList = docWithRevs._revisions.ids;
                        if (revisionIDList.length == 1) {
                            fnLogger.info(`Class '${className}' was just created. Nothing to do.`);
                            return pouchBulkDocs.call(this, docs, options, postExec);
                        }
                    }
                    catch (e) {
                        if (e.name === 'not_found') {
                            return pouchBulkDocs.call(this, docs, options, postExec);
                        }
                    }
                    // Fetch the current (next old) version of the class document.
                    const classObj = await stack.getClass(className, true);
                    if (classObj == null) {
                        throw new Error(`Unexpected, can't retrieve class '${className}'`);
                    }
                    const previousClassDoc = classObj.model;
                    fnLogger.info("Retrieved documents", { doc, previousClassDoc });
                    const schemaDelta = jsondiff.diff(previousClassDoc.schema, doc.schema);
                    if (!schemaDelta) {
                        fnLogger.info(`Class '${className}' has no changes on schema.`);
                        return pouchBulkDocs.call(this, docs, options, postExec);
                    }
                    const documents = await classObj.getCards();
                    if (documents.length === 0) {
                        fnLogger.info(`No documents found for class '${className}' after its update.`);
                        return pouchBulkDocs.call(this, docs, options, postExec);
                    }
                    const updates = await Promise.all(documents.map(async (doc) => {
                        const updatedDoc = await applySchemaDelta(doc, schemaDelta, classObj);
                        return updatedDoc;
                    }));
                    const result = await stack.db.bulkDocs(updates);
                    fnLogger.info('Propagated updates');
                }
                else if (isDocument(doc)) {
                    const className = doc.type;
                    try {
                        const classObj = await stack.getClass(className);
                        if (classObj) {
                            const relationalAttrs = Object.values(classObj.getAttributes()).filter(a => a.model.type === "relation");
                            for (const attr of relationalAttrs) {
                                const relationValue = doc[attr.name];
                                if (!relationValue)
                                    continue;
                                const domainId = attr.model.config.domain;
                                const domain = await stack.getDomain(domainId);
                                if (!domain)
                                    throw new Error(`Domain not found: ${domainId}`);
                                // Validate relation constraint
                                const isValid = await domain.validateRelation(doc, relationValue);
                                if (!isValid) {
                                    throw new Error(`Invalid relation for ${attr.name} on ${doc._id}`);
                                }
                                // Queue relation creation
                                relationQueue.push({
                                    domainId: domain.id,
                                    sourceId: doc._id,
                                    targetId: relationValue,
                                    type: domain.relation
                                });
                            }
                            // TODO: skip execution of before triggers if option.isPostOp
                            const beforeTriggers = classObj.triggers.filter(t => t.order === "before");
                            const afterTriggers = classObj.triggers.filter(t => t.order === "before");
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
                                throw new Error("Discarded object because object not valid for its Class schema");
                            }
                        }
                    }
                    catch (error) {
                        return Promise.reject(error);
                    }
                }
            }
            return pouchBulkDocs.call(this, docs, options, postExec);
        },
    };
};
//# sourceMappingURL=pouchdb.js.map