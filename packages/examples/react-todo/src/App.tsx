import { useMemo, useState } from 'react'
import type { FormEvent } from 'react';
import './App.css'
import { typedClass } from "@docstack/client"
import { StackProvider, useClassDocs, useDocStack } from "@docstack/react"
import { Todo, type TodoDoc } from './model.js'
import { patches } from './patches/index.js'

const DB_NAME = 'todo-app-db';

/**
 * The priorities a task can be given, read off the declaration itself.
 *
 * A declared class is data as well as types, so the picker cannot drift from the enum:
 * adding a member in `model.ts` adds the option here, and the array's element type is
 * the same union `TodoDoc['priority']` holds.
 */
const PRIORITIES = Todo.attributes.priority.config.values.map(member => member.value);

function TodoList() {
  const docStack = useDocStack();
  // `useClassDocs` passed the declared class rather than the name "Todo": `todos` is
  // `TodoDoc[]` instead of `Document[]`, so `todo.title` is a string and `todo.completed`
  // is a boolean that is always there. Writes are the exact side; a read still allows an
  // undeclared name, because a document carries fields no class declares.
  const { docs: todos, loading } = useClassDocs(DB_NAME, Todo);

  // The write surface. Built from the stack rather than awaited: `typedClass` resolves
  // the class on each call, so this is safe to make the moment the provider has a stack.
  const todoClass = useMemo(() => {
    const stack = docStack?.getStack(DB_NAME);
    return stack ? typedClass(stack, Todo) : null;
  }, [docStack]);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<NonNullable<TodoDoc['priority']>>('normal');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !todoClass) return;
    // `completed` is not passed: it declares a default, so the engine writes `false`.
    // Omitting `title` or passing a priority outside the enum would not compile.
    await todoClass.addCard({ title, priority });
    setTitle("");
    setPriority('normal');
  };

  const handleToggle = async (todo: TodoDoc) => {
    if (!todoClass) return;
    await todoClass.updateCard(todo._id, { completed: !todo.completed });
  };

  if (loading) return <p>Loading Todos...</p>;

  return (
    <div className="card">
      <h2>My Checklist</h2>
      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left' }}>
        {[...todos].sort((a, b) => a._id.localeCompare(b._id)).map(todo => (
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
            <small style={{ opacity: 0.6 }}>
              {todo.priority}
              {/* An ISO-8601 string, which is what a date attribute stores. */}
              {todo.dueOn ? ` · due ${todo.dueOn}` : ''}
            </small>
          </li>
        ))}
      </ul>
      <form onSubmit={handleAdd} style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Add new item..."
          style={{ flex: 1, padding: '8px' }}
        />
        <select
          value={priority}
          // Matched against the declared members rather than cast: a `<select>` hands
          // back a plain string, and `find` narrows it to the union for free.
          onChange={e => setPriority(PRIORITIES.find(value => value === e.target.value) ?? 'normal')}
          style={{ padding: '8px' }}
        >
          {PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="submit">Add</button>
      </form>
    </div>
  )
}

function App() {
  return (
    <StackProvider config={[{ name: DB_NAME, patches }]}>
      <h1>DocStack Todo</h1>
      <TodoList />
    </StackProvider>
  )
}

export default App
