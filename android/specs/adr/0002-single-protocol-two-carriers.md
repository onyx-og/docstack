# ADR-0002 — One protocol, two carriers

Status: accepted · Date: 2026-08-08 · **Amended 2026-11-15** (one carrier remains, see
the amendment at the end)

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

## Amendment (2026-11-15) — one carrier

DocStack 2.0 drops the embedded-JS port track (`../../../2.0.md` §4), so the headless
carrier is gone and **`WebMessageListener` is the only carrier**. The decision itself
holds and is not reopened: the envelope protocol, the single adapter implementation and
the carrier-free adapter were the right shape, and the reasoning in "Why not a dedicated
in-process binding" is what makes the surviving WebView path cheap enough to keep.

What this changes:

- The consequence "a replication bug captured in one host replays in the other" now has
  one host. Envelopes stay loggable and replayable, which is still how the store suite is
  driven (`../../../ports.md` §8), and that record becomes the carrier for testing stores
  written in other languages.
- The Zipline carve-out for attachment bytes is moot. The WebView side is unchanged.
- A native host with no WebView no longer reaches the store through an envelope at all:
  it gets the Kotlin binding of the Rust core, and `docstack-store` plugs into it as a
  foreign `DocumentStore` (`../../../ports.md` §3.2). The 14-method contract and its
  spec-02 semantics are what carry across, not this protocol.
