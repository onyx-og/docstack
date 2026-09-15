[![Docs](https://img.shields.io/badge/docs-onyx.ac-blue)](https://onyx.ac/products/docstack/docs)
[![License](https://img.shields.io/badge/license-CC--BY--SA--4.0-lightgrey)](https://github.com/onyx-og/docstack/blob/main/LICENSE.md)

# @docstack/server

**DocStack on a host: one engine, two surfaces.** Rewrite in progress against [spec 03](https://github.com/onyx-og/docstack/blob/main/specs/03-server.md) and [ADR-0047](https://github.com/onyx-og/docstack/blob/main/specs/adr/0047-the-server-is-a-peer-and-a-service.md); not published yet.

The daemon runs `@docstack/client` unchanged under Node and exposes it twice:

- an **API surface** (`/s/:stack/_ds/*`) for online clients and integrations, where every request runs under an [engine session](https://onyx.ac/products/docstack/docs/guides/sessions) and the authoring pipeline runs on the host; a thin `RemoteStack` in `@docstack/client` opens a stack against it and replicates nothing;
- a **Couch-compatible replication surface** (`/s/:stack/*`) that PouchDB's http adapter drives unchanged, for clients that want a local replica (next phase).

The host is also the authority (it mints attribute keys at login), runs jobs, hosts the workbench and mirrors upstream through the engine's own sync.

```bash
npx @docstack/server init     # ds.config.js, the authority's master pair, the node secret
npx @docstack/server serve
```

Tests: `npm test` (Node's built-in runner against the built `lib/`).

## License

[CC-BY-SA-4.0](https://github.com/onyx-og/docstack/blob/main/LICENSE.md) · © Onyx AC, LLC
