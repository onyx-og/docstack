A standalone, client-side datastore for web applications. This module provides a local, in-browser database built on PouchDB, leveraging the same data model and API structure as its docstack server counterpart. It is designed for offline-first applications and direct data management without requiring an active server connection.

## ✨ Features
Local Data Persistence: Utilizes PouchDB to store your structured data directly in the browser's storage.

Offline-First: Provides full read/write access to your data even without an internet connection.

Shared Data Models: Implements the same data model principles as the docstack server, ensuring consistency across your application stack.

Seamless Replication: Designed to be easily replicated with a CouchDB or docstack server instance when a connection is available.

## 📦 Installation
To add the client to your project, use your preferred package manager.

```bash
npm install @docstack/client
```

## 🚀 Usage
First, import and instantiate the DocstackClient with the desired database name. This will create or open a PouchDB database in the browser.

```js

import {DocStack} from '@docstack/client';

const client = new DocStack('local-ds');
```
Then, use the provided methods to interact with your local data. Most methods are asynchronous and return a Promise.

## ⏱️ Performance note: query execution with crypto engine

Recent profiling of the `test/query-execution.test.ts` integration suite shows a noticeable slowdown when the crypto engine is enabled. Stacks can opt out of client-side crypto by creating them with `disableCryptoEngine: true` in the stack configuration; this choice is persisted on first use and enforced on reopen, so it cannot be toggled later. With crypto disabled at stack creation, the suite completes in about **111 seconds** versus roughly **160 seconds** with encryption enabled, reflecting the additional encryption/decryption work performed inside the query pipeline. These timings were captured with `--runInBand` to avoid parallelism and under a 180-second Jest timeout for the suite.