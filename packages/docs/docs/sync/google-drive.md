# Google Drive

Sync and back up a stack to the user's own Google Drive. DocStack supplies the
lifecycle; `@docstack/pouchdb-adapter-googledrive` supplies the transport; your
application supplies the OAuth token.

:::note
Packages are not yet published to a registry — see
[Installation](../get-started/installation.md). The usage below is what the API
looks like today.
:::

## The shape of it

Three pieces, and the boundary between them is deliberate:

| Piece | Owns |
| :--- | :--- |
| Your application | The Google OAuth flow, the access token, and its renewal. |
| `@docstack/pouchdb-adapter-googledrive` | Reading and writing Drive files as a PouchDB database. |
| `@docstack/client` | What replicates, when it is safe to start, and what state to show. |

DocStack never sees a token, a scope, or a folder id. The adapter never sees your
schema. That is why adding a second transport later is a change to one factory
function rather than to your sync code.

## Register the adapter

The adapter is a PouchDB plugin. Register it once, at startup:

```typescript
import PouchDB from 'pouchdb-browser';
import GoogleDriveAdapter from '@docstack/pouchdb-adapter-googledrive';

PouchDB.plugin(GoogleDriveAdapter({
  // Called whenever the adapter needs a token, so renewal is yours to control
  // and DocStack stays out of it entirely.
  accessToken: async () => auth.getAccessToken(),
}));
```

:::warning
Registration is global: a second `GoogleDriveAdapter({...})` call replaces the
first for every database opened afterwards. Register once with a token *function*,
and pass anything that varies — the folder, for instance — per database, where
constructor options take precedence.
:::

## Scopes

`https://www.googleapis.com/auth/drive.file` is enough, and is the right choice:
it grants access only to files your application created, so the user is not asked
to hand over their whole Drive.

## Open a remote and sync

```typescript
const driveDb = new PouchDB('my-app', {
  adapter: 'googledrive',
  folderName: 'my-app',
});

const sync = await stack.sync({
  remote: () => driveDb,
  direction: 'both',
  live: true,
  retry: true,
});
```

`remote` is a **function** on purpose. DocStack calls it again on every
`sync.restart()`, so a refreshed credential reaches the new replication without
your auth code and DocStack having to know about each other:

```typescript
auth.addEventListener('token-refreshed', () => sync.restart());
```

Counters and `lastConvergedAt` survive the restart.

## A database per workspace

Applications that open a stack per workspace can sync them all in one call, with a
folder each:

```typescript
const sync = await docstack.sync({
  remote: (stack) => new PouchDB(stack.name, {
    adapter: 'googledrive',
    folderName: `my-app/${stack.name}`,
  }),
  live: true,
  retry: true,
});

sync.addEventListener('status', () => render(sync.getStatus()));
```

`sync.getLastConvergedAt()` gives the *oldest* convergence across every stack —
the honest answer to "is everything backed up", rather than the most recent one.

A workspace joined later gets a stack and a replication without a reload:

```typescript
const stack = await docstack.addStack({ name: `ws-${workspace.slug}`, patches });
await stack.sync({ remote: () => driveFor(workspace), live: true, retry: true });
```

If you drive stacks from `StackProvider`'s `config` prop, adding an entry is
enough — the provider opens what appeared and closes what disappeared, leaving the
stacks either side of the change running.

## Restoring on a new device

Restore is a pull against the same folder, into a fresh stack:

```typescript
const stack = await docstack.addStack({ name: 'my-app', patches });

const sync = await stack.sync({
  remote: () => driveDb,
  direction: 'pull',
  live: false,
});

await sync.waitForConvergence();
```

Two things to expect. First, the new device applies its own patches locally before
syncing, so its data model is already in place; sync brings the documents.
Second, if the Drive folder was last written by a **newer** build of your
application, `stack.sync()` rejects with `SyncSchemaMismatchError` rather than
pulling documents this build cannot read:

```typescript
try {
  await stack.sync({ remote: () => driveDb, direction: 'pull' });
} catch (error) {
  if (error.name === 'SyncSchemaMismatchError') {
    showUpdatePrompt(error.remoteVersion, error.localVersion);
  }
}
```

## Encrypted attributes

Attributes flagged `encrypted: true` reach Drive as ciphertext. The key derives
from the user's credentials and stays on the device, so the folder holds data
neither Google nor you can read. No configuration — replication reads the database
as stored rather than through the decrypting path your queries use.

Everything else replicates as written, so a field only Drive should not see needs
to actually be flagged.

## Errors worth handling

| State | Meaning | What to do |
| :--- | :--- | :--- |
| `error` | Transient — network gone, request failed. | Nothing. `retry: true` reconnects. Show "offline". |
| `denied` | The remote refused a write. | Usually an expired or under-scoped token. Re-auth, then `restart()`. |
| `SyncSchemaMismatchError` | Drive was written by a newer build. | Prompt for an app update. Local data is untouched. |

## Limits

* **Drive is per Google account**, so it syncs one person's devices. It is not a
  team transport, and sharing a folder is not a substitute for one.
* **No attachments yet.** Documents only.
* **Filtering is not access control** — see [What replicates](./filtering.md).
* An **end-to-end two-device run against real Drive** is still outstanding on the
  DocStack sync layer, though the adapter's own replication is verified against
  production Drive.
