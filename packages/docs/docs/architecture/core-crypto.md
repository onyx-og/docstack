# Crypto Engine

```typescript
// 1. Define a class with an encrypted attribute
const secureNoteClass = {
  _id: 'Class-SecureNote',
  '~class': '~Class',
  name: 'SecureNote',
  schema: {
    title: { name: 'title', type: 'string' },
    // By setting 'encrypted: true', this field's content will be
    // automatically encrypted before being saved to the database.
    content: { name: 'content', type: 'string', config: { encrypted: true } }
  }
};

// 2. When a user with the correct key creates a document, the 'content' is encrypted transparently.
const myNote = await stack.createDoc('note-123', 'Class-SecureNote', { 
  title: 'Secret Plans', 
  content: 'World domination' 
});

// 3. When reading it back, the content is automatically decrypted.
const readableNote = await stack.getDocument('note-123');
// readableNote.content will be 'World domination'
```

## Overview (For Business Analysts)

### What is the Crypto Engine?
The Crypto Engine is the vault for your application's data. It provides **end-to-end encryption**, ensuring that sensitive information is scrambled and unreadable before it is ever written to the database. The data remains encrypted at all times while "at rest" (stored on disk) and is only decrypted in the user's browser or device when they have the correct key.

### Why use the Crypto Engine?
In today's world, data security is not optional. The Crypto Engine is a critical component for building trustworthy applications and meeting regulatory requirements.

*   **Zero-Knowledge Architecture**: The server and database administrators cannot read the encrypted user data. Even if the database is stolen or compromised, the sensitive information remains secure.
*   **Compliance and Privacy**: Essential for applications that handle Personally Identifiable Information (PII), financial records, or health data (PHI), helping to meet standards like GDPR and HIPAA.
*   **Granular Control**: You decide exactly which pieces of information should be encrypted by flagging them in the data schema. Non-sensitive data can remain unencrypted for easier querying and analysis.
*   **Automatic and Transparent**: Once configured, the encryption and decryption process is completely automatic. Developers don't need to manually manage cryptographic operations, reducing the risk of implementation errors.

### Common Business Use Cases:
*   **Healthcare**: Storing patient notes, diagnoses, and personal health information.
*   **Finance**: Securing bank account numbers, transaction details, and personal financial statements.
*   **Human Resources**: Protecting employee social security numbers, salary information, and performance reviews.
*   **Journaling/Notes Apps**: Ensuring that a user's private thoughts and entries are for their eyes only.
*   **Legal Tech**: Securing confidential client communications and case details.

## Guide: The Lifecycle of an Encrypted Document

This guide explains the key management and data flow for encryption and decryption.

### The Key Hierarchy
The security of the system relies on a three-level key hierarchy:

1.  **User's Password**: The secret that only the user knows.
2.  **Derived Key**: When a user logs in, their password and a unique `salt` (stored on their user profile) are put through a computationally intensive process (PBKDF2) to create a strong `Derived Key`. This key exists only in memory during the user's session.
3.  **Document Key**: This is a single, strong, randomly generated key that is used to encrypt and decrypt *all* sensitive data in the database (using AES-GCM symmetric encryption).

### The Key Wrapping Process
The `Document Key` must be stored somewhere so the user can access their data from different devices. However, it can **never** be stored in plaintext. This is where "key wrapping" comes in:

*   The `Document Key` is encrypted using the user's `Derived Key`.
*   This encrypted version is called the `wrappedDocumentKey` and is stored safely on the user's `~User` document.

### Step-by-Step Flow:

1.  **First User Setup**: When the first user is created in a new stack, a new `Document Key` is generated. This key is then wrapped using that user's `Derived Key` and stored on their profile.

2.  **Subsequent User Creation**: When a new user is created by an administrator (who is already logged in and has the `Document Key` in memory), the system automatically wraps the `Document Key` with the new user's `Derived Key` and saves it to the new user's profile.

3.  **User Login**:
    *   A user enters their password.
    *   The system generates the `Derived Key` from the password and the user's salt.
    *   It fetches the `wrappedDocumentKey` from the user's profile.
    *   It "unwraps" (decrypts) the `wrappedDocumentKey` using the `Derived Key` to retrieve the plaintext `Document Key`.
    *   This `Document Key` is loaded into the Crypto Engine in memory for the duration of the session.

4.  **Writing Data**:
    *   A user saves a document with an encrypted field (e.g., `content: 'secret'`).
    *   Before the document is sent to the database, the framework intercepts it.
    *   It calls the Crypto Engine, which uses the in-memory `Document Key` to encrypt the `content` field.
    *   The document is saved with the `content` field containing an encrypted payload (e.g., `{ "__enc": true, ... }`).

