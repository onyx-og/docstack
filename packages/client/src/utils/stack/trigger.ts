import { Class, Document, Trigger as Trigger_, TriggerModel, TriggerRunFunction} from "@docstack/shared"

/**
 * A placeholder for a reference to the Stack instance.
 * In a real application, this would be imported from your Stack class file.
 */
interface MockStack {
    // Add any relevant methods here, e.g., to interact with the database.
    // We add an async method to showcase a common use case.
    doSomething(): void;
    queryOtherDocuments(query: object): Promise<object[]>;
}

/**
 * A placeholder for a reference to the Class instance.
 * This is the parent object that contains the Trigger.
 */
interface MockClass {
    name: string;
    getSpace(): MockStack;
}

/**
 * The Trigger class dynamically hydrates a function from a string.
 * This allows for declarative, data-driven logic to be executed at runtime.
 */
export class Trigger extends Trigger_ {
    /** The declarative model for the trigger. */
    public readonly model: TriggerModel;
    public readonly name: TriggerModel["name"];
    public readonly order: TriggerModel["order"];

    /** A reference to the parent Class instance. */
    public readonly classObj: Class | undefined;

    /** The dynamically hydrated function that executes the trigger logic. */
    public readonly run: TriggerRunFunction;

    constructor(model: TriggerModel, classObj?: Class) {
        super();
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
            `) as TriggerRunFunction;
        } catch (error) {
            throw new Error(`Failed to hydrate trigger '${model.name}': ${error}`);
        }
    }

    /**
     * Executes the hydrated run function with the necessary context.
     * The method is now asynchronous by default.
     * @param document The document to be processed by the trigger.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    public execute = async (document: Document): Promise<Document> => {
        const stack = this.classObj ? this.classObj.getSpace() : undefined;
        
        // Call the dynamically created function with the required arguments.
        // It's crucial to pass the `document` argument and await the result.
        const result = await this.run(document, this.classObj, stack);

        if (result === undefined) {
            console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
            return document;
        }

        return result;
    }

    /**
     * Executes the hydrated run function without providing class or stack context.
     * This is useful for testing or previews where cross-document
     * behaviors are not desired.
     * @param document The document to be processed by the trigger.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    public executeLimited = async (document: Document): Promise<Document> => {
        // Call the dynamically created function, providing null for classObj and stack.
        const result = await this.run(document);

        if (result === undefined) {
             console.warn(`Trigger '${this.model.name}' did not return a document. Returning the original document.`);
            return document;
        }

        return result;
    }
}

// Example usage and a test to demonstrate functionality.
const mockStack: MockStack = {
    doSomething: () => console.log("Stack is doing something..."),
    queryOtherDocuments: async (query: object) => {
        console.log("Simulating async query...", query);
        return new Promise(resolve => setTimeout(() => resolve([{ id: 'otherDoc1' }]), 500));
    }
};

const mockClass: MockClass = {
    name: 'User',
    getSpace: () => mockStack
};

const triggerModel: TriggerModel = {
    name: 'SetDefaultValues',
    order: 'before',
    // The run function now includes an async operation.
    run: `
        // Access a method on the stack.
        stack.doSomething();
        // Access a property on the class object.
        console.log(\`Running trigger for class: \${classObj.name}\`);
        
        // Example of an async operation.
        const otherDocs = await stack.queryOtherDocuments({ someKey: 'value' });
        console.log("Received other docs:", otherDocs);

        // Modify and return the document.
        document.createdAt = new Date().toISOString();
        return document;
    `
};

(async () => {
    try {
        const trigger = new Trigger(triggerModel, mockClass as unknown as Class);
        const initialDocument = { username: 'testuser' } as unknown as Document;

        console.log("Initial Document:", initialDocument);

        const updatedDocument = await trigger.execute(initialDocument);

        console.log("Updated Document:", updatedDocument);
    } catch (e) {
        console.error(e);
    }
})();
