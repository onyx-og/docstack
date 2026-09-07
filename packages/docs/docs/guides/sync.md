---
title: "Sync to a remote"
description: "Replicate a stack to any PouchDB-compatible remote with one call, show honest sync state, sync many databases at once, and understand the two guardrails the sync layer refuses to relax."
sidebar_position: 8
---

A DocStack stack is a local database first. Everything, validation, triggers, encryption, queries, runs in-process against storage on the device, with no server in the path. That is what makes an application built on it work on a train with no signal.

Sync is what makes it work on *two* devices, and what makes the data survive a lost laptop.

```typescript
const sync = await stack.sync({
    remote: 'https://example.com/my-app',   // a URL, a PouchDB instance, or a resolver function
    direction: 'both',                       // default
    live: true,                              // default: keep following changes
    retry: true,                             // default: reconnect on transient failure
});
```

That is the whole API. What sits behind `remote` is up to you: any CouchDB-compatible endpoint, another PouchDB database, or the user's own [Google Drive](./google-drive.md).

## Backup without becoming a data custodian

The usual way to give an application multi-device sync is to run a server, store everyone's data on it, pay for that storage, and take on responsibility for keeping it safe. For a lot of applications, personal tools, note-taking, field work, anything where the data belongs to one person, that trade is a bad one.

Syncing to the user's own Drive inverts it:

- **No infrastructure.** There is no server to deploy, scale, or keep patched.
- **No storage bill.** Each user's data sits in their own Drive quota.
- **No custody.** You never hold the data, so losing it or leaking it is not a risk you carry. Users can see the files, back them up, and take them elsewhere.
- **Real backup, not just sync.** A device that dies is replaced by a fresh install that pulls the stack back down.

The application supplies an OAuth access token and a folder. DocStack never learns anything about Google.

## Encrypted fields stay encrypted

Attributes flagged `encrypted: true` are encrypted before they are written to local storage, and they replicate **as ciphertext**. The document key is supplied by the application and stays on the device, so the remote holds data that its operator, and you, cannot read. This is a property of how sync reads the database, not a separate feature to switch on: replication reads documents exactly as they are stored rather than through the decrypting read path the application uses. See [Encrypt fields](./encrypt-fields.md).

## Offline-first, still

Sync does not change what happens when connectivity is gone; it changes what happens when it comes back. Writes keep landing locally and keep being validated. When the remote is reachable again, `retry: true` reconnects on its own and the replicas converge.

Conflicting edits on two devices converge on the same winning revision on both sides, deterministically. DocStack does not pick one device as authoritative, and it does not yet offer application-level conflict resolution beyond PouchDB's winner.

## The options

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `remote` | required | A URL, a `PouchDB` instance, or `(stack) => remote`, called again on every `restart()`. |
| `direction` | `'both'` | `'push'`, `'pull'` or `'both'`. |
| `live` | `true` | Keep following changes, or run once and stop. |
| `retry` | `true` | Reconnect with PouchDB's backoff after a transient failure. |
| `classes` | all | `{ include?, exclude?, includeDataModel? }`; see [Filter what replicates](./filtering.md). |
| `filter` | none | An extra pure predicate, ANDed with everything else. |
| `internalDocs` | DocStack's defaults | Which of the stack's own documents stay local; `false` replicates everything. |
| `checkSchemaVersion` | `true` | Refuse a remote written by a newer schema (below). |
| `batchSize`, `batchesLimit`, `heartbeat`, `timeout` | PouchDB's | Passed through to PouchDB replication. |

`remote` is a function on purpose. DocStack calls it again on every `sync.restart()`, so a refreshed credential reaches the new replication without your auth code and DocStack having to know about each other.

## The handle

`stack.sync()` returns a `StackSyncHandle`:

| Member | What it does |
| :--- | :--- |
| `getStatus()` | The current `SyncStatus` (below). |
| `getRemote()` | The resolved remote database, or `null`. |
| `cancel()` | Stop replicating. |
| `restart()` | Cancel, resolve `remote` again, start. Counters and `lastConvergedAt` survive. |
| `waitForConvergence(timeoutMs = 30000)` | Resolves with the status when a cycle finishes with nothing left to send. |

The handle dispatches `status`, `change`, `idle`, `error`, `denied` and `complete` events. The stack itself dispatches `sync-status` with the same detail, which is what `useSyncStatus` listens to; `stack.getSyncStatus()` and `stack.getSyncHandle()` read the same state without an event.

## Showing sync state

