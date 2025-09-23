# Class: ClientStack

Defined in: [packages/client/src/core/index.ts:63](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L63)

## Extends

- `Stack`

## Properties

### cache

> **cache**: `object`

Defined in: [packages/client/src/core/index.ts:74](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L74)

#### Index Signature

\[`className`: `string`\]: `CachedClass`

#### Overrides

`Stack.cache`

***

### connection

> **connection**: `string`

Defined in: [packages/client/src/core/index.ts:70](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L70)

#### Overrides

`Stack.connection`

***

### db

> **db**: `Database`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:65](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L65)

#### Overrides

`Stack.db`

***

### lastDocId

> **lastDocId**: `number`

Defined in: [packages/client/src/core/index.ts:68](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L68)

#### Overrides

`Stack.lastDocId`

***

### listeners

> **listeners**: `Changes`\<\{ \}\>[] = `[]`

Defined in: [packages/client/src/core/index.ts:79](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L79)

#### Overrides

`Stack.listeners`

***

### modelWorker

> **modelWorker**: `null` \| `Worker` = `null`

Defined in: [packages/client/src/core/index.ts:81](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L81)

#### Overrides

`Stack.modelWorker`

***

### name

> **name**: `string`

Defined in: [packages/client/src/core/index.ts:66](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L66)

#### Overrides

`Stack.name`

***

### options?

> `optional` **options**: `StackOptions`

Defined in: [packages/client/src/core/index.ts:71](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L71)

#### Overrides

`Stack.options`

***

### patchCount

> **patchCount**: `number`

Defined in: [packages/client/src/core/index.ts:77](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L77)

#### Overrides

`Stack.patchCount`

***

### appVersion

> `static` **appVersion**: `string` = `"0.0.1"`

Defined in: [packages/client/src/core/index.ts:72](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L72)

#### Overrides

`Stack.appVersion`

## Methods

### addClass()

> **addClass**(`classObj`): `Promise`\<`ClassModel`\>

Defined in: [packages/client/src/core/index.ts:714](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L714)

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

Defined in: [packages/client/src/core/index.ts:397](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L397)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Stack.addClassLock`

***

### addDesignDocumentPKs()

> **addDesignDocumentPKs**(`className`, `pKs`, `temp`): `Promise`\<`string`\>

Defined in: [packages/client/src/core/index.ts:755](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L755)

#### Parameters

##### className

`string`

##### pKs

`string`[]

##### temp

`boolean` = `false`

#### Returns

`Promise`\<`string`\>

#### Overrides

`Stack.addDesignDocumentPKs`

***

### addEventListener()

> **addEventListener**(`type`, `callback`, `options?`): `void`

Defined in: node\_modules/typescript/lib/lib.dom.d.ts:11569

The **`addEventListener()`** method of the EventTarget interface sets up a function that will be called whenever the specified event is delivered to the target.

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

Defined in: [packages/client/src/core/index.ts:248](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L248)

#### Returns

`Promise`\<`void`\>

***

### clearClassLock()

> **clearClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/index.ts:418](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L418)

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

Defined in: [packages/client/src/core/index.ts:455](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L455)

#### Returns

`void`

#### Overrides

`Stack.close`

***

### createDoc()

> **createDoc**(`docId`, `type`, `classObj`, `params`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/index.ts:1027](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L1027)

#### Parameters

##### docId

`null` | `string`

##### type

`string`

##### classObj

[`Class`](Class.md)

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Stack.createDoc`

***

### deleteDocument()

> **deleteDocument**(`_id`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/index.ts:1117](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L1117)

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

Defined in: [packages/client/src/core/index.ts:683](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L683)

#### Returns

`Promise`\<`undefined` \| `false`\>

***

### dispatchEvent()

> **dispatchEvent**(`event`): `boolean`

Defined in: node\_modules/typescript/lib/lib.dom.d.ts:11575

The **`dispatchEvent()`** method of the EventTarget sends an Event to the object, (synchronously) invoking the affected event listeners in the appropriate order.

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

Defined in: [packages/client/src/core/index.ts:579](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L579)

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

Defined in: [packages/client/src/core/index.ts:535](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L535)

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

Defined in: [packages/client/src/core/index.ts:617](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L617)

#### Returns

`Promise`\<[`Class`](Class.md)[]\>

***

### getAllClassModels()

> **getAllClassModels**(): `Promise`\<`ClassModel`[]\>

Defined in: [packages/client/src/core/index.ts:632](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L632)

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getClass()

> **getClass**(`className`, `fresh`): `Promise`\<`null` \| [`Class`](Class.md)\>

Defined in: [packages/client/src/core/index.ts:461](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L461)

#### Parameters

