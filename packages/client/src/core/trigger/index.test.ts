import { TriggerModel, Class, Document } from "@docstack/shared";
import { Trigger } from ".";
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