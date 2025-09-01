// worker.js

// Import the PouchDB library.
// We must use `importScripts` since this is a web worker.
// importScripts('https://cdn.jsdelivr.net/npm/pouchdb@8.0.1/dist/pouchdb.min.js');
import {ClientStack, DocStack} from "../../../client/";
import { AttributeModel, ClassModel, DocstackReady, Document } from "../types";
import * as jsondiffpatch from 'jsondiffpatch';
import logger_ from "../utils/logger";
// PouchDB requires a valid database name.
// The worker will use its own instance of the database.
// The database is backed by the same storage, so they can see the same data.

const logger = logger_.child({module: "dataModel"});

// Listen for messages from the main application thread.

type PropagateModel = {
    dbName: string;
    className: string;
    previousRevId: string;
}
type EnvisionModel = {
    dbName: string;
    className: string;
    schema: AttributeModel[]
}
interface StackMessage {
    command: string;
    payload: PropagateModel | EnvisionModel
}

const isEnvisionModel = (payload: {}): payload is EnvisionModel => {
    if (payload.hasOwnProperty("schema")) return true;
    return false;
}

const isPropagateModel = (payload: {}): payload is PropagateModel => {
    if (payload.hasOwnProperty("previousRevId")) return true;
    return false;
}
// PouchDB requires a valid database name.
// The worker will use its own instance of the database.
// The database is backed by the same storage, so they can see the same data.

// Implement a message queue to handle requests sequentially.
const messageQueue: StackMessage[] = [];
let isProcessing = false;

// Function to process messages from the queue.
const processQueue = async () => {
    if (isProcessing || messageQueue.length === 0) {
        return;
    }

    isProcessing = true;
    const nextMessage = messageQueue.shift();
    if (nextMessage) {
        const { command, payload } = nextMessage;

        try {
            if (command === 'propagateSchema' && isPropagateModel(payload)) {
                const { dbName,className, previousRevId } = payload;
                const db = new PouchDB(dbName);

                // Fetch both the current and previous versions of the class document.
                const [currentClassDoc, previousClassDoc] = await Promise.all([
                    db.get<ClassModel>(className),
                    db.get<ClassModel>(className, { rev: previousRevId })
                ]);
                logger.info("Retrieved documents", {currentClassDoc, previousClassDoc});

                // Use jsondiffpatch to find the differences in the 'schema' property.
                const schemaDelta = jsondiffpatch.diff(previousClassDoc.schema, currentClassDoc.schema);

                logger.info("Performed diff with results", {schemaDelta});

                // If there are no changes to the schema, we can return early.
                if (!schemaDelta) {
                    self.postMessage({
                        status: 'success',
                        className: currentClassDoc.type,
                        message: `Schema for '${currentClassDoc.type}' has no changes.`
                    });
                    return;
                }

                // Step 1: Query for all documents of the specified class.
                const findResult = await db.find({
                    selector: {
                        type: currentClassDoc.type
                    }
                });

                const documents = findResult.docs as unknown as Document[];

                // If no documents are found, we can send a success message immediately.
                if (documents.length === 0) {
                    self.postMessage({
                        status: 'success',
                        className: currentClassDoc.type,
                        message: `No documents found for class '${currentClassDoc.type}'.`
                    });
                    return;
                }

                /*
                // Step 2: Prepare the bulk update.
                // Iterate over the documents and apply the schema changes based on the delta.
                const updates = documents.map(doc => {
                    // Here is where you implement the logic to apply the `schemaDelta`
                    // to each document's data. This function needs to be written
                    // to interpret the diff and make the appropriate changes.
                    const updatedDoc = applySchemaChangesToDoc(doc, schemaDelta, currentClassDoc.schema);

                    // PouchDB requires the `_rev` property for updates.
                    return updatedDoc;
                }); */

                // [TODO] Step 3: Perform the bulk update.
                // const result = await db.bulkDocs(updates);

                // Send a success message back to the main thread.
                self.postMessage({
                    status: 'success',
                    className: currentClassDoc.type,
                    // message: `${result.length} documents updated for class '${currentClassDoc.type}'.`
                });
            } else if (command === 'envisionSchema' && isEnvisionModel(payload)) {
                // Query all data (all docs)
                const { dbName, className, schema } = payload;
                const onStackReady = async (evt: CustomEventInit) => {
                    const stack = evt.detail.stack as ClientStack;
                    const classObj = await stack.getClass(className);

                    if (!classObj) {
                        throw new Error("Class object could not be retrieved. Check logs");
                    }

                    const classModel = classObj?.model;
                    logger.info("Retrieved class model", {classModel});

                    // Use jsondiffpatch to find the differences in the 'schema' property.
                    const schemaDelta = jsondiffpatch.diff(classModel.schema, schema);

                    // If there are no changes to the schema, we can return early.
                    if (!schemaDelta) {
                        self.postMessage({
                            status: 'success',
                            className: classModel.type,
                            message: `Schema for '${classModel.type}' has no changes.`
                        });
                        return;
                    }

                    // Step 1: Query for all documents of the specified class.
                   

                    const documents = await classObj.getCards() as Document[];

                    // If no documents are found, we can send a success message immediately.
                    if (documents.length === 0) {
                        self.postMessage({
                            status: 'success',
                            task: command,
                            className: classModel.type,
                            message: `No documents found for class '${classModel.type}'.`
                        });
                        return;
                    }

                    // Modify all documents based on schema
                    // Iterate over the documents and apply the schema changes based on the delta.
                    const updates = documents.map( async doc => {
                        // Avoid altering the original doc, to allow comparison
                        let updatedDoc = {...doc};
                        const triggers = Object.values(classObj.triggers);
                        for (const trigger of triggers.filter(t => t.order === "before")) {
                            updatedDoc = await trigger.executeLimited(updatedDoc);
                        }

                        // TODO: updatedDoc = applySchemaChangesToDoc(updatedDoc, schemaDelta, classModel.schema);

                        for (const trigger of triggers.filter(t => t.order === "after")) {
                            updatedDoc = await trigger.executeLimited(updatedDoc);
                        }

                        // PouchDB requires the `_rev` property for updates.
                        return updatedDoc;
                    });

                    // Validate all documents

                    // if validation error

                    // if validation successful
                }
                const docStack = new DocStack({dbName}).addEventListener("ready", onStackReady);
            }
        } catch (error: any) {
            // If anything goes wrong, send an error message back.
            self.postMessage({
                status: 'error',
                className: payload.className, // Use payload to ensure we have the className
                message: `Failed to propagate schema for class '${payload.className}'.`,
                error: error.message
            });
        } finally {
            // We are done with the current message.
            isProcessing = false;
            // Check if there are more messages to process.
            processQueue();
        }
    }

};

// Listen for messages from the main application thread.
self.onmessage = (event: MessageEvent<StackMessage>) => {
    // Add the new message to the queue.
    messageQueue.push(event.data);
    // Start processing the queue if not already busy.
    processQueue();
};