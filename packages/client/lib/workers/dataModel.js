import createLogger from "../utils/logger";
const logger = createLogger().child({ module: "dataModel" });
logger.info("Worker successfully registered");
// Implement a message queue to handle requests sequentially.
const messageQueue = [];
let isProcessing = false;
// Function to process messages from the queue.
const processQueue = async () => {
    const fnLogger = logger.child({ method: "processQueue" });
    fnLogger.info("Started to process model worker queue");
    if (isProcessing || messageQueue.length === 0) {
        return;
    }
    isProcessing = true;
    const nextMessage = messageQueue.shift();
    if (nextMessage) {
        const { command, payload } = nextMessage;
        try {
            //
        }
        catch (error) {
            // If anything goes wrong, send an error message back.
            self.postMessage({
                status: 'error',
                message: `Failed.`,
                error: error.message
            });
        }
        finally {
            // We are done with the current message.
            isProcessing = false;
            // Check if there are more messages to process.
            processQueue();
        }
    }
};
// Listen for messages from the main application thread.
self.onmessage = (event) => {
    if (event.data.command) {
        messageQueue.push(event.data);
        // Start processing the queue if not already busy.
        processQueue();
    }
};
self.onmessageerror = (event) => {
    logger.error("Got error", { event });
};
//# sourceMappingURL=dataModel.js.map