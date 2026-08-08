# permetic-android

**Permetic** runs a web app in an Android WebView and grants it scoped, declared
access to native features. The web app runs unchanged.

Permetic works standalone. `docstack-*` is optional, and when registered it adds a
`storage` capability: a document-level store that DocStack's PouchDB adapter talks to.
Permetic owns the WebView, so Permetic owns provisioning — DocStack never touches the
WebView directly.

| Module              | Coordinates / package                    | Role                                                          |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `permetic`          | `ac.onyx.permetic:permetic-core`         | WebView host. Runs the web app, grants scoped native access.   |
| `permetic-push`     | `ac.onyx.permetic:permetic-push`         | FCM capability. Optional artifact.                             |
| `permetic-billing`  | `ac.onyx.permetic:permetic-billing`      | Play Billing capability. Optional artifact.                    |
| `permetic-web`      | npm `permetic`                           | Contract types + JS runtime that builds the global.            |
| `docstack-store`    | `ac.onyx.docstack:docstack-store`        | Document store + envelope dispatcher. Carrier-agnostic.        |
| `docstack-permetic` | `ac.onyx.docstack:docstack-permetic`     | WebView carrier. Registers `StorageCapability` with Permetic.  |
| `docstack-headless` | `ac.onyx.docstack:docstack-headless`     | QuickJS/Zipline carrier. Replication with no WebView attached. |
| —                   | npm `@docstack/pouchdb-adapter-native`   | The PouchDB adapter. One implementation, carrier injected.     |

The JS global is `permetic`.

## Read before coding

- `@specs/01-permetic-webview.md` — the WebView host and its JS runtime. Start here.
- `@specs/02-docstack-store.md` — the native document store and dispatcher.
- `@specs/03-docstack-adapter.md` — the PouchDB adapter.
- `@specs/04-docstack-headless.md` — the QuickJS engine.
- `@specs/05-reference-topology.md` — a worked product example. Not a deliverable;
  read it when a product decision looks like it needs a contract change.
- `@permetic-web/src/index.d.ts` — the capability contract. Source of truth.
- `specs/adr/` — decisions already made. If a spec conflicts with an ADR, stop and ask.

## Commands

```bash
./gradlew :permetic:test :docstack-store:test
./gradlew :permetic:connectedAndroidTest          # needs device/emulator
./gradlew ktlintCheck detekt                      # must pass before commit
(cd permetic-web && npm run build && npm run typecheck)
(cd packages/pouchdb-adapter-native && npm test)  # PouchDB conformance suite
```

Never hand-edit anything under `src/main/assets/`. It is build output.

## Conventions

- **Kotlin**: explicit API mode on for published modules. Public API is `suspend`
  functions and `Flow`, never callbacks. No `runBlocking` outside tests.
- **No JS string interpolation.** Everything crosses as a `BridgeRequest` envelope.
  `evaluate("Foo.put('$id')")` is an injection bug and is banned.
- **Errors** cross as `BridgeError` codes from the contract. Never raw exception
  strings, never stack traces in release builds.
- **Contract drift is a compile error.** Adding a method means: edit
  `permetic-web/src/index.d.ts`, regenerate the Kotlin dispatcher, fix the
  implementations. Never one side only.
- **Native never parses a revision tree.** Trees are opaque blobs it stores and
  returns. Merge semantics belong to `pouchdb-merge`, in JS. See ADR-0001.
- **One protocol.** The adapter has no carrier branch in it. See ADR-0002.
- **Threading**: no bridge work on the main thread, except capability calls that
  legitimately need the Activity (billing sheet, permission prompt).
- **Minimums**: `minSdk 24`, `compileSdk 35`, Kotlin 2.x, JDK 17.

## Workflow

1. Plan mode first (Shift+Tab). Read the relevant spec and the files it names.
2. Restate the numbered tasks you intend to do. Do one at a time.
3. Run the tests named in the spec's verification section. Show the output.
4. Stop for review between tasks. Do not chain tasks unprompted.

Branch per feature: `feat/<module>-<short-name>`. Never commit to `main` directly.

## Out of scope

- The web app itself (separate repo, depends on npm `permetic`).
- `@docstack/client` and `@docstack/pouchdb-adapter-googledrive` (separate repo).
- iOS. The contract is written so a host is possible later. Do not build it now.
