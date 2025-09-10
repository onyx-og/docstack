# Class: Stack

Defined in: [packages/server/src/utils/stack/index.ts:65](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L65)

## Extends

- `Stack`

## Properties

### cache

> **cache**: `object` = `{}`

Defined in: [packages/shared/src/utils/stack/index.ts:20](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L20)

#### Index Signature

\[`className`: `string`\]: `CachedClass`

#### Inherited from

`Stack.cache`

***

### connection

> **connection**: `string`

Defined in: [packages/shared/src/utils/stack/index.ts:16](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L16)

#### Inherited from

`Stack.connection`

***

### db

> **db**: `Database`\<\{ \}\>

Defined in: [packages/shared/src/utils/stack/index.ts:12](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L12)

#### Inherited from

`Stack.db`

***

### lastDocId

> **lastDocId**: `number`

Defined in: [packages/shared/src/utils/stack/index.ts:14](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L14)

#### Inherited from

`Stack.lastDocId`

***

### listeners

> **listeners**: `Changes`\<\{ \}\>[] = `[]`

Defined in: [packages/shared/src/utils/stack/index.ts:25](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L25)

#### Inherited from

`Stack.listeners`

***

### modelWorker

> **modelWorker**: `Worker` = `null`

Defined in: [packages/shared/src/utils/stack/index.ts:27](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L27)

#### Inherited from

`Stack.modelWorker`

***

### options?

> `optional` **options**: `StoreOptions`

Defined in: [packages/shared/src/utils/stack/index.ts:17](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L17)

#### Inherited from

`Stack.options`

***

### patchCount

> **patchCount**: `number`

Defined in: [packages/shared/src/utils/stack/index.ts:23](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L23)

#### Inherited from

`Stack.patchCount`

***

### appVersion

> `static` **appVersion**: `string` = `"0.0.1"`

Defined in: [packages/shared/src/utils/stack/index.ts:18](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/index.ts#L18)

#### Inherited from

`Stack.appVersion`

## Methods

### addClass()

> **addClass**(`classObj`): `Promise`\<`ClassModel`\>

Defined in: [packages/server/src/utils/stack/index.ts:727](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L727)

#### Parameters

##### classObj

[`Class`](Class.md)

#### Returns

`Promise`\<`ClassModel`\>

#### Overrides

`Stack.addClass`

***

### addClassLock()

> **addClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/index.ts:423](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L423)

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

Defined in: packages/docs/node\_modules/typescript/lib/lib.dom.d.ts:8303

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

`EventListenerOrEventListenerObject`

##### options?

`boolean` | `AddEventListenerOptions`

#### Returns

`void`

#### Inherited from

`Stack.addEventListener`

***

### checkSystem()

> **checkSystem**(): `Promise`\<`void`\>

Defined in: [packages/server/src/utils/stack/index.ts:229](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L229)

#### Returns

`Promise`\<`void`\>

***

### clearClassLock()

> **clearClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/index.ts:438](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L438)

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

Defined in: [packages/server/src/utils/stack/index.ts:475](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L475)

#### Returns

`void`

#### Overrides

`Stack.close`

***

### createDoc()

> **createDoc**(`docId`, `type`, `classObj`, `params`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/index.ts:978](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L978)

#### Parameters

##### docId

`string`

##### type

`string`

##### classObj

[`Class`](Class.md)

##### params

#### Returns

`Promise`\<`Document`\>

#### Overrides

`Stack.createDoc`

***

### deleteDocument()

> **deleteDocument**(`_id`): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/index.ts:1069](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L1069)

Sets the active param of a document to false

#### Parameters

##### \_id

`string`

#### Returns

`Promise`\<`boolean`\>

Promise<boolean>

#### Async

#### Overrides

`Stack.deleteDocument`

***

### destroyDb()

> **destroyDb**(): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/index.ts:696](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L696)

#### Returns

`Promise`\<`boolean`\>

***

### dispatchEvent()

> **dispatchEvent**(`event`): `boolean`

Defined in: packages/docs/node\_modules/typescript/lib/lib.dom.d.ts:8309

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

> **findDocument**(`selector`, `fields`, `skip`, `limit`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/index.ts:592](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L592)

#### Parameters

##### selector

`any`

##### fields

`any` = `undefined`

##### skip

`any` = `undefined`

##### limit

`any` = `undefined`

#### Returns

`Promise`\<`Document`\>

***

### findDocuments()

> **findDocuments**(`selector`, `fields?`, `skip?`, `limit?`): `Promise`\<\{\[`key`: `string`\]: `any`; `docs`: `Document`[]; \}\>

Defined in: [packages/server/src/utils/stack/index.ts:551](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L551)

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

> **getAllClasses**(): `Promise`\<[`Class`](Class.md)[]\>

Defined in: [packages/server/src/utils/stack/index.ts:630](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L630)

#### Returns

`Promise`\<[`Class`](Class.md)[]\>

***

### getAllClassModels()

> **getAllClassModels**(): `Promise`\<`ClassModel`[]\>

Defined in: [packages/server/src/utils/stack/index.ts:645](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L645)

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getClass()

> **getClass**(`className`): `Promise`\<[`Class`](Class.md)\>

Defined in: [packages/server/src/utils/stack/index.ts:480](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L480)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<[`Class`](Class.md)\>

