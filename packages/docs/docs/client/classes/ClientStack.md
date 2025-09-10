# Class: ClientStack

Defined in: [client/src/utils/stack/index.ts:62](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L62)

## Extends

- `Stack`

## Properties

### cache

> **cache**: `object`

Defined in: [client/src/utils/stack/index.ts:72](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L72)

#### Index Signature

\[`className`: `string`\]: `CachedClass`

#### Overrides

`Stack.cache`

***

### connection

> **connection**: `string`

Defined in: [client/src/utils/stack/index.ts:68](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L68)

#### Overrides

`Stack.connection`

***

### db

> **db**: `Database`\<\{ \}\>

Defined in: [client/src/utils/stack/index.ts:64](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L64)

#### Overrides

`Stack.db`

***

### lastDocId

> **lastDocId**: `number`

Defined in: [client/src/utils/stack/index.ts:66](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L66)

#### Overrides

`Stack.lastDocId`

***

### listeners

> **listeners**: `Changes`\<\{ \}\>[] = `[]`

Defined in: [client/src/utils/stack/index.ts:77](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L77)

#### Overrides

`Stack.listeners`

***

### modelWorker

> **modelWorker**: `null` \| `Worker` = `null`

Defined in: [client/src/utils/stack/index.ts:79](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L79)

#### Overrides

`Stack.modelWorker`

***

### options?

> `optional` **options**: `StoreOptions`

Defined in: [client/src/utils/stack/index.ts:69](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L69)

#### Overrides

`Stack.options`

***

### patchCount

> **patchCount**: `number`

Defined in: [client/src/utils/stack/index.ts:75](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L75)

#### Overrides

`Stack.patchCount`

***

### appVersion

> `static` **appVersion**: `string` = `"0.0.1"`

Defined in: [client/src/utils/stack/index.ts:70](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L70)

#### Overrides

`Stack.appVersion`

## Methods

### addClass()

> **addClass**(`classObj`): `Promise`\<`ClassModel`\>

Defined in: [client/src/utils/stack/index.ts:736](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L736)

#### Parameters

##### classObj

`Class`

#### Returns

`Promise`\<`ClassModel`\>

#### Overrides

`Stack.addClass`

***

### addClassLock()

> **addClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [client/src/utils/stack/index.ts:429](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L429)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Stack.addClassLock`

***

### addEventListener()

> **addEventListener**(`type`, `callback`, `options?`): `void`

Defined in: docs/node\_modules/typescript/lib/lib.dom.d.ts:8303

Appends an event listener for events whose type attribute value is type. The callback argument sets the callback that will be invoked when the event is dispatched.

The options argument sets listener-specific options. For compatibility this can be a boolean, in which case the method behaves exactly as if the value was specified as options's capture.

When set to true, options's capture prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE. When false (or not present), callback will not be invoked when event's eventPhase attribute value is CAPTURING_PHASE. Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET.

When set to true, options's passive indicates that the callback will not cancel the event by invoking preventDefault(). This is used to enable performance optimizations described in § 2.8 Observing event listeners.

When set to true, options's once indicates that the callback will only be invoked once after which the event listener will be removed.

If an AbortSignal is passed for options's signal, then the event listener will be removed when signal is aborted.

The event listener is appended to target's event listener list and is not appended if it has the same type, callback, and capture.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener)

#### Parameters

##### type

`string`

##### callback

`null` | `EventListenerOrEventListenerObject`

##### options?

`boolean` | `AddEventListenerOptions`

#### Returns

`void`

#### Inherited from

`Stack.addEventListener`

***

### checkSystem()

> **checkSystem**(): `Promise`\<`void`\>

Defined in: [client/src/utils/stack/index.ts:235](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L235)

#### Returns

`Promise`\<`void`\>

***

### clearClassLock()

> **clearClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [client/src/utils/stack/index.ts:444](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L444)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Stack.clearClassLock`

***

### close()

> **close**(): `void`

Defined in: [client/src/utils/stack/index.ts:481](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L481)

#### Returns

`void`

#### Overrides

`Stack.close`

***

### createDoc()

> **createDoc**(`docId`, `type`, `classObj`, `params`): `Promise`\<`null` \| `Document`\>

Defined in: [client/src/utils/stack/index.ts:999](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L999)

#### Parameters

##### docId

`null` | `string`

##### type

`string`

##### classObj

