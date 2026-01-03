import { useState } from 'react'
import type { FormEvent } from 'react';
import './App.css'
import { StackProvider, useClassDocs, useClass } from "@docstack/react"

const DB_NAME = 'todo-app-db';

const PATCHES = [
  {
    "~class": "patch",
    version: "1.0.0",
    active: true,
    changelog: "Initial Todo Schema",
    docs: [
      {
        _id: "Todo",
        "~class": "class",
        active: true,
        name: "Todo",
        description: "A task to be completed",
        schema: {
          title: { name: "title", type: "string", config: { mandatory: true } },
          completed: { name: "completed", type: "boolean", config: { defaultValue: false } }
        }
      }
    ]
  },
  {
    "~class": "patch",
    version: "1.0.1",
    active: true,
    changelog: "Initial Todo Data",
    docs: [
      {
        _id: "task-1",
        "~class": "Todo",
        "active": true,
        title: "Initialize DocStack with Patches",
        completed: true
      },
      {
        _id: "task-2",
        "~class": "Todo",
        "active": true,
        title: "Render Todo List",
        completed: false
      },
      {
        _id: "task-3",
        "~class": "Todo",
        "active": true,
        title: "Add Interactivity",
        completed: false
      }
    ]
  }
];

function TodoList() {
  const { classObj: todoClass } = useClass(DB_NAME, 'Todo');
  const { docs: todos, loading } = useClassDocs(DB_NAME, 'Todo');
  console.log({todos});
  const [newTodo, setNewTodo] = useState("");

  const handleAdd = async (e: FormEvent) => {
     e.preventDefault();
     if (!newTodo.trim() || !todoClass) return;
     await todoClass.add({ title: newTodo, completed: false });
     setNewTodo("");
  };

  const handleToggle = async (todo: any) => {
     if (!todoClass) return;
     await todoClass.updateCard(todo._id, { ...todo, completed: !todo.completed });
  };

  if (loading) return <p>Loading Todos...</p>;

  return (
    <div className="card">
      <h2>My Checklist</h2>
      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left' }}>
        {todos.sort((a,b) => a._id.localeCompare(b._id)).map(todo => (
          <li key={todo._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <input 
              type="checkbox" 
              checked={todo.completed} 
              onChange={() => handleToggle(todo)}
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none', fontSize: '1.2em' }}>
              {todo.title}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <input 
          value={newTodo} 
          onChange={e => setNewTodo(e.target.value)} 
          placeholder="Add new item..."
          style={{ flex: 1, padding: '8px' }}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  )
}

function App() {
  return (
    <StackProvider config={[{ name: DB_NAME, patches: PATCHES }]}>
      <h1>DocStack Todo</h1>
      <TodoList />
    </StackProvider>
  )
}

export default App
