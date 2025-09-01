import { isDocument, Stack } from "@docstack/shared";
import type {StackPluginType} from "@docstack/shared";
// import Stack from "../utils/stack";
import PouchDB from "pouchdb-browser";
import { Trigger } from "../utils/stack/trigger";


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
        // You're overriding the default bulkDocs method.
        bulkDocs: async function (docs, options, callback) {

            // Check if there are any documents to process.
            if (typeof options == 'function') {
                callback = options
                options = {}
            }

            let documentsToProcess: typeof docs;
            if (Array.isArray(docs)) {
                documentsToProcess = docs;
            } else {
                documentsToProcess = (docs as any).docs;
            }

            // This is how you access the Stack methods.
            for (const doc of documentsToProcess) {
                if (isDocument(doc)) {
                    const className = doc.type;

                    try {
                        // Accessing methods from the Stack instance you passed in.
                        const classObj = await stack.getClass(className);
                        if (classObj) {
                            // You can now access the schema and triggers from the model.
                            const { schema, triggers: triggerModels } = classObj.model;

                            const beforeTriggers = Object.values(triggerModels)
                                .filter(t => t.order === "before")
                                .map(t => new Trigger(t, classObj));

                            for (const trigger of beforeTriggers) {
                                const updatedDoc = await trigger.execute(doc);
                                Object.assign(doc, updatedDoc); // Merge changes back.
                            }

                            // Perform validation using the schema.
                            const validationResult = stack.validateObjectByType(doc, className, schema);
                            if (!validationResult) {
                                throw new Error("Discarded object because object not valid for its Class schema");
                            }
                        }
                    } catch (error) {
                        // Handle validation or trigger errors.
                        return Promise.reject(error);
                    }
                }
            }

            // Call the original PouchDB bulkDocs method to save the validated documents.
            return pouchBulkDocs.call(this, docs, options, callback);
        },

        // You can override other methods as needed, like put(), post(), etc.
    };
};