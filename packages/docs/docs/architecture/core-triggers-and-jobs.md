# Combining Triggers and Jobs

While Triggers and Jobs serve different primary purposes—Triggers for immediate, synchronous logic and Jobs for asynchronous, background tasks—they can be combined to build powerful, event-driven automation workflows. This document outlines the patterns for how Triggers can initiate Jobs.

```typescript
// Example: An 'after' trigger that executes a job.
// This pattern is useful for offloading heavy tasks that shouldn't block
// the initial database operation.
const triggerThatRunsAJob = {
  name: 'on-new-order-send-confirmation',
  order: 'after', // Run after the document is successfully saved
  run: `
    // The 'document' here is the newly created 'Order' document.
    // We use its ID to pass context to the background job.
    await stack.jobEngine.executeJob('Job-SendOrderConfirmation', { orderId: document._id });
    return document; // Triggers should always return the document
  `
};
```

## Overview (For Business Analysts)

### The "Why": Connecting Immediate Actions to Background Tasks

Imagine you have a business process that starts with a simple event, like a customer placing an order. Some parts of that process need to happen instantly (like saving the order to the database), while others can happen in the background (like sending a confirmation email or updating inventory in another system).

This is where combining Triggers and Jobs becomes essential:

*   **Trigger (The Spark)**: A Trigger watches for a specific event, such as "a new order was created." It acts as the immediate spark.
*   **Job (The Follow-up Action)**: The Trigger's only task is to tell the Job Engine, "Hey, this event happened. Please start the 'Send Confirmation Email' job for this order." The Job then runs in the background to handle the heavy lifting.

This separation ensures the user gets an immediate response (their order is placed!) without having to wait for the email to be sent or for inventory levels to be recalculated. The system remains fast and responsive while ensuring that all necessary follow-up actions are reliably executed.

### Common Business Use Cases:

*   **E-commerce**: After a new `Order` document is created, a trigger starts a job to send a confirmation email, notify the shipping department, and update the customer's purchase history.
*   **Social Media**: When a user uploads a new `Video` document, a trigger initiates a background job to transcode the video into different resolutions.
*   **Data Integration**: When a `Contact` document is updated, a trigger launches a job to synchronize the changes with an external CRM system like Salesforce.
*   **Content Management**: After a `BlogPost` is published (e.g., a `status` field is changed to 'published'), a trigger starts a job to clear the website cache and push the new content to a search engine for indexing.

## Guide: Triggering a Job on Document Creation

This guide demonstrates how to create a trigger that executes a job whenever a new `Order` document is saved.

### Step 1: Define the Background Job

First, we need the job that will perform the actual work. This job will be responsible for sending a confirmation email. It expects an `orderId` in its parameters.

```typescript
const sendOrderConfirmationJob = {
  _id: 'Job-SendOrderConfirmation',
  '~class': '~Job',
  name: 'Send Order Confirmation Email',
  content: `
async function execute(stack, params, job) {
    const { orderId } = params;
    if (!orderId) {
        throw new Error('orderId is required to send confirmation.');
    }

    // 1. Fetch the full order details from the database
    const order = await stack.db.get(orderId);

    // 2. Fetch the customer's email
    const customer = await stack.db.get(order.customerId);

    // 3. (Simulated) Call an external email service
    console.log(\`Sending confirmation for order \${order._id} to \${customer.email}...\`);
    // await emailService.send({ to: customer.email, ... });

    console.log('Email sent!');
    // No metadata update needed for this job
}
`,
  isEnabled: true,
  isSingleton: false
};

// Don't forget to save the job definition to the database!
// await stack.db.bulkDocs([sendOrderConfirmationJob]);
```

### Step 2: Define the Trigger on the `Order` Class

Next, we define a trigger within the `~Class` definition for our `Order` documents. This trigger will fire *after* a new order is successfully created.

The `run` script is simple: it just calls `stack.jobEngine.executeJob`, passing the ID of the job we want to run and the `_id` of the newly created order document.

```typescript
const orderClassDefinition = {
    _id: 'Class-Order',
    '~class': '~Class',
    name: 'Order',
    // ... other schema properties
    triggers: [
        {
            name: 'after-create-send-confirmation-email',
            order: 'after', // 'before' or 'after' the database operation
            run: \`
                // 'document' is the newly saved Order document.
                // We only want to run this for new documents, not updates.
                if (document._rev.startsWith('1-')) {
                    await stack.jobEngine.executeJob('Job-SendOrderConfirmation', { orderId: document._id });
                }
                return document;
            \`
        }
    ]
};
```

With both the `Job` and the `Class` trigger in place, the workflow is fully automated. Every new `Order` document saved to the database will now automatically trigger the email confirmation job, ensuring a responsive user experience and reliable background processing.