`Class`

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Stack.createDoc`

***

### deleteDocument()

> **deleteDocument**(`_id`): `Promise`\<`boolean`\>

Defined in: [client/src/utils/stack/index.ts:1089](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L1089)

Sets the active param of a document to false

#### Parameters

##### \_id

`string`

#### Returns

`Promise`\<`boolean`\>

Promise<boolean>

#### Overrides

`Stack.deleteDocument`

***

### destroyDb()

> **destroyDb**(): `Promise`\<`undefined` \| `false`\>

Defined in: [client/src/utils/stack/index.ts:705](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L705)

#### Returns

`Promise`\<`undefined` \| `false`\>

***

### dispatchEvent()

> **dispatchEvent**(`event`): `boolean`

Defined in: docs/node\_modules/typescript/lib/lib.dom.d.ts:8309

Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/dispatchEvent)

#### Parameters

##### event

`Event`

#### Returns

`boolean`

#### Inherited from

`Stack.dispatchEvent`

***

### findDocument()

> **findDocument**(`selector`, `fields`, `skip`, `limit`): `Promise`\<`null` \| `Document`\>

Defined in: [client/src/utils/stack/index.ts:601](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L601)

#### Parameters

##### selector

`any`

##### fields

`undefined` = `undefined`

##### skip

`undefined` = `undefined`

##### limit

`undefined` = `undefined`

#### Returns

`Promise`\<`null` \| `Document`\>

***

### findDocuments()

> **findDocuments**(`selector`, `fields?`, `skip?`, `limit?`): `Promise`\<\{\[`key`: `string`\]: `any`; `docs`: `Document`[]; \}\>

Defined in: [client/src/utils/stack/index.ts:557](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L557)

#### Parameters

##### selector

##### fields?

`string`[]

##### skip?

`number`

##### limit?

`number`

#### Returns

`Promise`\<\{\[`key`: `string`\]: `any`; `docs`: `Document`[]; \}\>

#### Overrides

`Stack.findDocuments`

***

### getAllClasses()

> **getAllClasses**(): `Promise`\<`Class`[]\>

Defined in: [client/src/utils/stack/index.ts:639](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L639)

#### Returns

`Promise`\<`Class`[]\>

***

### getAllClassModels()

> **getAllClassModels**(): `Promise`\<`ClassModel`[]\>

Defined in: [client/src/utils/stack/index.ts:654](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L654)

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getClass()

> **getClass**(`className`): `Promise`\<`null` \| `Class`\>

Defined in: [client/src/utils/stack/index.ts:486](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L486)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`null` \| `Class`\>

#### Overrides

`Stack.getClass`

***

### getClassModel()

> **getClassModel**(`className`): `Promise`\<`null` \| `ClassModel`\>

Defined in: [client/src/utils/stack/index.ts:607](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L607)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`null` \| `ClassModel`\>

#### Overrides

`Stack.getClassModel`

***

### getClassModels()

> **getClassModels**(`classNames`): `Promise`\<`ClassModel`[]\>

Defined in: [client/src/utils/stack/index.ts:665](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L665)

#### Parameters

##### classNames

`string`[]

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getDb()

> **getDb**(): `Database`\<\{ \}\>

Defined in: [client/src/utils/stack/index.ts:109](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L109)

#### Returns

`Database`\<\{ \}\>

***

### getDbInfo()

> **getDbInfo**(): `Promise`\<`DatabaseInfo`\>

Defined in: [client/src/utils/stack/index.ts:113](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L113)

#### Returns

`Promise`\<`DatabaseInfo`\>

***

### getDbName()

> **getDbName**(): `string`

Defined in: [client/src/utils/stack/index.ts:117](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L117)

#### Returns

`string`

***

### getDocRevision()

> **getDocRevision**(`docId`): `Promise`\<`null` \| `string`\>

Defined in: [client/src/utils/stack/index.ts:544](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L544)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `string`\>

***

### getDocument()

> **getDocument**(`docId`): `Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

Defined in: [client/src/utils/stack/index.ts:529](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L529)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

***

### getLastDocId()

> **getLastDocId**(): `Promise`\<`number`\>

Defined in: [client/src/utils/stack/index.ts:129](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L129)

#### Returns

`Promise`\<`number`\>

***

### getSystem()

> **getSystem**(): `Promise`\<`null` \| `SystemDoc`\>

Defined in: [client/src/utils/stack/index.ts:144](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L144)

#### Returns

`Promise`\<`null` \| `SystemDoc`\>

***

### incrementLastDocId()

> **incrementLastDocId**(): `Promise`\<`undefined` \| `number`\>

Defined in: [client/src/utils/stack/index.ts:676](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L676)

#### Returns

`Promise`\<`undefined` \| `number`\>

***

### initdb()

> **initdb**(): `Promise`\<`ClientStack`\>

Defined in: [client/src/utils/stack/index.ts:474](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L474)

#### Returns

`Promise`\<`ClientStack`\>

***

### initIndex()

> **initIndex**(): `Promise`\<`void`\>

Defined in: [client/src/utils/stack/index.ts:500](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L500)

#### Returns

`Promise`\<`void`\>

***

### onClassDoc()

