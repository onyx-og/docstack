# Schemas System

This document provides a brief overview of the DocStack schema system, focusing on its functional purpose within the application's lifecycle.

---

At its core, a schema is the **blueprint for a data object**. It's a set of rules and definitions that tells the system exactly what a specific class of data, like a `User` or a `Product`, should look like. This system ensures that all data flowing through our application is consistent, reliable, and free of errors.

## The Schema Lifecycle: From Blueprint to Living Object

The schema follows a two-stage lifecycle:

### 1. The Raw Schema (The Stored Blueprint)

This is the master copy of the schema. It's a simple, human-readable data structure stored in the database. It contains all the essential rules for each field of a class, such as its name, its basic type (`string`, `number`, etc.), and a set of configuration rules (`mandatory`, `maxLength`, etc.).

This raw schema is the single source of truth for the entire application.

### 2. The Hydrated Schema (The Living Blueprint)

When our application needs to actively work with a class, it doesn't use the raw data directly. Instead, a `Class` object is instantiated, and it takes the raw schema from the database and "hydrates" it.

This hydration process transforms the static blueprint into a living, intelligent object. This new object contains all the business logic and, most importantly, the **automated validation rules** that are ready to be used.

## The Validator: Ensuring Data Integrity

The primary purpose of the hydrated schema is to act as a powerful **data validator**. Every time new data is created or an existing record is updated, the validator automatically inspects it against the schema's rules. This inspection is far more than a simple check:

* **Type & Format Checks:** The validator confirms that each field has the correct data type (e.g., `username` is a `string`, `age` is a `number`).
* **Rule Enforcement:** It checks that fields meet specific business requirements, such as a password having a minimum length or a field not exceeding a maximum length.
* **Data Integrity Checks:** The validator can even verify that a field referencing another document (a "foreign key") actually points to an existing document in the database. This prevents broken links and ensures our data is always connected correctly.

## Summary of Benefits

This schema system brings significant functional benefits:

* **Data Consistency:** By automatically enforcing a single set of rules, it ensures all data adheres to the same standards.
* **Error Prevention:** The validation layer acts as a safety net, catching common data entry mistakes before they can be saved to the database.
* **Business Reliability:** We can trust that any data processed by the application is valid and correct, allowing us to build a more robust and reliable system.

## The DocStack Schema System: A Technical Overview

This document provides a technical overview of the DocStack schema system, detailing its architectural design, data models, and the run-time processes that ensure data integrity.

-----

### 1\. Architectural Overview

The schema system is built on a **schema-driven design pattern**, establishing a clear separation of concerns between data definition and data validation. The central principle is to maintain a single source of truth for all data models, which is then programmatically used to generate robust validation and provide compile-time type safety.

The system relies on a two-stage lifecycle: a persisted **raw schema data model** and a dynamically generated **hydrated Zod schema instance** at run-time.

### 2\. The Schema Data Model

The schema for a `Class` is defined and persisted in a structured JSON format. This model represents the complete definition of a data object and its attributes.

**Core Interfaces:**

  * `ClassModel`: The top-level data model for a class.
    ```typescript
    interface ClassModel {
      _id: string;
      name: string;
      description?: string;
      type: 'class';
      schema: { [name: string]: AttributeModel };
      // ... other metadata
    }
    ```
  * `AttributeModel`: The data model for a single field or attribute within a class's schema.
    ```typescript
    interface AttributeModel {
      type: 'string' | 'number' | 'boolean' | 'date' | 'foreign_key';
      config: {
        primaryKey?: boolean;
        maxLength?: number;
        mandatory?: boolean;
        isArray?: boolean;
        foreignKeyClass?: string;
      };
    }
    ```

The `type` field in `AttributeModel` explicitly defines the attribute's data type, while the `config` object serves as a container for all validation flags and parameters. The `foreign_key` type is a special case that triggers an asynchronous validation routine.

### 3\. The Hydration Process

The hydration process is executed within the `Class` instance's constructor. Its purpose is to transform the static `ClassModel.schema` into a living `z.ZodObject` that can be used for direct validation. This logic is encapsulated within a private method, `hydrateSchema()`.

**Hydration Logic:**
The `hydrateSchema()` method performs the following steps:

1.  **Dynamic Schema Mapping:** It iterates over each attribute defined in the `ClassModel.schema`. For each attribute, it uses a `switch` statement on the `attribute.type` to dynamically instantiate the corresponding base Zod schema (`z.string()`, `z.number()`, `z.boolean()`, etc.).
2.  **Validation Rule Chaining:** It then programmatically chains Zod's refinement and validation methods based on the `attribute.config` properties. For example, `maxLength` is mapped to `.max()`, and non-mandatory fields are mapped to `.optional()`.
3.  **Asynchronous Refinement:** For the `foreign_key` type, an asynchronous `.refine()` method is applied. This method is passed a database connection and uses `Promise.all` to concurrently verify the existence of all specified document IDs in the referenced collection. This crucial step prevents invalid cross-document references.
4.  **Final Object Construction:** After processing all attributes, the method constructs and returns a single `z.object()` that contains all the dynamically generated fields, each with its type and validation rules configured.

The final result is stored in the `this.schema` property of the `Class` instance.

### 4\. Validation and Run-time Usage

Once a `Class` instance has been created, its `schema` property is a ready-to-use Zod object.

**Validation API:**

  * **`.parse(data)`:** Used for synchronous validation of an object against the schema. It will throw a `ZodError` if validation fails. This method is suitable for all fields except `foreign_key`.
  * **`.parseAsync(data)`:** **Must be used** for any validation that includes `foreign_key` fields. This method returns a promise that resolves on successful validation or rejects with a `ZodError` on failure.

**Type Safety:**
The hydrated Zod schema serves as a single source of truth for both run-time validation and compile-time type safety. Developers can use Zod's `z.infer` utility to extract a type from the hydrated schema, ensuring that their code is fully type-safe and consistent with the database model.

```typescript
// Get a type-safe interface for the User class
type UserType = z.infer<typeof userClass.schema>;
```