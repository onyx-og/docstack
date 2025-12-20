# Core concepts

DocStack is built on a specific set of architectural paradigms designed to make application development faster, more secure, and easier to manage. Unlike traditional frameworks that strictly separate code (application logic) from data (database storage), DocStack treats **logic as data**.

This section outlines the fundamental concepts you need to understand to effectively build applications with DocStack.

## 1. The Unified Document Model ("Everything is a Document")

In a typical stack, you might have a SQL database for data, a backend API for logic, and a frontend for the UI. In DocStack, **everything is a document stored in the database**.

*   **Data is a Document**: A user, a product, or an invoice.
*   **Schema is a Document**: The definition of what a "Product" looks like (its fields and types) is stored in a `~Class` document.
*   **Logic is a Document**: Business rules, validation scripts, and background tasks are stored in `~Policy`, `~Job`, and `~Class` documents.

### Business Value
*   **Runtime Agility**: You can update a validation rule or a business process by simply updating a document in the database, without needing to redeploy the entire application binary.
*   **Portability**: Your entire application—structure, logic, and data—can be replicated or moved simply by syncing the database.

## 2. Class-Based Data Modeling

DocStack uses a class-based system to define data structures. A `~Class` document acts as a blueprint.

*   **Schema Definition**: Defines fields, types (string, number, foreign_key), and validation rules (mandatory, maxLength).
*   **Inheritance-like Behavior**: While not strict OOP inheritance, documents "belong" to a class and automatically inherit the validation rules, triggers, and policies defined by that class.

**Example**:
Defining a `Customer` class automatically creates the API endpoints (conceptually) to create, read, update, and delete customers, complete with validation.

## 3. Logic Injection (Triggers & Jobs)

Business logic in DocStack is event-driven and injected directly into the data flow.

### Triggers (Synchronous Logic)
Triggers are small pieces of JavaScript code attached to a `~Class`. They run **immediately** before or after a document is saved.
*   **Use Case**: "Before saving an Invoice, calculate the `total` based on the `lineItems`."
*   **Use Case**: "After creating a User, generate a default avatar."

### Jobs (Asynchronous Logic)
Jobs are background tasks that run independently of the user's immediate request. They are defined in `~Job` documents.
*   **Use Case**: "Every night at midnight, generate a sales report."
*   **Use Case**: "When a user uploads a large file, process it in the background."

## 4. Granular Access Control (Policies)

Security is not an afterthought; it is a core data entity. `~Policy` documents define who can read or write data.

*   **Rule-Based**: Policies use JavaScript rules to evaluate access (e.g., `return document.ownerId === session.userId`).
*   **Context-Aware**: Rules have access to the document being accessed and the user's session data.

## 5. Field-Level Encryption (Crypto Engine)

For highly sensitive data (PII, health records, secrets), DocStack offers a **Zero-Knowledge** encryption model.
*   **Transparent**: You simply mark a field as `encrypted: true` in the schema.
*   **Client-Side**: Data is encrypted *before* it leaves the client/server memory and hits the storage layer.
*   **Key Management**: Keys are managed via the `~User` authentication flow, ensuring that only the user with the correct password can unlock their data.

## 6. System Evolution (Patches)

Managing database schema changes (migrations) is often painful. DocStack solves this with the **Patch System**.
*   **Versioned Changes**: Changes to the system (new classes, updated triggers, seed data) are defined in `~Patch` documents.
*   **Automatic Application**: When the application starts, it checks for new patches and applies them in order.
*   **Consistency**: This ensures that every instance of your application (dev, test, prod) is always on the correct version of the data model.
