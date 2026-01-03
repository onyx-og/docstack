# @docstack/react

React bindings for **DocStack Client**, enabling seamless integration of the intelligent, offline-first database engine into React applications.

This package provides a context provider and hooks to initialize the database, subscribe to data changes, and perform write operations.

## 📦 Installation

```bash
npm install @docstack/react @docstack/client
```

## 🚀 Usage

### 1. Setup the Provider

Wrap your application root with `<StackProvider>`. This component initializes the DocStack engine and applies any schema patches provided in the configuration.

```tsx
import { StackProvider } from "@docstack/react";

const DB_NAME = 'my-app-db';

// Define schema patches (versioned changes to your data model)
const PATCHES = [
  {
    "~class": "patch",
    version: "1.0.0",
    active: true,
    docs: [
      {
        _id: "Todo",
        "~class": "class",
        name: "Todo",
        schema: {
          title: { name: "title", type: "string", config: { mandatory: true } },
          completed: { name: "completed", type: "boolean", config: { defaultValue: false } }
        }
      }
    ]
  }
];

function App() {
  return (
    <StackProvider config={[{ name: DB_NAME, patches: PATCHES }]}>
      <MyComponent />
    </StackProvider>
  );
}
```

### 2. Read Data (Reactive)

Use the `useClassDocs` hook to fetch documents for a specific class. This hook automatically subscribes to changes, so your component re-renders whenever the underlying data changes.

```tsx
import { useClassDocs } from "@docstack/react";

function TodoList() {
  // Fetch all documents of class 'Todo' from 'my-app-db'
  const { docs: todos, loading } = useClassDocs('my-app-db', 'Todo');

  if (loading) return <p>Loading...</p>;

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo._id}>
          {todo.title} {todo.completed ? '✅' : '⭕'}
        </li>
      ))}
    </ul>
  );
}
```

### 3. Write Data

Use the `useDocStack` hook to access the underlying DocStack client instance for creating, updating, or deleting data.

```tsx
import { useState } from 'react';
import { useClass } from "@docstack/react";

function AddTodo() {
  const { classObj: todoClass } = useClass('my-app-db', 'Todo');
  const [title, setTitle] = useState("");

  const handleAdd = async () => {
    if (!todoClass || !title) return;
    
    // Add the new document
    await todoClass.add({ title, completed: false });
    
    setTitle("");
  };

  return (
    <div>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <button onClick={handleAdd}>Add Task</button>
    </div>
  );
}
```

## 📚 API Reference

### `<StackProvider />`

The context provider that manages the lifecycle of the DocStack client.

| Prop | Type | Description |
|------|------|-------------|
| `config` | `Array<{ name: string, patches: any[] }>` | Configuration for initializing stacks, including database names and schema patches. |

### `useClassDocs(dbName: string, className: string)`

A hook that subscribes to a specific class in the database.

- **Arguments**:
  - `dbName`: The name of the database stack.
  - `className`: The name of the class to query.
- **Returns**:
  - `docs`: An array of documents belonging to the class.
  - `loading`: A boolean indicating if the initial data load is in progress.

### `useClass(dbName: string, className: string)`

A hook that retrieves the class definition for writing data.

- **Arguments**:
  - `dbName`: The name of the database stack.
  - `className`: The name of the class.
- **Returns**:
  - `classObj`: The class instance used for operations like `add` or `updateCard`.
  - `loading`: Boolean indicating if the class is loading.

### `useDocStack()`

A hook that returns the initialized DocStack client instance.

- **Returns**: The `DocStack` instance (or `null` if not yet initialized). Use this to access `getStack()`, run queries, or execute jobs.

### `useQuerySQL(dbName: string, sql: string, ...params: any[])`

A hook to execute SQL queries against the local database.

- **Arguments**:
  - `dbName`: The name of the database stack.
  - `sql`: The SQL query string.
  - `params`: Variable arguments for query parameters.
- **Returns**:
  - `result`: An object containing `rows` (the query results).
  - `loading`: Boolean indicating execution status.

### `useFind(dbName: string, query: { selector: object, fields?: string[] })`

A hook to find documents using a MongoDB-style selector.

- **Arguments**:
  - `dbName`: The name of the database stack.
  - `query`: An object with a `selector` property (Mango query syntax).
- **Returns**:
  - `docs`: An array of matching documents.
  - `loading`: Boolean indicating if the search is in progress.

### `useClassList(dbName: string, selector: object)`

A hook to retrieve a list of available classes (schemas) in the database.

- **Arguments**:
  - `dbName`: The name of the database stack.
  - `selector`: A filter object to select specific classes.
- **Returns**:
  - `classList`: An array of `Class` instances.
  - `loading`: Boolean indicating if the list is loading.

### `useClassCreate(dbName: string)`

A hook that returns a function to create new classes dynamically.

- **Arguments**:
  - `dbName`: The name of the database stack.
- **Returns**:
  - A function `(className: string, description?: string) => Promise<Class>` to create a new class.