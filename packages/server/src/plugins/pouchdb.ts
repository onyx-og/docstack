import { isDocument, Stack } from "@docstack/shared";
import type { PristineDbMethods, StackPluginType } from "@docstack/shared";
// import Stack from "../utils/stack";
import { Trigger } from "../utils/stack/trigger";


/**
 * Plugin Factory method that returns a PouchDB plugin object
 * which performs on documents (before) triggers and validation against
 * their class schema.
 *
 * @param pouch - The PouchDB constructor the stack is using.
 * @param stack - The stack whose classes validate the documents.
 * @param pristine - The database's own `bulkDocs`, captured before this plugin replaced
 * it. It used to be read from `PouchDB.prototype.bulkDocs`, which is `undefined` on
 * PouchDB 9 - the core document methods are installed per instance - and which, in Node,
 * was read off a statically imported `pouchdb-browser` that was not even the constructor
 * building the database. See ADR-0019.
 */
export const StackPlugin: StackPluginType = (pouch, stack: Stack, pristine: PristineDbMethods) => {
    const pouchBulkDocs = pristine.bulkDocs;
    return {
        // You're overriding the default bulkDocs method.
        bulkDocs: async function (docs, options, callback) {

            // Check if there are any documents to process.
            if (typeof options == 'function') {
                callback = options
                options = {}
            }

            /**
             * Reports a refused write in whichever style the caller asked in.
             *
             * `put`, `post` and `remove` reach this plugin through PouchDB's callback
             * form, and a callback caller never sees the returned promise: rejecting it
             * settles nothing and the write hangs instead of failing.
             */
            const fail = (error: unknown) => {
                if (callback) {
                    (callback as unknown as (err: unknown) => void)(error);
                    return undefined;
                }
                return Promise.reject(error);
            };

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
                            const { schema } = classObj.model;
                            const beforeTriggers = classObj.triggers.filter(t => t.order === "before");

                            for (const trigger of beforeTriggers) {
                                const updatedDoc = await trigger.execute(doc);
                                Object.assign(doc, updatedDoc); // Merge changes back.
                            }

                            // Perform validation using the schema.
                            const validationResult = await stack.validateObjectByType(doc, className, schema);
                            if (!validationResult) {
                                throw new Error(`Discarded document ${doc} because object not valid for its Class schema: ${schema}`);
                            }
                        }
                    } catch (error) {
                        // Handle validation or trigger errors.
                        return fail(error);
                    }
                }
            }

            // Call the original PouchDB bulkDocs method to save the validated documents.
            return pouchBulkDocs.call(this, docs, options, callback);
        },

        // You can override other methods as needed, like put(), post(), etc.
    };
};