5.  **Reading Data**:
    *   The user requests the same document.
    *   The framework intercepts the document after it's fetched from the database.
    *   It calls the Crypto Engine, which uses the in-memory `Document Key` to decrypt the `content` field.
    *   The application receives the document with the plaintext `content` field, as if it were never encrypted.

If a user tries to read the data without the `Document Key` (e.g., they are not logged in, or they are a different user without access), the decryption step fails, and the data remains secure.

## API Reference (For Developers)

The Crypto Engine is designed to be largely transparent, but understanding its core components is useful for advanced scenarios and debugging.

### Defining Encrypted Attributes
To mark a field for encryption, set `encrypted: true` in the attribute's configuration within the `~Class` schema.

```typescript
const myClassSchema = {
  sensitiveData: { 
    name: "sensitiveData", 
    type: "string", 
    config: { encrypted: true } // This is all you need to do
  }
};
```

### `CryptoEngine` Class
The `CryptoEngine` is available on the `ClientStack` instance via `stack.cryptoEngine`.

| Method | Description |
| :--- | :--- |
| `isEnabled(): boolean` | Returns `true` if the Crypto Engine is active for the current stack. |
| `setDocumentKey(key: string)` | Loads the plaintext `Document Key` into memory and generates the `CryptoKey` used for AES-GCM operations. This is typically called automatically during authentication. |
| `getDocumentKey(): string` | Returns the plaintext `Document Key` currently held in memory. |
| `encryptDocument(doc: Document, classObj: Class)` | Iterates over a document's fields, finds the ones marked as `encrypted` in the class schema, and encrypts their values in place. |
| `decryptDocument(doc: Document, classObj: Class)` | Finds encrypted payloads in a document and attempts to decrypt them in place using the in-memory `Document Key`. |
| `wrapDocumentKey(docKey: string, derivedKey: string)` | Encrypts the `Document Key` with a user's `Derived Key`. Used when creating new users. |
| `unwrapAndStoreDocumentKey(wrappedKey: string, derivedKey: string)` | Decrypts a `wrappedDocumentKey` using a `Derived Key` and stores the result in memory. This is the core of the login process. |

### Encrypted Payload Format
When a value is encrypted, it is replaced with an object that follows the `EncryptedPayload` structure:

```json
{
  "__enc": true,
  "iv": "base64-encoded-initialization-vector",
  "data": "base64-encoded-ciphertext",
  "alg": "AES-GCM"
}
```
The `__enc: true` property serves as a marker that allows the engine to quickly identify fields that need decryption.

### Integration with Other Engines

*   **PouchDB Plugin**: This is the primary integration point. The plugin wraps the `bulkDocs` and `get` methods of PouchDB.
    *   On write operations (`bulkDocs`, `put`), it calls `encryptDocument` before the data is sent to the database.
    *   On read operations (`get`, `find`), it calls `decryptDocument` after the data is retrieved.

*   **Replication**: Sync deliberately does *not* go through the plugin's read path. Replication reads documents exactly as they are stored, so encrypted attributes cross the wire and land on a remote — a user's Google Drive, for instance — as ciphertext, with the Document Key never leaving the device. Going through the decrypting `bulkGet` instead would have shipped plaintext to a remote meant to hold ciphertext. See [Sync & backup](../sync/overview.md).

*   **Query Engine**: The Query Engine is aware of encryption. When `stack.query()` is executed:
    *   After the initial data is fetched and policies are checked, the query executor inspects the selected fields.
    *   If the `Document Key` is available, it automatically decrypts any encrypted fields in the result set.
    *   If the `Document Key` is **not** available:
        *   Encrypted fields are returned as `null` to prevent leaking the encrypted payload.
        *   If a row would *only* contain `null` values as a result, the entire row is dropped from the final result set.

*   **Authentication & `~User` Triggers**: The system uses a **hash-based** verification model. The user's password is **never stored**. Instead, system triggers on the `~User` class automates salt generation and key wrapping for new users (using classic authentication). When a new user document is created:
    1.  A **`before`** trigger (`ensure-salt`) runs first to ensure a `keyDerivationSalt` exists. If one is not provided, it generates a cryptographically secure random salt and adds it to the user document.
    2.  A second **`before`** trigger (`auto-wrap-document-key`) then executes. If the `Document Key` is loaded in the stack, it checks if the password or salt has changed compared to the stored document. If they differ (or if it is a new user), it derives a key from the user's plaintext password and the salt, uses this to wrap the `Document Key`, and stores the `wrappedDocumentKey` on the user document. This ensures that the wrapped key is only regenerated when necessary.
        *   **Note**: This step involves asynchronous operations (database lookups, job execution) within a `before` trigger, which can impact performance and relies on the `Document Key` being available.
    
    Authentication is successful if a user can provide a password that correctly unwraps their `wrappedDocumentKey`.
