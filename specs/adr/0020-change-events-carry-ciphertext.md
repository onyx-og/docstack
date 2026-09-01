# Finding — change events deliver ciphertext, so live views render `[object Object]`

**For dispatch to the DocStack repository.** Found in a consumer immediately after enabling
encryption on two attributes, against `@docstack/client` with ADR-0018 shipped. Reproduced
on a fresh browser profile.

**Severity: it crashes the view.** Not a wrong value, not a stale one — React refuses to
render the payload at all, so the component tree throws.

---

## Symptom

```
Objects are not valid as a React child
(found: object with keys {__enc, iv, data, alg, kid}).
```

The document reads correctly at first. Then, on the next change to that class, the value
on screen is replaced by the raw encrypted payload and the view unmounts with the error
above. In a React consumer the initial paint is right and the update is fatal, which is
the worst ordering for diagnosing it: the feature looks like it works.

## Cause

`ClientStack.onClassDoc` subscribes to PouchDB's changes feed:

```ts
onClassDoc = (className: string) => {
    const onClassDocListener = this.db.changes({
        since: 'now',
        live: true,
        include_docs: true,
        filter: (doc) => doc["~class"] == className,
    });
    ...
}
```

and `Class.get` forwards each change straight to consumers:

```ts
class_.stack!.onClassDoc(name).on("change", (change) => {
    class_.dispatchEvent(new CustomEvent("doc", { detail: change }));
});
```

**`changes()` is not on the decrypting path.** `StackPlugin` replaces `bulkDocs` and
`bulkGet`, and decryption happens in the `bulkGet` wrapper — that is what makes
`getCards` / `findDocuments` transparent. The changes feed reads the store directly and
`include_docs` returns exactly what is stored, which for an encrypted attribute is its
`EncryptedPayload`. Wrapping the handle in `createGuardedDb` does not affect this: `changes`
is forwarded to the real database untouched, as it should be.

So every read path decrypts except the one that pushes.

## Why it is easy to miss

- A stack with **no encrypted attributes** behaves identically, so nothing in the existing
  suite would notice.
- The **first** render is correct, because it comes from `getCards`. Only the live update
  is wrong, and only for classes that have had a change since subscribing (`since: 'now'`).
- A consumer that merely stores the document rather than rendering it sees no error at all
  — it silently persists ciphertext into its own view state, which is worse than crashing.

## Fix

Decrypt in the handler, before dispatching — the same treatment `bulkGet` already applies:

```ts
class_.stack!.onClassDoc(name).on("change", async (change) => {
    const doc = change.doc;
    if (doc && class_.getEncryptedAttributes().length) {
        await class_.stack!.cryptoEngine.decryptDocument(doc, class_);
    }
    class_.dispatchEvent(new CustomEvent("doc", { detail: change }));
});
```

Three details worth deciding rather than inheriting:

1. **Ordering.** The handler becomes asynchronous, so two rapid changes to one document can
   dispatch out of order. Either serialise per class, or carry the change's `seq` in the
   event so consumers can discard a stale one. The second is cheaper and more useful.
2. **A locked stack.** `decryptDocument` cannot succeed with no key. Emitting the encrypted
   payload is the current behaviour and is what causes this bug; the consistent choice is to
   match what a locked *read* does — the attribute reads back as `null` — so that locked
   reads and locked change events agree. Silently dropping the event would instead make a
   locked stack look frozen.
3. **`deleted` changes** carry no `doc`; the branch has to tolerate that.

## Test worth having

Subscribe to a class with an encrypted attribute, write a document, and assert the change
event's `detail.doc` carries **plaintext**. One assertion, and it fails today. A second
test on a locked stack should assert the same field is `null` rather than an
`EncryptedPayload` — which pins decision 2 above.

## What the consumer does meanwhile

Tokido guards in its own listener: if any value on an incoming change satisfies
`__enc === true`, it re-reads that single document through `getCards` (which decrypts) and
applies that instead. If the re-read fails the update is **dropped** rather than applied —
what is already on screen is correct, and replacing it with ciphertext is worse than being
briefly stale.

That is a workaround with a real cost — a round trip per changed encrypted document — and
it only works because the consumer knows which payload shape to look for, which is an
internal detail it should not need. It comes out as soon as the fix lands.
