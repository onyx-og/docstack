import { isClassModel, isDocument, Stack } from "@docstack/shared";
import type {ClassModel, StackPluginType} from "@docstack/shared";
// import Stack from "../utils/stack";
import PouchDB from "pouchdb-browser";
import { Trigger } from "../core/trigger";
import createLogger from "../utils/logger";
import * as jsondiff from 'jsondiffpatch';
import { applySchemaDelta } from "../utils/";

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
        bulkDocs: async function (docs, options, callback) {
            const fnLogger = logger.child({method: "bulkDocs"});
            if (typeof options == 'function') {
                callback = options
                options = {}
            }

            const originalFn = () => {
                if (callback) {
                    return pouchBulkDocs.call(this, docs, options, callback);
                } else {
                    return pouchBulkDocs.call(this, docs, options);
                }
            }

            let documentsToProcess: typeof docs;
            if (Array.isArray(docs)) {
                documentsToProcess = docs;
            } else {
                documentsToProcess = (docs as any).docs;
            }

            for (const doc of documentsToProcess) {
                if (isClassModel(doc)) {
                    debugger;
                    fnLogger.info("Document is class model, following update propagation procedure.");
                    // When a class document is updated, its change must have an effect on its children
                    const className = doc._id;
                    try {
                        // Get the previous version of the class model
                        const docWithRevs = await stack.db.get(className, {revs: true});
                        const revisionIDList = docWithRevs._revisions!.ids;
                        if (revisionIDList.length == 1) {
                            fnLogger.info(`Class '${className}' was just created. Nothing to do.`);
                            return originalFn();
                        }
                    } catch (e: any) {
                        if (e.name === 'not_found') {
                            return originalFn();
                        }
                    }
                    // Fetch the current (next old) version of the class document.
                    const classObj = await stack.getClass(className, true);
                    if (classObj == null) {
                        throw new Error(`Unexpected, can't retrieve class '${className}'`);
                    }
                    const previousClassDoc = classObj.model;
                    fnLogger.info("Retrieved documents", {doc, previousClassDoc});
                    const schemaDelta = jsondiff.diff(previousClassDoc.schema, doc.schema);

                    if (!schemaDelta) {
                        fnLogger.info(`Class '${className}' has no changes on schema.`)
                        return originalFn();
                    }

                    const documents = await classObj.getCards();

                    if (documents.length === 0) {
                        fnLogger.info(`No documents found for class '${className}' after its update.`);
                        return originalFn();
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
                        const classObj = await stack.getClass(className);
                        if (classObj) {
                            const beforeTriggers = classObj.triggers.filter( t => t.order === "before");

                            for (const trigger of beforeTriggers) {
                                const updatedDoc = await trigger.execute(doc);
                                Object.assign(doc, updatedDoc); // Merge changes back.
                            }

                            // Perform validation using the schema.
                            const validationResult = await classObj.validate(doc);
                            if (!validationResult) {
                                throw new Error("Discarded object because object not valid for its Class schema");
                            }
                        }
                    } catch (error) {
                        return Promise.reject(error);
                    }
                }
            }
            return originalFn();
            
        },

    };
};