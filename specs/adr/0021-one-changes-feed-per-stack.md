# ADR-0021 — One changes feed per stack, and building a class does not subscribe it

Status: accepted · Date: 2026-08-25

## Decision

Two changes, one to each half of a problem that surfaced as a console warning.

1. `ClientStack.onClassDoc` returns a **subscription handle onto a single shared feed**,
   demultiplexed by the document's owner field, instead of opening a `db.changes` of its
   own. The feed opens with the first subscriber and is cancelled with the last.
2. Building a `Class` for its **schema** no longer subscribes it to its documents.
   `Class.get` / `buildFromModel` / `fetch` accept `{ subscribe: false }`, and
   `ClientStack.getClassSnapshot(className)` is the read for callers that want a schema
   rather than a live view.

Supporting them: `Class.close()` / `Domain.close()` release a subscription,
`Stack.releaseListener` removes it from `stack.listeners`, and `ChangesSubscription` in
`@docstack/shared` is the type both a PouchDB `Changes` and a shared-feed handle satisfy.

## The symptom

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 destroyed listeners added. Use emitter.setMaxListeners() to increase limit
```

Reported from a consumer app and from `@docstack/ui`, repeatedly, during ordinary use.

## Why it happens at all

PouchDB registers a `destroyed` listener on the database for **every**
`db.changes({ live: true })` and holds it until that feed is cancelled
(`pouchdb-core`, `Changes` constructor: `db.once('destroyed', onDestroy)`). So the count
Node is warning about *is* the count of live feeds, and Node's default ceiling is ten.

The warning is therefore a faithful signal, not noise — but it names the wrong thing, and
nothing in the message points at classes, feeds, or DocStack.

## Cause 1 — a subscribed `Class` built per document

`Class.get` subscribes every instance it builds (ADR-0020 routes that through
`subscribeClassDocs` so the changes feed decrypts). Meanwhile the hot paths asked for a
class with the cache bypassed:

```ts
const classObj = encryptedKeys.length || (fields && fields.length)
    ? (await this.getClass(doc["~class"], true)) ?? undefined   // per document
    : undefined;
