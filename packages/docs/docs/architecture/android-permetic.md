# Android (Permetic)

DocStack's Android story is not a rewrite of the client engine — it's a native document
store that a WebView-hosted web app talks to through
[Permetic](https://github.com/onyx-ac/permetic), a separate host project that runs the
web app in an Android `WebView` and grants it scoped, declared access to native
features. Permetic works standalone; DocStack is an optional capability it can register.

## Repository split

Permetic (`permetic`, `permetic-push`, `permetic-billing`, `permetic-web`) lives in its
own monorepo, outside this repository — Permetic owns the `WebView`, so it owns
provisioning, and DocStack never touches the `WebView` directly.

The DocStack-owned pieces live in **this** repository as git submodules:

| Module | Coordinates | Role |
| :----- | :---------- | :--- |
| [`docstack-store`](https://github.com/onyx-ac/docstack-store) | `ac.onyx.docstack:docstack-store` | Native document store + envelope dispatcher. Carrier-agnostic. |
| [`docstack-permetic`](https://github.com/onyx-ac/docstack-permetic) | `ac.onyx.docstack:docstack-permetic` | WebView carrier. Registers `StorageCapability` with Permetic. |
| [`docstack-headless`](https://github.com/onyx-ac/docstack-headless) | `ac.onyx.docstack:docstack-headless` | QuickJS/Zipline carrier. Replication with no WebView attached. |
| [`pouchdb-adapter-native`](https://github.com/onyx-ac/pouchdb-adapter-native) | npm `@docstack/pouchdb-adapter-native` | The PouchDB adapter. One implementation, carrier injected. |

```
docstack/
├── android/
│   ├── CLAUDE.md              # architecture overview, conventions, workflow
│   ├── specs/                 # numbered specs + adr/ (shared reference docs)
│   ├── docstack-store/        # submodule
│   ├── docstack-permetic/     # submodule
│   └── docstack-headless/     # submodule
└── packages/
    └── pouchdb-adapter-native/  # submodule
```

`android/specs/` and `android/CLAUDE.md` are regular tracked files (not submodules) so
the per-module `CLAUDE.md` in each submodule can reference them with a relative
`../specs/...` path.

## Why a native store at all

DocStack's browser storage backend is `pouchdb-browser` over IndexedDB (see
[Infrastructure](./infrastructure.md)). Inside a WebView, that data disappears when the
app clears WebView storage and can't be synced while the app is backgrounded or the
WebView isn't attached. `docstack-store` moves documents into a native store instead:

* **Never parses a revision tree.** Trees are opaque blobs it stores and returns —
  merge semantics stay in `pouchdb-merge`, in JS. Native code has no conflict-resolution
  logic to get wrong.
* **One protocol, two carriers.** The PouchDB adapter has no carrier branch in it;
  `docstack-permetic` (WebView attached) and `docstack-headless` (QuickJS/Zipline,
  replication with no WebView) both speak the same envelope protocol to the same store.
* **Independently optional.** A build can ship `docstack-store` without
  `docstack-permetic`, without a WebView, and without Permetic at all.

## Contract discipline

The capability contract (`permetic-web/src/index.d.ts`) lives in the external Permetic
repo and is the source of truth for what crosses the bridge. Contract drift is treated
as a compile error: adding a method means updating the contract, regenerating the
Kotlin dispatcher, and fixing every implementation — never one side only. See
`android/CLAUDE.md` for the full conventions (no JS string interpolation across the
bridge, `BridgeError` codes instead of raw exceptions, `suspend`/`Flow`-only public
APIs) and `android/specs/` for the per-module specs and ADRs.