#### Overrides

`Stack.getClass`

***

### getClassModel()

> **getClassModel**(`className`): `Promise`\<`ClassModel`\>

Defined in: [packages/server/src/utils/stack/index.ts:598](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L598)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`ClassModel`\>

#### Overrides

`Stack.getClassModel`

***

### getClassModels()

> **getClassModels**(`classNames`): `Promise`\<`ClassModel`[]\>

Defined in: [packages/server/src/utils/stack/index.ts:656](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L656)

#### Parameters

##### classNames

`string`[]

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getDb()

> **getDb**(): `Database`\<\{ \}\>

Defined in: [packages/server/src/utils/stack/index.ts:104](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L104)

#### Returns

`Database`\<\{ \}\>

***

### getDbInfo()

> **getDbInfo**(): `Promise`\<`DatabaseInfo`\>

Defined in: [packages/server/src/utils/stack/index.ts:108](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L108)

#### Returns

`Promise`\<`DatabaseInfo`\>

***

### getDbName()

> **getDbName**(): `string`

Defined in: [packages/server/src/utils/stack/index.ts:112](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L112)

#### Returns

`string`

***

### getDocRevision()

> **getDocRevision**(`docId`): `Promise`\<`string`\>

Defined in: [packages/server/src/utils/stack/index.ts:538](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L538)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`string`\>

***

### getDocument()

> **getDocument**(`docId`): `Promise`\<`ExistingDocument`\<\{ \}\>\>

Defined in: [packages/server/src/utils/stack/index.ts:523](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L523)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`ExistingDocument`\<\{ \}\>\>

***

### getLastDocId()

> **getLastDocId**(): `Promise`\<`number`\>

Defined in: [packages/server/src/utils/stack/index.ts:124](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L124)

#### Returns

`Promise`\<`number`\>

***

### getSystem()

> **getSystem**(): `Promise`\<`SystemDoc`\>

Defined in: [packages/server/src/utils/stack/index.ts:139](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L139)

#### Returns

`Promise`\<`SystemDoc`\>

***

### incrementLastDocId()

> **incrementLastDocId**(): `Promise`\<`number`\>

Defined in: [packages/server/src/utils/stack/index.ts:667](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L667)

#### Returns

`Promise`\<`number`\>

***

### initdb()

> **initdb**(): `Promise`\<`ServerStack`\>

Defined in: [packages/server/src/utils/stack/index.ts:468](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L468)

#### Returns

`Promise`\<`ServerStack`\>

***

### initIndex()

> **initIndex**(): `Promise`\<`void`\>

Defined in: [packages/server/src/utils/stack/index.ts:494](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L494)

#### Returns

`Promise`\<`void`\>

***

### onClassDoc()

> **onClassDoc**(`className`): `Changes`\<\{ \}\>

Defined in: [packages/server/src/utils/stack/index.ts:452](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L452)

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

Defined in: [packages/server/src/utils/stack/index.ts:410](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L410)

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

Defined in: [packages/server/src/utils/stack/index.ts:344](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L344)

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

Defined in: [packages/server/src/utils/stack/index.ts:325](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L325)

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

Defined in: [packages/server/src/utils/stack/index.ts:310](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L310)

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

Defined in: [packages/server/src/utils/stack/index.ts:968](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L968)

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

Defined in: [packages/server/src/utils/stack/index.ts:299](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L299)

#### Returns

`void`

#### Description

Clears all listeners from the Stack

#### Overrides

`Stack.removeAllListeners`

***

### removeEventListener()

> **removeEventListener**(`type`, `callback`, `options?`): `void`

Defined in: packages/docs/node\_modules/typescript/lib/lib.dom.d.ts:8315

Removes the event listener in target's event listener list with the same type, callback, and options.

[MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/removeEventListener)

#### Parameters

##### type

`string`

##### callback

`EventListenerOrEventListenerObject`

##### options?

`boolean` | `EventListenerOptions`

#### Returns

`void`

#### Inherited from

`Stack.removeEventListener`

***

### reset()

> **reset**(): `Promise`\<`ServerStack`\>

Defined in: [packages/server/src/utils/stack/index.ts:685](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L685)

#### Returns

`Promise`\<`ServerStack`\>

***

### setListeners()

> **setListeners**(): `void`

Defined in: [packages/server/src/utils/stack/index.ts:267](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L267)

#### Returns

`void`

#### Overrides

`Stack.setListeners`

***

### updateClass()

> **updateClass**(`classObj`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/index.ts:752](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L752)

#### Parameters

##### classObj

[`Class`](Class.md)

#### Returns

`Promise`\<`Document`\>

#### Overrides

`Stack.updateClass`

***

### validateObject()

> **validateObject**(`obj`, `type`, `schema`): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/index.ts:771](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L771)

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

Defined in: [packages/server/src/utils/stack/index.ts:941](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L941)

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

Defined in: [packages/server/src/utils/stack/index.ts:712](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L712)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`unknown`\>

***

### create()

> `static` **create**(`conn`, `options?`): `Promise`\<`ServerStack`\>

Defined in: [packages/server/src/utils/stack/index.ts:117](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/index.ts#L117)

#### Parameters

##### conn

`string`

##### options?

`StoreOptions`

#### Returns

`Promise`\<`ServerStack`\>