##### className

`string`

##### fresh

`boolean` = `false`

#### Returns

`Promise`\<`null` \| [`Class`](Class.md)\>

#### Overrides

`Stack.getClass`

***

### getClassModel()

> **getClassModel**(`className`): `Promise`\<`null` \| `ClassModel`\>

Defined in: [packages/client/src/core/index.ts:585](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L585)

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

Defined in: [packages/client/src/core/index.ts:643](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L643)

#### Parameters

##### classNames

`string`[]

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getDb()

> **getDb**(): `Database`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:122](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L122)

#### Returns

`Database`\<\{ \}\>

***

### getDbInfo()

> **getDbInfo**(): `Promise`\<`DatabaseInfo`\>

Defined in: [packages/client/src/core/index.ts:126](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L126)

#### Returns

`Promise`\<`DatabaseInfo`\>

***

### getDbName()

> **getDbName**(): `string`

Defined in: [packages/client/src/core/index.ts:130](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L130)

#### Returns

`string`

***

### getDocRevision()

> **getDocRevision**(`docId`): `Promise`\<`null` \| `string`\>

Defined in: [packages/client/src/core/index.ts:522](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L522)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `string`\>

***

### getDocument()

> **getDocument**(`docId`): `Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

Defined in: [packages/client/src/core/index.ts:507](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L507)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

***

### getLastDocId()

> **getLastDocId**(): `Promise`\<`number`\>

Defined in: [packages/client/src/core/index.ts:142](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L142)

#### Returns

`Promise`\<`number`\>

***

### getSystem()

> **getSystem**(): `Promise`\<`null` \| `SystemDoc`\>

Defined in: [packages/client/src/core/index.ts:157](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L157)

#### Returns

`Promise`\<`null` \| `SystemDoc`\>

***

### incrementLastDocId()

> **incrementLastDocId**(): `Promise`\<`undefined` \| `number`\>

Defined in: [packages/client/src/core/index.ts:654](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L654)

#### Returns

`Promise`\<`undefined` \| `number`\>

***

### initdb()

> **initdb**(): `Promise`\<`ClientStack`\>

Defined in: [packages/client/src/core/index.ts:448](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L448)

#### Returns

`Promise`\<`ClientStack`\>

***

### initIndex()

> **initIndex**(): `Promise`\<`void`\>

Defined in: [packages/client/src/core/index.ts:478](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L478)

#### Returns

`Promise`\<`void`\>

***

### onClassDoc()

> **onClassDoc**(`className`): `Changes`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:432](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L432)

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

Defined in: [packages/client/src/core/index.ts:384](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L384)

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

Defined in: [packages/client/src/core/index.ts:357](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L357)

#### Returns

`Changes`\<\{ \}\>

PouchDB.Core.Changes<{}>

***

### onClassModelPropagationComplete()

> **onClassModelPropagationComplete**(`event`): `void`

Defined in: [packages/client/src/core/index.ts:344](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L344)

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

Defined in: [packages/client/src/core/index.ts:329](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L329)

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

Defined in: [packages/client/src/core/index.ts:1017](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L1017)

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

Defined in: [packages/client/src/core/index.ts:318](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L318)

#### Returns

`void`

#### Description

Clears all listeners from the Stack

#### Overrides

`Stack.removeAllListeners`

***

### removeEventListener()

> **removeEventListener**(`type`, `callback`, `options?`): `void`

Defined in: node\_modules/typescript/lib/lib.dom.d.ts:11581

The **`removeEventListener()`** method of the EventTarget interface removes an event listener previously registered with EventTarget.addEventListener() from the target.

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

Defined in: [packages/client/src/core/index.ts:672](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L672)

#### Returns

`Promise`\<`ClientStack`\>

***

### setListeners()

> **setListeners**(): `void`

Defined in: [packages/client/src/core/index.ts:286](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L286)

#### Returns

`void`

#### Overrides

`Stack.setListeners`

***

### updateClass()

> **updateClass**(`classObj`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/index.ts:748](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L748)

#### Parameters

##### classObj

[`Class`](Class.md)

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Stack.updateClass`

***

### validateObject()

> **validateObject**(`obj`, `type`, `schema`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/index.ts:817](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L817)

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

Defined in: [packages/client/src/core/index.ts:990](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L990)

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

Defined in: [packages/client/src/core/index.ts:699](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L699)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`unknown`\>

***

### create()

> `static` **create**(`conn`, `options?`): `Promise`\<`ClientStack`\>

Defined in: [packages/client/src/core/index.ts:135](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/index.ts#L135)

#### Parameters

##### conn

`string`

##### options?

`StackOptions`

#### Returns

`Promise`\<`ClientStack`\>
