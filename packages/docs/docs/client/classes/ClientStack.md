# Class: ClientStack

Defined in: [packages/client/src/core/index.ts:63](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L63)

## Extends

- `Stack`

## Properties

### appVersion

> **appVersion**: `string` = `"0.0.1"`

Defined in: [packages/client/src/core/index.ts:72](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L72)

#### Overrides

`Stack.appVersion`

***

### cache

> **cache**: `object`

Defined in: [packages/client/src/core/index.ts:74](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L74)

#### Index Signature

\[`className`: `string`\]: `CachedClass`

#### Overrides

`Stack.cache`

***

### connection

> **connection**: `string`

Defined in: [packages/client/src/core/index.ts:70](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L70)

#### Overrides

`Stack.connection`

***

### db

> **db**: `Database`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:65](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L65)

#### Overrides

`Stack.db`

***

### lastDocId

> **lastDocId**: `number`

Defined in: [packages/client/src/core/index.ts:68](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L68)

#### Overrides

`Stack.lastDocId`

***

### listeners

> **listeners**: `Changes`\<\{ \}\>[] = `[]`

Defined in: [packages/client/src/core/index.ts:79](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L79)

#### Overrides

`Stack.listeners`

***

### modelWorker

> **modelWorker**: `null` \| `Worker` = `null`

Defined in: [packages/client/src/core/index.ts:81](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L81)

#### Overrides

`Stack.modelWorker`

***

### name

> **name**: `string`

Defined in: [packages/client/src/core/index.ts:66](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L66)

#### Overrides

`Stack.name`

***

### options?

> `optional` **options**: `StackOptions`

Defined in: [packages/client/src/core/index.ts:71](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L71)

#### Overrides

`Stack.options`

***

### patchCount

> **patchCount**: `number`

Defined in: [packages/client/src/core/index.ts:77](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L77)

#### Overrides

`Stack.patchCount`

***

### patches

> **patches**: `Patch`[] = `[]`

Defined in: [packages/client/src/core/index.ts:83](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L83)

#### Overrides

`Stack.patches`

***

### schemaVersion

> **schemaVersion**: `undefined` \| `string`

Defined in: [packages/client/src/core/index.ts:82](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L82)

#### Overrides

`Stack.schemaVersion`

## Methods

### addClass()

> **addClass**(`classObj`): `Promise`\<`ClassModel`\>

Defined in: [packages/client/src/core/index.ts:724](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L724)

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

Defined in: [packages/client/src/core/index.ts:407](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L407)

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

Defined in: [packages/client/src/core/index.ts:765](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L765)

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

Defined in: [packages/client/src/core/index.ts:258](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L258)

#### Returns

`Promise`\<`void`\>

***

### clearClassLock()

> **clearClassLock**(`className`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/index.ts:428](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L428)

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

Defined in: [packages/client/src/core/index.ts:465](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L465)

#### Returns

`void`

#### Overrides

`Stack.close`

***

### createDoc()

> **createDoc**(`docId`, `type`, `classObj`, `params`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/index.ts:1037](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L1037)

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

Defined in: [packages/client/src/core/index.ts:1127](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L1127)

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

Defined in: [packages/client/src/core/index.ts:693](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L693)

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

### dump()

> **dump**(): `Promise`\<`AllDocsResponse`\<\{ \}\>\>

Defined in: [packages/client/src/core/index.ts:136](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L136)

#### Returns

`Promise`\<`AllDocsResponse`\<\{ \}\>\>

#### Overrides

`Stack.dump`

***

### findDocument()

> **findDocument**(`selector`, `fields`, `skip`, `limit`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/index.ts:589](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L589)

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

Defined in: [packages/client/src/core/index.ts:545](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L545)

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

Defined in: [packages/client/src/core/index.ts:627](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L627)

#### Returns

`Promise`\<[`Class`](Class.md)[]\>

***

### getAllClassModels()

> **getAllClassModels**(): `Promise`\<`ClassModel`[]\>

Defined in: [packages/client/src/core/index.ts:642](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L642)

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getClass()

> **getClass**(`className`, `fresh`): `Promise`\<`null` \| [`Class`](Class.md)\>

