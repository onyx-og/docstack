import { Trigger } from ".";
// Example usage and a test to demonstrate functionality.
const mockStack = {
    doSomething: () => console.log("Stack is doing something..."),
    queryOtherDocuments: async (query) => {
        console.log("Simulating async query...", query);
        return new Promise(resolve => setTimeout(() => resolve([{ id: 'otherDoc1' }]), 500));
    }
};
const mockClass = {
    name: 'User',
    getSpace: () => mockStack
};
const triggerModel = {
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
        const trigger = new Trigger(triggerModel, mockClass);
        const initialDocument = { username: 'testuser' };
        console.log("Initial Document:", initialDocument);
        const updatedDocument = await trigger.execute(initialDocument);
        console.log("Updated Document:", updatedDocument);
    }
    catch (e) {
        console.error(e);
    }
})();
//# sourceMappingURL=index.test.js.map