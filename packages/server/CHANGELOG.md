# Changelog

## 0.1.0 - unreleased

The rewrite (spec 03, ADR-0047). Nothing of the Express preview survives.

### Added - online mode

- `createServer(config)` and `ds init` / `ds serve`: a node that runs
  `@docstack/client` unchanged under Node, opens every configured stack with its
  patches and keys, and serves the **API surface** (`/s/:stack/_ds/*`): classes,
  domains, `find`, `query` (SQL), `docs`, `relations`, and a server-sent-events
  `feed`, every request under an engine session so reads narrow, writes attribute and
  refuse outside the session's scopes, and triggers see who is asking.
- Sessions from the node's own credential store (`POST /auth/session`, scrypt),
  bearer JWTs (HS256 secret and JWKS), Basic credentials; `grant(principal)` decides
  reachability per stack, with template patterns for stacks created on demand; a stack
  the grant does not name is 404.
- The authority: `msk` at rest encrypted under a passphrase, attribute keys minted at
  session issuance, the omni key that opens every scope for a trusted node, and
  entitlement decided per principal with the same CP-ABE mathematics a device runs.
- Configuration through `ds.config.js` with `DS_*` environment overrides and `_FILE`
  secrets; `memory` and `leveldb` storage; `/health`.
- Tests under `node --test`: the engine on Node, the API under two principals, the
  feed, reachability, sessions and the replica key hand-off.