> **onClassDoc**(`className`): `Changes`\<\{ \}\>

Defined in: [client/src/utils/stack/index.ts:458](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L458)

#### Parameters

##### className

`string`

#### Returns

`Changes`\<\{ \}\>

#### Overrides

`Stack.onClassDoc`

***

### onClassLock()

> **onClassLock**(`className`): `Changes`\<\{ \}\>

Defined in: [client/src/utils/stack/index.ts:416](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L416)

#### Parameters

##### className

`string`

#### Returns

`Changes`\<\{ \}\>

#### Overrides

`Stack.onClassLock`

***

### onClassModelChanges()

> **onClassModelChanges**(): `Changes`\<\{ \}\>

Defined in: [client/src/utils/stack/index.ts:350](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L350)

Listener that fires when a document that refers to a class is edited or created,
marks its execution while handling the propagation of schema modifications to children documents: 
by dispatching a webworker message containing the

#### Returns

`Changes`\<\{ \}\>

void

#### Var

className and the previous revision id.
In the main case, the worker sends a message with the result of its task.

#### Fires

class-model-propagation-complete

#### Fires

class-model-propagation-pending

***

### onClassModelPropagationComplete()

> **onClassModelPropagationComplete**(`event`): `void`

Defined in: [client/src/utils/stack/index.ts:331](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L331)

#### Parameters

##### event

`CustomEvent`\<`ClassModelPropagationComplete`\>

#### Returns

`void`

#### Description

When a class model propagation comes to completion remove the corresponding 
~lock from the database

***

### onClassModelPropagationStart()

> **onClassModelPropagationStart**(`event`): `void`

Defined in: [client/src/utils/stack/index.ts:316](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L316)

#### Parameters

##### event

`CustomEvent`\<`ClassModelPropagationStart`\>

#### Returns

`void`

#### Description

When a class model propagation starts write the ~lock document to the database.
It prevents any further modifications on the class data model

#### Overrides

`Stack.onClassModelPropagationStart`

***

### prepareDoc()

> **prepareDoc**(`_id`, `type`, `params`): `object`

Defined in: [client/src/utils/stack/index.ts:989](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L989)

#### Parameters

##### \_id

`string`

##### type

`string`

##### params

#### Returns

`object`

***

### removeAllListeners()

> **removeAllListeners**(): `void`

Defined in: [client/src/utils/stack/index.ts:305](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L305)

#### Returns

`void`

#### Description

Clears all listeners from the Stack

#### Overrides

`Stack.removeAllListeners`

***

### removeEventListener()

> **removeEventListener**(`type`, `callback`, `options?`): `void`

Defined in: docs/node\_modules/typescript/lib/lib.dom.d.ts:8315

Removes the event listener in target's event listener list with the same type, callback, and options.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/removeEventListener)

#### Parameters

##### type

`string`

##### callback

`null` | `EventListenerOrEventListenerObject`

##### options?

`boolean` | `EventListenerOptions`

#### Returns

`void`

#### Inherited from

`Stack.removeEventListener`

***

### reset()

> **reset**(): `Promise`\<`ClientStack`\>

Defined in: [client/src/utils/stack/index.ts:694](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L694)

#### Returns

`Promise`\<`ClientStack`\>

***

### setListeners()

> **setListeners**(): `void`

Defined in: [client/src/utils/stack/index.ts:273](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L273)

#### Returns

`void`

#### Overrides

`Stack.setListeners`

***

### updateClass()

> **updateClass**(`classObj`): `Promise`\<`null` \| `Document`\>

Defined in: [client/src/utils/stack/index.ts:770](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L770)

#### Parameters

##### classObj

`Class`

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Stack.updateClass`

***

### validateObject()

> **validateObject**(`obj`, `type`, `schema`): `Promise`\<`boolean`\>

Defined in: [client/src/utils/stack/index.ts:789](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L789)

#### Parameters

##### obj

`any`

##### type

`string`

##### schema

#### Returns

`Promise`\<`boolean`\>

***

### validateObjectByType()

> **validateObjectByType**(`obj`, `type`, `schema?`): `Promise`\<`boolean`\>

Defined in: [client/src/utils/stack/index.ts:962](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L962)

#### Parameters

##### obj

`any`

##### type

`string`

##### schema?

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Stack.validateObjectByType`

***

### clear()

> `static` **clear**(`conn`): `Promise`\<`unknown`\>

Defined in: [client/src/utils/stack/index.ts:721](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L721)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`unknown`\>

***

### create()

> `static` **create**(`conn`, `options?`): `Promise`\<`ClientStack`\>

Defined in: [client/src/utils/stack/index.ts:122](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/utils/stack/index.ts#L122)

#### Parameters

##### conn

`string`

##### options?

`StoreOptions`

#### Returns

`Promise`\<`ClientStack`\>
