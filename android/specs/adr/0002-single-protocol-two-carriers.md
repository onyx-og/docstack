# ADR-0002 — One protocol, two carriers

Status: accepted · Date: 2026-08-08

## Decision

One envelope protocol (`BridgeRequest` / `BridgeResponse`) and one adapter
implementation. The only host-specific code is a `Carrier`:

```ts
type Carrier = (req: BridgeRequest) => Promise<BridgeResponse>;
```

WebView: `WebMessageListener`. Headless: one bound Zipline suspending function.
Each is a handful of lines, and neither is inside the adapter — the adapter has
no carrier branch in it.

## Why not a dedicated in-process binding for the headless host

A typed Zipline/JNI binding avoids envelope encode and decode per call. That
matters when calls are per-key and numerous. Under ADR-0001 they are
per-operation, so encoding amortises across an entire result set and is noise
next to the store query itself.

## Consequences

- One dispatcher on the Kotlin side. One conformance run plus a thin carrier test
  each, rather than two full suites.
- One implementation of correlation, cancellation and error mapping.
- Envelopes are uniformly loggable and replayable, so a replication bug captured
  in one host replays in the other.
- Zipline's typed `ZiplineService` interfaces are not used for this path, so the
  headless side dispatches on strings. Mitigation: generate the Kotlin dispatcher
  from `index.d.ts`, so drift is a build failure rather than a runtime
  `UNAVAILABLE`.

## Carve-out

Attachment bodies use a binary side-channel — `WebMessageCompat` byte arrays on
WebView 105+, `ByteArray` over Zipline. Base64 in JSON costs roughly a third
extra on payloads that can be megabytes. Two methods, not a second protocol.
