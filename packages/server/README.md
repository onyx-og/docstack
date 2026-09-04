[![Docs](https://img.shields.io/badge/docs-onyx--og.github.io-blue)](https://onyx-og.github.io/docstack/)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](https://github.com/onyx-og/docstack/blob/main/LICENSE.md)

# @docstack/server

> **Preview.** This package is not published and not yet active. The supported surface today is [`@docstack/client`](https://github.com/onyx-og/docstack/blob/main/packages/client/README.md), which is a complete database on its own. This page describes what a server node is *for* — read it as direction, not as documentation of something you can install.

## The premise: the same engine, somewhere else

DocStack's engine is the document model and the machinery around it — classes and validation, triggers, jobs, policies, field-level encryption, the SQL query engine, versioned patches, transactions, replication. **None of that is browser-specific.** It runs where you put it.

So `@docstack/server` is not a different product with a different data model. It is the same engine deployed on a host, carrying the **same feature set** as the client, over the same documents, speaking the same replication protocol. Everything in the [client's feature list](https://github.com/onyx-og/docstack/blob/main/packages/client/README.md#-features) applies here; this page will not restate it.

What changes is not the capabilities. It is the **scenarios** they unlock.

## What a server node makes possible

### A durable sync hub

Two devices can replicate directly, but only while both are awake. A server node is a peer that is *always* reachable, so devices converge through it on their own schedule — one writes at midnight, another picks it up at noon, and neither had to be online at the same moment.

That is also what turns personal sync into **shared workspaces**: a team's data needs somewhere that belongs to the team rather than to one member's laptop.

### Central authority, where a scenario needs one

A client is a peer, and a peer cannot be an authority over other peers. Some requirements need one anyway:

* **Policies evaluated where the user cannot reach them.** Client-side rules protect a user from mistakes; they cannot protect data from the person holding the device.
* **Guarantees that need a single decision point** — sequence numbers, cross-device uniqueness, quotas, anything where "both devices thought they were first" is a bug rather than a conflict.
* **Data no client should hold a full replica of** — because it is large, because it belongs to other tenants, or because it should never be on a laptop at all.

### Jobs on a host that is not asleep

The client scheduler is built for an application that is closed most of the time, with timers the browser freezes at will. It does well at that, and it cannot do the rest: nightly reports, retention sweeps, outbound integrations, batch recalculations, anything measured in minutes of CPU. A server node runs the same `~Job` documents under a scheduler that is simply *always there*.

### An integration surface

Third parties do not replicate; they call. A server node is where webhooks land, where an HTTP API over the same documents lives, where scheduled exports run, and where a credential that must never reach a browser can be held.

### Multi-tenant back office

Policies are documents scoped by group and user, so one deployment can serve many tenants under the access model that already exists — with the administrative surface, the reporting queries and the migration rollout all happening in one place rather than N devices.

## What stays true

A server node is a **peer, not an owner**:

* Same documents, same classes, same patches, same replication protocol.
* Applications keep working when it is unreachable. Offline is the client's normal operating mode, not a degraded one — the server being down is an inconvenience, not an outage.
* Encrypted attributes stay encrypted to it. A server holding ciphertext it cannot read is a supported and often preferable deployment.

This is the distinction worth holding onto: the client is not a cache in front of the real database. It *is* a database. The server is another one, positioned where a network makes it useful.

## What to use today

Everything above is direction. In the meantime, the sync layer in `@docstack/client` is transport-agnostic and already handles the common cases:

```typescript
// Any CouchDB-compatible endpoint
await stack.sync({ remote: 'https://example.com/my-app' });
```

For the serverless personal case — multi-device sync and backup with no server and no data custody — replicate to the user's own Drive with [`@docstack/pouchdb-adapter-googledrive`](https://github.com/onyx-ac/docstack-pouchdb-adapter-gdrive).

## Looking at the preview

The work in progress lives in [`src/`](./src) — an Express application (`stack.getApp()`), PouchDB/LevelDB and Cloudant database utilities, auth and crypto layers, a replication service, and the same class/attribute/trigger datamodel as the client. Generated API notes are in [`docs/`](./docs).

It is inspectable, and it is not finished. Treat it accordingly.

## License

[CC-BY-SA-4.0](https://github.com/onyx-og/docstack/blob/main/LICENSE.md) · © Onyx AC, LLC
