# @docstack/pouchdb-adapter-channel

PouchDB replication over a message channel. Built for the hub architecture
(ADR-0030): every realm keeps a traditional local PouchDB, and databases
*replicate* with each other across realms — a transfer adapter, not a storage
proxy.

Three parts, deliberately separable:

| part | what it is |
| :--- | :--- |
| **driver half** | A PouchDB adapter (`adapter: "channel"`) presenting a database that lives across the channel. Zero storage logic — the far end is a real PouchDB, so rev trees, winner selection and sequence discipline are all native there. Built to be the `remote` of `stack.sync()`. |
| **host half** | `serveChannel(db, transport, grant)` — binds a channel to any local PouchDB and enforces that channel's grant, two-sided: `serve` guards what leaves, `accept` guards what arrives. One call per channel; a hub calls it N times with N grants. |
| **transport bindings** | `createMessagePortTransport` (hub/iframe/SharedWorker), `createLoopbackPair` (tests, same-realm). New topologies are new bindings, never changes to the halves. |

```typescript
// Hub realm: serve a stack to one origin's channel, scoped.
serveChannel(hubDb, createMessagePortTransport(port), {
    serve: doc => grant.allows(doc),
    accept: doc => grant.allows(doc),
});

// App realm: replicate against it.
PouchDB.plugin(ChannelPlugin());
const remote = new PouchDB("workspace", {
    adapter: "channel",
    channel: createMessagePortTransport(myPort),
});
stack.sync({ remote: () => remote });
```

Properties the tests pin down: replication carries **all leaves**, never just
winners; checkpoints land on the host, so replication resumes instead of
restarting; tombstones always travel, whatever the scope; a scope-refused write
surfaces as a denied write, not a silent drop; `destroy` over a channel is
refused unless the grant says otherwise.

Not here on purpose: rendezvous, role assignment and topology (pair, hub star,
mesh, healing) live above this package — ADR-0030 Decision 7 makes topology the
consumer's composition, and this package is only ever one link of it.
