import { useEffect, useState } from 'react'
import './App.css'
import { StackProvider, useDocStack } from "@docstack/react"

const DB_NAME = 'my-app-db';

function DbInfo() {
  const docStack = useDocStack();
  const [dbInfo, setDbInfo] = useState<any>(null)

  useEffect(() => {
    if (docStack) {
      const stack = docStack.getStack(DB_NAME);
      if (stack) {
        stack.getDbInfo().then((info: any) => {
          console.log(info)
          setDbInfo(info)
        })
      }
    }
  }, [docStack])

  return (
    <div className="card">
      {dbInfo ? (
        <pre style={{ textAlign: 'left' }}>{JSON.stringify(dbInfo, null, 2)}</pre>
      ) : (
        <p>Loading DocStack...</p>
      )}
    </div>
  )
}

function App() {
  return (
    <StackProvider config={[DB_NAME]}>
      <h1>DocStack Client Demo</h1>
      <DbInfo />
    </StackProvider>
  )
}

export default App