Defined in: [packages/client/src/core/index.ts:471](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L471)

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

Defined in: [packages/client/src/core/index.ts:595](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L595)

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

Defined in: [packages/client/src/core/index.ts:653](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L653)

#### Parameters

##### classNames

`string`[]

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getDb()

> **getDb**(): `Database`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:124](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L124)

#### Returns

`Database`\<\{ \}\>

***

### getDbInfo()

> **getDbInfo**(): `Promise`\<`DatabaseInfo`\>

Defined in: [packages/client/src/core/index.ts:128](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L128)

#### Returns

`Promise`\<`DatabaseInfo`\>

***

### getDbName()

> **getDbName**(): `string`

Defined in: [packages/client/src/core/index.ts:132](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L132)

#### Returns

`string`

***

### getDocRevision()

> **getDocRevision**(`docId`): `Promise`\<`null` \| `string`\>

Defined in: [packages/client/src/core/index.ts:532](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L532)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `string`\>

***

### getDocument()

> **getDocument**(`docId`): `Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

Defined in: [packages/client/src/core/index.ts:517](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L517)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`null` \| `ExistingDocument`\<\{ \}\>\>

***

### getLastDocId()

> **getLastDocId**(): `Promise`\<`number`\>

Defined in: [packages/client/src/core/index.ts:149](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L149)

#### Returns

`Promise`\<`number`\>

***

### getSystem()

> **getSystem**(): `Promise`\<`null` \| `SystemDoc`\>

Defined in: [packages/client/src/core/index.ts:164](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L164)

#### Returns

`Promise`\<`null` \| `SystemDoc`\>

***

### incrementLastDocId()

> **incrementLastDocId**(): `Promise`\<`undefined` \| `number`\>

Defined in: [packages/client/src/core/index.ts:664](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L664)

#### Returns

`Promise`\<`undefined` \| `number`\>

***

### initdb()

> **initdb**(): `Promise`\<`ClientStack`\>

Defined in: [packages/client/src/core/index.ts:458](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L458)

#### Returns

`Promise`\<`ClientStack`\>

***

### initIndex()

> **initIndex**(): `Promise`\<`void`\>

Defined in: [packages/client/src/core/index.ts:488](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L488)

#### Returns

`Promise`\<`void`\>

***

### onClassDoc()

> **onClassDoc**(`className`): `Changes`\<\{ \}\>

Defined in: [packages/client/src/core/index.ts:442](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L442)

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

Defined in: [packages/client/src/core/index.ts:394](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L394)

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

Defined in: [packages/client/src/core/index.ts:367](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L367)

#### Returns

`Changes`\<\{ \}\>

PouchDB.Core.Changes<{}>

***

### onClassModelPropagationComplete()

> **onClassModelPropagationComplete**(`event`): `void`

Defined in: [packages/client/src/core/index.ts:354](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L354)

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

Defined in: [packages/client/src/core/index.ts:339](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L339)

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

Defined in: [packages/client/src/core/index.ts:1027](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L1027)

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

Defined in: [packages/client/src/core/index.ts:328](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L328)

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

Defined in: [packages/client/src/core/index.ts:682](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L682)

#### Returns

`Promise`\<`ClientStack`\>

***

### setListeners()

> **setListeners**(): `void`

Defined in: [packages/client/src/core/index.ts:296](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L296)

#### Returns

`void`

#### Overrides

`Stack.setListeners`

***

### updateClass()

> **updateClass**(`classObj`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/index.ts:758](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L758)

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

Defined in: [packages/client/src/core/index.ts:827](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L827)

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

Defined in: [packages/client/src/core/index.ts:1000](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L1000)

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

Defined in: [packages/client/src/core/index.ts:709](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L709)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`unknown`\>

***

### create()

> `static` **create**(`conn`, `options?`): `Promise`\<`ClientStack`\>

Defined in: [packages/client/src/core/index.ts:142](https://github.com/onyx-og/docstack/blob/4c91ccc0c048deefa90df955aedb28105b2e2ce1/packages/client/src/core/index.ts#L142)

#### Parameters

##### conn

`string`

##### options?

`StackOptions`

#### Returns

`Promise`\<`ClientStack`\>
