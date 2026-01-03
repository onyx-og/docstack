# @docstack/shared

**Common utilities, type definitions, and abstract base classes for the DocStack ecosystem.**

This package serves as the foundational layer for `@docstack/client` and other DocStack packages, ensuring consistency in data structures, schema definitions, and core logic across the stack.

It is designed to be **isomorphic**, meaning it runs seamlessly in browsers, Node.js, and edge runtimes.

## 📦 Installation

```bash
npm install @docstack/shared
```

## 🔧 What's Inside?

### 1. Core Type Definitions
TypeScript interfaces and types that define the shape of DocStack entities:
- **Schema Definitions**: Interfaces for `Class`, `Attribute`, `Domain`, and `Trigger`.
- **System Entities**: Types for `User`, `Group`, `Policy`, and `Job`.
- **Database Structures**: Common document shapes, metadata fields (`_id`, `_rev`, `~class`), and query structures.

### 2. Abstract Base Classes
Base classes that define the contract for core engines, allowing for platform-specific implementations (e.g., Browser vs. Server):
- **Crypto Interfaces**: Abstract definitions for encryption, decryption, and key derivation.
- **Storage Adapters**: Interfaces for underlying storage mechanisms.

### 3. Shared Utilities
Helper functions used across environments:
- **ID Generation**: Standardized UUID/ID generators.
- **Validation Helpers**: Common validation logic and Zod schema generators.
- **Constants**: System-wide constants (e.g., reserved system class names like `~Class`, `~Attribute`).

## 🤝 Usage

This package is primarily intended for internal use within DocStack packages or for developers building plugins and extensions for DocStack.

```typescript
import { IClass, SystemClassIds } from '@docstack/shared';

// Example: Using a shared interface for a Class definition
const taskClassDefinition: IClass = {
    _id: 'Class-Task',
    '~class': SystemClassIds.Class, // e.g., '~Class'
    name: 'Task',
    type: 'class',
    description: 'A user task',
    attributes: []
};
```

## 🏗️ Architecture

`@docstack/shared` has minimal dependencies to keep bundle sizes small and ensure broad compatibility. It acts as the source of truth for the DocStack data protocol.

---

Part of the DocStack project.