Every stack reports where it stands, and the one value worth putting in front of a user is `lastConvergedAt`: the moment a cycle finished with *nothing left to send*. It is the honest answer to "am I backed up?", where `lastActiveAt` only says documents moved recently.

```typescript
interface SyncStatus {
    stack: string;
    state: 'stopped' | 'starting' | 'active' | 'idle' | 'error' | 'denied';
    direction: 'push' | 'pull' | 'both';
    live: boolean;
    lastConvergedAt: number | null;
    lastActiveAt: number | null;
    lastError: { name?: string; message: string; status?: number } | null;
    pushed: number;
    pulled: number;
}
```

`error` is usually temporary: a retrying replication reconnects by itself. `denied` is not: the remote refused a write, which normally means the credential needs renewing. From React:

```tsx
import { useSyncStatus } from '@docstack/react';

const SyncBadge = ({ stack }: { stack: string }) => {
    const status = useSyncStatus(stack)[stack];

    if (!status) return <span>Not syncing</span>;
    if (status.state === 'error') return <span>Offline, retrying</span>;
    if (status.state === 'denied') return <span>Reconnect your account</span>;

    return (
        <span>
            {status.state === 'active' ? 'Syncing…' : 'Synced'}
            {status.lastConvergedAt && ` · ${timeAgo(status.lastConvergedAt)}`}
        </span>
    );
};
```

## Many databases, one call

Applications that open a database per workspace or per project do not need a loop that has to be kept in step with their own stack list:

```typescript
const sync = await docstack.sync({
    remote: (stack) => new PouchDB(`https://example.com/${stack.name}`),
    live: true,
});

sync.addEventListener('status', () => render(sync.getStatus()));   // one badge, however many stacks
```

The resolver is called once per stack. An un-scoped `docstack.sync()` is a standing instruction: a stack opened later with `docstack.addStack(...)` joins the running replication before it is announced, so a workspace mounted a second after `sync()` is not silently left out. Pass `stacks: ['a', 'b']` to bind a fixed list instead. `docstack.getSyncCoverage()` returns `{ bound, unbound }` so an idle stack and an unbound one can be told apart; `docstack.cancelSync()` stops everything and clears the instruction.

The returned `DocStackSyncHandle` holds one handle per stack (`handles`, `names`), aggregates `getStatus()` into a map, and exposes `getLastConvergedAt()`, the *oldest* convergence across every stack, which is the honest answer to "is everything backed up".

## What is safe to replicate

DocStack keeps its own bookkeeping off the wire automatically: the system record, the encryption marker, Mango indexes, propagation locks, sessions, the patch ledger, job runs, its own log records, and documents of classes declared `ephemeral`. Replicating those is never right, and the list is DocStack's to know rather than yours to guess; it is spelled out in [What stays on the device](../reference/internal-documents.md).

You can narrow things further by class, or with your own predicate. See [Filter what replicates](./filtering.md).

## The schema gate

A remote records the highest system and consumer patch versions that wrote it, in a `_local/docstack-sync` document that every device talking to that remote reads and no device replicates. Before replicating, `stack.sync()` compares both sides. **It will not pull from a remote written by a newer build**: if another device has applied patches this one has not, the call rejects with `SyncSchemaMismatchError` rather than pulling documents this device cannot describe.

```typescript
try {
    await stack.sync({ remote: () => driveDb });
} catch (error) {
    if (error.name === 'SyncSchemaMismatchError') {
        // error.scope is 'system' (update the app) or 'consumer' (apply your patches; a locked
        // device applies deferred ones on unlock). error.remoteVersion and error.localVersion say how far apart.
        showUpdatePrompt(error);
    }
}
```

A locked device whose patches are deferred does not claim the schema it has not installed, so it refuses at the gate until unlock replays them. `checkSchemaVersion: false` disables the gate for a remote you are deliberately mirroring.

## The write guard

**It will not let application code replicate into a stack by hand.** Writing with `new_edits: false`, which is what replication does, skips validation, relations, triggers and encryption. On `stack.db` that throws `StackWriteGuardError` and points you at `stack.sync()`, which does it correctly. The `_`-prefixed adapter methods beneath the plugin are guarded the same way.

## Status

The client sync layer is implemented and covered by unit and integration suites, and Drive replication is verified against production Drive by the adapter's own tests. An end-to-end run against real Google Drive with two devices is still outstanding on the DocStack side. Treat this as usable and actively hardening rather than settled.

Every option, status field and error is listed in [Sync options and status](../reference/sync-options.md); the model behind it is in [Offline-first and the sync model](../concepts/offline-first-and-sync.md).
