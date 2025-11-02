import { Trigger as Trigger_ } from "@docstack/shared";
/**
 * The Trigger class dynamically hydrates a function from a string.
 * This allows for declarative, data-driven logic to be executed at runtime.
 */
export class Trigger extends Trigger_ {
    constructor(model, classObj) {
        super();
        /**
         * Executes the hydrated run function with the necessary context.
         * The method is now asynchronous by default.
         * @param document The document to be processed by the trigger.
         * @returns The updated document returned by the trigger logic as a Promise.
         */
        this.execute = async (document) => {
            const stack = this.classObj ? this.classObj.getStack() : undefined;
            // Call the dynamically created function with the required arguments.
            // It's crucial to pass the `document` argument and await the result.
            const result = await this.run(document, this.classObj, stack);
            if (result === undefined) {
                console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
                return document;
            }
            return result;
        };
        /**
         * Executes the hydrated run function without providing class or stack context.
         * This is useful for testing or previews where cross-document
         * behaviors are not desired.
         * @param document The document to be processed by the trigger.
         * @returns The updated document returned by the trigger logic as a Promise.
         */
        this.executeLimited = async (document) => {
            // Call the dynamically created function, providing null for classObj and stack.
            const result = await this.run(document);
            if (result === undefined) {
                console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
                return document;
            }
            return result;
        };
        this.model = model;
        this.name = model.name;
        this.order = model.order;
        this.classObj = classObj;
        // Security and validation checks before hydration.
        if (typeof model.run !== 'string') {
            throw new Error("Trigger model's 'run' field must be a string representation of a function.");
        }
        // Hydrate the run function from the string.
        try {
            // Use 'new Function()' for secure, sandboxed execution.
            // We pass dependencies as explicit arguments to the function's scope.
            // The `this` context is not used to prevent unwanted access.
            this.run = new Function('document', 'classObj', 'stack', `
                "use strict";
                // The developer's code is placed here.
                return (async () => {
                    ${model.run}
                })();
            `);
        }
        catch (error) {
            throw new Error(`Failed to hydrate trigger '${model.name}': ${error}`);
        }
    }
}
//# sourceMappingURL=index.js.map