```

`getClass(name, true)` builds a fresh instance, and a fresh instance subscribes. Measured
before any fix, three `findDocuments` calls over a five-row class:

| | feeds opened |
| :--- | ---: |
| 3 reads × 5 documents | **15** |

Eleven is the ceiling, so a live view crossed it on roughly its second render.

The same call appears five more times in `StackPlugin` — the validation path, the
encryption path, the `bulkGet` decrypt path, `get` and `put`. Every write leaked one or
two more. That was found only because a listener-count assertion came back 102 where 100
was expected, in a test written to measure something else.

## Cause 2 — a feed per watched class

Independently of any leak, a correct app that watches ten classes held ten feeds and
warned. The per-class filter was also wasted work: the local adapter runs every filter
over the same change stream, so N filtered feeds each see every change anyway.

## Why `fresh` and `subscribe` had to be separated

The first attempt at cause 1 was to drop `fresh` and read through the cache, reasoning
that the class-model listener in `setListeners` evicts a class the moment its model
changes. **That was wrong, and the suite said so loudly**: every test hung at
`DocStack initialization timeout`.

That listener is itself a changes feed, so eviction is *asynchronous*. During a burst of
schema writes — patch application at bootstrap, most obviously — the cache still holds the
previous schema, and validating a document against it fails. `fresh: true` was
load-bearing.

The real defect was that one flag controlled two unrelated things:

| | wanted by a live view | wanted by validation / encryption |
| :--- | :--- | :--- |
| current schema | yes | **yes** |
| emits `doc` events | **yes** | no |

`getClassSnapshot` supplies the second column. Freshness is unchanged from before;
only the subscription is gone.

## Consequences

- **A stack carries one `destroyed` listener for class documents**, whatever it watches.
  Verified: 15 watchers add 15 entries to `stack.listeners` and **zero** to the database.
- **Deletions.** Dispatch is keyed on the document's owner field, so a change with no document
  cannot be routed and is dropped — exactly as the per-class filters dropped it, since
  PouchDB hands a filter only `{_id, _rev, _deleted}` for a hard deletion. DocStack
  deletes are soft (`active: false`), so this is not the delete path.
- **A late subscriber joins a running feed.** It receives changes from the moment it
  registers, not from when the feed opened; nothing is buffered and replayed.
- **`Class.close()` is now part of the contract** for any instance built outside the
  stack's cache — `getClass(name, true)`, or an entry a class list has replaced. The cache
  still owns the instances it holds, and does *not* close one on eviction: a consumer may
  be holding it, and silently killing its updates is worse than one stale subscription.
- **`getClasses` / `getDomains` still open one selector-filtered feed per call.** Routing
  them through the shared feed means reimplementing the Mango `$in` / `$regex` filtering
  they construct, which is more risk than the symptom justifies. They are now tracked in
  `stack.listeners`, so `stack.close()` reclaims them — `getDomainModels` previously left
  its feed untracked, so even that did not.
- **`@docstack/server` is unchanged.** It still opens a feed per class. The ceiling is a
  Node-process concern there rather than a tab's, and `ChangesSubscription` is satisfied
  by a real `Changes`, so nothing in it needed editing.

## Two namespaces, not one

Routing on `~class` alone would have been wrong, and finding out why exposed a bug that
predated this work: **a `Domain` had never emitted a single `doc` event.**

`Domain.get` subscribed through `subscribeClassDocs`, which matches on `~class`. A relation
document does not have one — `RelationDocument` types it as `"~class"?: never` and names its
owner in `~domain` instead. So the filter could not match and the event could not fire. The
old per-class feed applied exactly the same test, so this was not a regression; it was
simply never reachable, and nothing failed loudly enough to say so. `useDomainRelations` in
`@docstack/react` listens for that event and had never received one.

The subscriber map is therefore keyed `"<metaKey>:<name>"` rather than by name alone, and
routing reads whichever owner field the document actually carries:

| document | owner field | routing key |
| :--- | :--- | :--- |
| a class's document | `~class` | `~class:Task` |
| a domain's relation | `~domain` | `~domain:ProjectTasks` |

`onClassDoc` takes an optional second argument for the keyspace, so existing
`(className: string)` implementations stay assignable and nothing else had to change.
`subscribeDomainDocs` joins `subscribeClassDocs` on the shared `Stack`, both delegating to
one private `subscribeDocs` — so domains get ADR-0020's ordering, `seq` and decryption
guarantees by construction rather than through a second implementation that could drift.

### What the failing tests were really saying

Worth recording, because the first two attempts at a test both lied.

The first asserted the relation had been *written* before asserting the event fired. That
precondition passed. The event still never arrived — and the reason was not routing:
`createRelationDoc` caught its write failure, logged it, and fell through to `return doc`,
handing back the in-memory draft for a document that was never stored. The "precondition"
was reading a phantom. It now rethrows, as the three sibling `create*` methods always did.

Its log line was `{ error: e }`, which serialises an `Error` to whatever incidental
properties it happens to carry, because `message` is not enumerable. The console said
`{"docId":"PBLink-11"}`. Unpacking `message`/`name`/`status` turned that into
`"Relation document classes do not match domain 'PBLink'."` — which was the real fault, and
it was in the test: `buildRelationParams` uses `sourceClass.id`, the generated model id
(`class-6`), not the class name.

A second test then *passed* while the first failed. Dumping its values showed why:

```
{"cardId": "DRShared-12", "relationId": "DRShared-12", "seen": [...]}
```

A class and a domain sharing a name mint **colliding document ids** — both draw from
`lastDocId` as `${name}-${n}` — so one write silently overwrote the other and both listeners
fired for the same document. That is a separate, unfixed defect. The test now uses distinct
names and asserts the two ids differ, so it cannot pass that way again.

## A second bug, in `@docstack/react`

Not the same cause, but the same report — the warning came from `@docstack/ui` too, and
all four list/docs hooks had this shape:

```ts
const runQueryAndListen = async () => {
    // ...
    classObj.addEventListener('doc', changeListener);
    return () => classObj.removeEventListener('doc', changeListener);   // returned to nobody
};

runQueryAndListen();          // effect returns undefined
```

The cleanup was returned from the async function, not from the effect, so React never
received it. Every listener stayed attached and every `buildFromModel` instance stayed
subscribed on each query change. `useClassList` is mounted in four places in
`@docstack/ui`, one `Class` per class model each — that alone clears ten.

All four now register cleanup where React can see it, with a `cancelled` guard so a
teardown mid-query closes the instances it had already built.

## Tests

`packages/client/src-test/listener-leak.test.ts`, which counts
`db.listenerCount("destroyed")` directly — the number PouchDB is warning about:

1. Reading documents opens no feeds. (Was 15.)
2. Fifteen watched classes cost the database nothing, still route per class rather than
   broadcasting, and give the feed back when the last one closes.
3. A class built fresh returns its subscription on `close()`, and closing twice is
   harmless.

`packages/client/src-test/domain-events.test.ts` covers the namespaces: a domain receives
its relations, and a relation reaches its domain and no class listener.

Test 1 also asserts the decrypted values still come back, because the class it now
resolves is what supplies the attribute config — a wrong lookup would show up there rather
than as a listener count.
