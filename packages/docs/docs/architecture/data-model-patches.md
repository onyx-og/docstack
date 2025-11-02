# DocStack Patch Management System (DPMS)

The DocStack Patch Management System (DPMS) ensures the core framework and application schemas are consistently updated and versioned across all client environments (browser and Node.js). It uses static TypeScript files to store patch definitions, allowing seamless integration and execution during application startup without relying on file system operations.

-----

## Core Concepts

The DPMS operates around two core data entities:

1.  **`~Patch` Documents**: Define the actual schema or system changes.
2.  **`~SysRepository` Document**: Tracks the current applied system version.

### 1\. `~Patch` Document Structure

Patches are defined as **TypeScript constants** within the framework source, and upon execution, they are upserted into the database as `~Patch` documents.

| Field | Type | Description | Primary Key (PK) |
| :--- | :--- | :--- | :--- |
| **`_id`** | `string` | Unique identifier for the patch (e.g., `sys-001`). | |
| **`type`** | `string` | Must be `~Patch`. | |
| **`target`** | `string` | The component or package the patch applies to. Valid values include `system` (for DocStack core changes) or any package name. | **Part of PK** |
| **`version`** | `string` | The semantic version number of the patch (e.g., `0.0.1`). | **Part of PK** |
| `changelog` | `string` | Markdown-formatted description of the patch contents. | |
| `docs` | `array` | An array of DocStack schema definitions (`class` documents) to be created or modified by the patch. | |

> **Note:** The combination of `target` and `version` effectively acts as a composite primary key, ensuring a specific patch is only considered once for a given component.

### 2\. `~SysRepository` Document

A single, unique document with the ID `~system` (or similar ID for multi-client nodes) that tracks the status of the core system.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `string` | Unique ID, typically `~system`. |
| `type` | `string` | Must be `~SysRepository`. |
| **`version`** | `string` | **The currently applied system patch version.** This is the critical reference point for the patching algorithm. |
| `dbInfo` | `object` | PouchDB database information at startup. |
| `startupTime` | `number` | Timestamp of the application start. |

-----

## Implementation Details

### 1\. Patch Definition and Consumption

1.  **Definition**: Patches are defined as exported `const` objects in TypeScript files (e.g., `patches/system.ts`).
    ```typescript
    const sys_001 = { /* ... patch content ... */ };
    export const sysPatches = [sys_001, sys_002, ...]; // Array of all system patches
    ```
2.  **Upsert**: During DocStack's bootstrap phase, the utility function processes the `sysPatches` array. For each patch object, it performs an **upsert** operation (or `put` with a new revision) into the PouchDB database as a `~Patch` document. This ensures the available patches are always present in the database.

### 2\. The Patch Application Trigger

The core logic for applying patches is executed via a **trigger** defined on the `~Patch` class. This trigger fires whenever a new or updated `~Patch` document is added to the database.

#### Algorithm Steps:

1.  **Retrieve Current Version**: The trigger first retrieves the single `~SysRepository` document (`_id: "~system"`) to get the **current applied version** from the `version` field. If the document doesn't exist, the current version is treated as **`0.0.0`**.
2.  **Identify Missing Patches**:
      * It uses a **PouchDB `find` query** to fetch all available `~Patch` documents (`type: "~Patch"`, `target: "system"`).
      * The patches are then filtered based on their `version` using **Semantic Versioning (SemVer)** rules. Only patches where `patch.version` is **greater than** the `~SysRepository.version` are selected.
      * The selected patches are then sorted by their SemVer to ensure they are applied in correct chronological order.
3.  **Apply Patches**:
      * The trigger iterates through the sorted list of missing patches.
      * For each patch:
          * It processes the definitions in the `docs` array, creating or updating the schema documents in the database.
          * The `~SysRepository` document's `version` field is updated to the `version` of the currently applied patch. This update should be done as a final step to guarantee atomicity and track progress.
4.  **Error Handling**: If any step in the application of a patch fails, the process **stops**, and the system remains at the last successfully applied version, ensuring database consistency.

### 3\. Development Workflow: Re-applying Patches

To re-apply a set of patches (e.g., during development after a patch has been edited):

1.  Retrieve the `~SysRepository` document (`_id: "~system"`).
2.  Manually **change the `version` field** to a version *lower* than the first patch you need to re-apply (e.g., change `1.0.0` to `0.9.9`).
3.  Save the updated `~SysRepository` document.
4.  Restart the DocStack application. The patch application trigger will detect the current version is lower than available patches and re-apply all necessary patches in sequence.

-----

## Future Considerations

  * **Multi-Node Patching**: For multi-node environments, the `_id` of the system repository document and the `target` field in the patch could be extended to allow version tracking and patching for specific client/node configurations.
  * **Custom Patching**: The `target` field allows users to define and version their own application schema patches alongside the system patches, using the same robust mechanism.
