# Policy Engine

```typescript
// Example Policy: Only allow users in the 'editors' group to write 'Article' documents.
const editorsOnlyWritePolicy = {
  _id: 'Policy-Article-EditorsWrite',
  '~class': '~Policy',
  targetClass: ['Class-Article'], // The class this policy applies to
  groupId: 'Group-Editors',       // Scoped to users in this group
  rule: `
    // 'session' and 'document' are injected at runtime.
    // This rule allows the action if the user's session is active.
    return session && session.sessionStatus === 'active';
  `
};

// To use this, you would save it to the database:
// await stack.db.bulkDocs([editorsOnlyWritePolicy]);
```

## Overview (For Business Analysts)

### What is the Policy Engine?
The Policy Engine is the security guard for your data. It's a powerful and flexible system that controls who can read or write specific types of information within the application. By defining simple, human-readable rules called "Policies," you can enforce your business's security and access control requirements without changing the application's core code.

### Why use the Policy Engine?
The Policy Engine is fundamental to creating a secure, multi-user application. It provides granular control over data access, which translates to significant business value:

*   **Data Security and Compliance**: Protect sensitive information by ensuring only authorized users can view or modify it. This is critical for meeting compliance standards like GDPR or HIPAA.
*   **Role-Based Access Control (RBAC)**: Easily implement roles within your application. For example, you can define that "Administrators" can edit anything, "Editors" can only manage articles, and "Viewers" can only read data.
*   **Flexible Business Rules**: Policies are stored as data, not hard-coded. This means you can change access rules on the fly as your business needs evolve, without requiring a new software deployment.
*   **Default Security**: By default, when a new type of data (`Class`) is created, the system automatically generates a policy requiring a user to be logged in to access it. This "secure-by-default" approach prevents accidental data exposure.

### Common Business Use Cases:
*   **Content Management**: Allow authors to edit their own draft posts, but only allow editors to publish them.
*   **Human Resources**: Restrict access to employee salary information to only members of the "HR-Managers" group.
*   **Multi-Tenant Applications**: Ensure that users from one company cannot see data belonging to another company.
*   **E-commerce**: Allow customers to view their own order history, but prevent them from seeing the orders of other customers.

## Guide: Creating a Read-Only Policy for Published Articles

This guide demonstrates how to create a policy that makes published articles readable by anyone (including non-authenticated users), while keeping drafts private.

### The Goal
We have an `Article` class with a `status` field. We want to enforce the following rules:
1.  If `article.status === 'published'`, anyone can read it.
2.  If `article.status === 'draft'`, only the author or an editor can read it (covered by a separate, more specific policy).

### Step 1: Define the Public Read Policy
A policy is a simple document. The most important fields are `targetClass` (what data it protects) and `rule` (the logic that grants or denies access).

```typescript
const publicReadPolicy = {
  _id: 'Policy-Article-PublicRead',
  '~class': '~Policy',
  name: 'Public Read Access for Published Articles',
  description: 'Allows anyone to read articles with a status of "published".',
  targetClass: ['Class-Article'], // Applies to documents of the 'Article' class
  rule: `
    // The 'document' object is the specific article being checked.
    // If the document's status is 'published', the rule returns true, granting access.
    if (document.status === 'published') {
      return true;
    }

    // If the status is not 'published', this policy doesn't apply.
    // The engine will then check other policies.
    return; // A neutral response
  `
};
```

The `rule` is a snippet of JavaScript. It has access to two key variables:
*   `document`: The actual document being requested (e.g., the specific article).
*   `session`: The session information of the user making the request.

A rule can return three types of values:
*   `true`: Explicitly allows the operation.
*   `false`: Explicitly denies the operation. This is a hard stop.
*   `undefined` (or no return): The policy is neutral, and the engine moves on to evaluate other policies.

### Step 2: Persist the Policy
For the Policy Engine to use this rule, it must be saved to the database.

```typescript
// Assuming 'stack' is your ClientStack instance
await stack.db.bulkDocs([publicReadPolicy]);
console.log('Public read policy has been saved and is now active.');
```

### How it Works in Practice
Now, when any user (logged in or not) tries to read an `Article`:
1.  The Policy Engine loads all policies targeting the `Article` class.
2.  It executes the `rule` from our `publicReadPolicy`.
3.  If the article's `status` is `'published'`, the rule returns `true`, and the user is immediately granted read access.
4.  If the `status` is `'draft'`, our policy returns nothing. The engine would then proceed to check other policies, such as one that checks if the user is the author or an editor. If no other policy grants access, the request is denied.

## API Reference (For Developers)

The Policy Engine provides access control for `read` and `write` operations. It is integrated directly into the `ClientStack` and automatically invoked by methods like `findDocuments`, `getDocument`, and `createDoc`.

### `PolicyModel` (`~Policy` Class)
This document defines a single access control rule.

| Field | Type | Description |
| :---- | :--- | :---------- |
| `_id` | `string` | Unique identifier for the policy (e.g., `Policy-ClassName-RuleName`). |
| `~class` | `string` | Always `~Policy`. |
| `targetClass` | `string[]` | An array of `~Class` identifiers that this policy applies to. |
| `rule` | `string` | A JavaScript string to be executed. It must return `true` (allow), `false` (deny), or `undefined` (neutral). |
| `userId` | `string` | **Optional.** Scopes the policy to a specific user ID or username. |
| `groupId` | `string` | **Optional.** Scopes the policy to a specific group ID. |
| `description`| `string` | **Optional.** A human-readable description of the policy's purpose. |

### `rule` Execution Context
The `rule` string is executed within a sandboxed function with the following arguments available in its scope:

*   `document: Document | null`: The document being accessed. For `read` operations, it's the full document. For `write` operations on new documents, it may be `null` or a partial document.
*   `session: AuthSessionProof["session"]`: The session object of the authenticated user. Contains `userId`, `username`, `groupId`, `sessionStatus`, etc.
*   `groupId: string | string[]`: A convenience variable holding the `groupId` from the session.

### Evaluation Logic
The engine follows a specific sequence to determine access:

1.  **Bypass**: System-level classes (like `~Job`, `~Policy`) bypass the check.
2.  **Load Policies**: All policies targeting the document's class are loaded. If no policies exist, access is **granted**.
3.  **Authentication Check**: If policies exist, the user must have an active, authenticated session.
4.  **Policy Filtering**:
    *   The engine separates policies into two buckets: **targeted** (with `userId` or `groupId`) and **base** (without).
    *   If **targeted** policies exist, the user's session *must* match at least one of them. If not, access is **denied**.
    *   If no targeted policies exist, or if the user matches one, the engine proceeds to evaluate the rules of all matching policies (either the matching targeted policies or all base policies).
5.  **Rule Evaluation**:
    *   The engine iterates through the filtered list of policies.
    *   If any rule returns `false`, the process stops immediately and access is **denied**.
    *   If at least one rule returns `true`, access is marked as potentially allowed.
6.  **Final Decision**:
    *   If any rule returned `false`, access is **denied**.
    *   If at least one rule returned `true`, access is **granted**.
    *   If all rules were neutral (returned `undefined`), access is **denied**.

### Core `PolicyEngine` Methods (Internal)
These methods are used by the `ClientStack` to enforce policies.

*   `public async ensureWriteAllowed(targetClass: string, document: Document | null)`: Called before a document is written. Throws an error if the session does not have permission, halting the operation.

*   `public async isReadableDocument(document: Document): Promise<boolean>`: Called when retrieving documents. Returns `false` if the session is denied read access, causing the document to be filtered out from the results.

