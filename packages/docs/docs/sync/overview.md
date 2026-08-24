# Sync & backup

A DocStack stack is a local database first. Everything — validation, triggers,
policies, encryption, queries — runs in-process against storage on the device, with
no server in the path. That is what makes an application built on it work on a train
with no signal.

Sync is what makes it work on *two* devices, and what makes the data survive a lost
laptop.

```typescript
await stack.sync({
  remote: () => driveDb,
  direction: 'both',
  live: true,
  retry: true,
});
```

That is the whole API. What sits behind `remote` is up to you — and the first
supported answer is **your user's own Google Drive**.

## Backup without becoming a data custodian

The usual way to give an application multi-device sync is to run a server, store
everyone's data on it, pay for that storage, and take on responsibility for keeping
it safe. For a lot of applications — personal tools, note-taking, field work,
anything where the data belongs to one person — that trade is a bad one.

Syncing to the user's own Drive inverts it:

* **No infrastructure.** There is no server to deploy, scale, or keep patched.
* **No storage bill.** Each user's data sits in their own Drive quota.
* **No custody.** You never hold the data, so losing it or leaking it is not a risk
  you carry. Users can see the files, back them up, and take them elsewhere.
* **Real backup, not just sync.** A device that dies is replaced by a fresh install
  that pulls the stack back down.

The application supplies an OAuth access token and a folder. DocStack never learns
anything about Google — see [Google Drive](./google-drive.md).

## Encrypted fields stay encrypted

Attributes flagged `encrypted: true` (see
[Field-Level Encryption](../architecture/core-crypto.md)) are encrypted before they
are written to local storage, and they replicate **as ciphertext**. The key is
derived from the user's credentials and never leaves the device, so Drive holds
data that Google — and you — cannot read.

This is a property of how sync reads the database, not a separate feature to switch
on: replication reads documents exactly as they are stored rather than through the
decrypting read path the application uses.

## Offline-first, still

Sync does not change what happens when connectivity is gone; it changes what
happens when it comes back. Writes keep landing locally and keep being validated.
When the remote is reachable again, `retry: true` reconnects on its own and the
replicas converge.

Conflicting edits on two devices converge on the same winning revision on both
sides, deterministically — DocStack does not pick one device as authoritative.

## One API, more transports later

`remote` is a PouchDB database, so the sync layer is not tied to Drive. Google Drive
is the personal, multi-device transport — a Drive folder belongs to one Google
account, so it syncs *your* devices, not a team. Team and self-hosted transports
are planned against this same lifecycle: a different remote factory, the same
`stack.sync()` call, the same status surface (see
[Goals & roadmap](../get-started/goals.md)).

## Many databases, one call

Applications that open a database per workspace or per project do not need a loop
that has to be kept in step with their own stack list:

```typescript
const sync = await docstack.sync({
  remote: (stack) => driveFor(stack.name),
  live: true,
});
```

The resolver is called once per stack. Stacks opened later with
`docstack.addStack(...)` get their own `stack.sync(...)`.

## Showing sync state

Every stack reports where it stands, and the one value worth putting in front of a
user is `lastConvergedAt` — the moment a cycle finished with *nothing left to send*.
It is the honest answer to "am I backed up?", where `lastActiveAt` only says
documents moved recently.

```tsx
import { useSyncStatus } from '@docstack/react';

const SyncBadge = ({ stack }: { stack: string }) => {
  const status = useSyncStatus(stack)[stack];

  if (!status) return <span>Not syncing</span>;
  if (status.state === 'error') return <span>Offline — retrying</span>;
  if (status.state === 'denied') return <span>Reconnect your Google account</span>;

  return (
    <span>
      {status.state === 'active' ? 'Syncing…' : 'Synced'}
      {status.lastConvergedAt && ` · ${timeAgo(status.lastConvergedAt)}`}
    </span>
  );
};
```

`state` is one of `stopped`, `starting`, `active`, `idle`, `error`, `denied`.
`error` is usually temporary — a retrying replication reconnects by itself.
`denied` is not: the remote refused a write, which normally means the credential
needs renewing.

## What is safe to replicate

DocStack keeps its own bookkeeping off the wire automatically — the system record,
the encryption marker, Mango indexes, propagation locks, sessions, the patch
ledger. Replicating those is never right, and the list is DocStack's to know rather
than yours to guess.

You can narrow things further by class, or with your own predicate. See
[What replicates](./filtering.md).

## Guardrails

Two things the sync layer refuses to do, both on purpose:

**It will not pull from a remote written by a newer build.** If another device has
applied schema patches this one has not, `stack.sync()` rejects with
`SyncSchemaMismatchError` rather than pulling documents this build cannot read.
Ship the update, then sync.

**It will not let application code replicate into a stack by hand.** Writing with
`new_edits: false` — what replication does — skips validation, relations and
triggers. On `stack.db` that throws `StackWriteGuardError` and points you at
`stack.sync()`, which does it correctly.

## Status

The client sync layer is implemented and covered by unit and integration suites; an
end-to-end run against real Google Drive with two devices is still outstanding.
Packages are not yet on a registry — see [Installation](../get-started/installation.md).
Treat this as usable and actively hardening rather than settled.
