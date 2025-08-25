# Class: Store

Defined in: [server/src/utils/dbManager/Store/index.ts:92](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L92)

## Methods

### addClass()

> **addClass**(`classObj`): `Promise`\<`ClassModel`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:524](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L524)

#### Parameters

##### classObj

[`Class`](Class.md)

#### Returns

`Promise`\<`ClassModel`\>

***

### checkSystem()

> **checkSystem**(): `Promise`\<`void`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:260](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L260)

#### Returns

`Promise`\<`void`\>

***

### createDoc()

> **createDoc**(`docId`, `type`, `classObj`, `params`): `Promise`\<`Document`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:774](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L774)

#### Parameters

##### docId

`string`

##### type

`string`

##### classObj

[`Class`](Class.md)

##### params

`any`

#### Returns

`Promise`\<`Document`\>

***

### destroyDb()

> **destroyDb**(): `Promise`\<`unknown`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:492](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L492)

#### Returns

`Promise`\<`unknown`\>

***

### findDocument()

> **findDocument**(`selector`, `fields`, `skip`, `limit`): `Promise`\<`ExistingDocument`\<\{ \}\>\>

Defined in: [server/src/utils/dbManager/Store/index.ts:409](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L409)

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

`Promise`\<`ExistingDocument`\<\{ \}\>\>

***

### findDocuments()

> **findDocuments**(`selector`, `fields`, `skip`, `limit`): `Promise`\<\{\[`key`: `string`\]: `any`; `docs`: `ExistingDocument`\<\{ \}\>[] \| `undefined`[]; \}\>

Defined in: [server/src/utils/dbManager/Store/index.ts:377](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L377)

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

`Promise`\<\{\[`key`: `string`\]: `any`; `docs`: `ExistingDocument`\<\{ \}\>[] \| `undefined`[]; \}\>

***

### getAllClassModels()

> **getAllClassModels**(): `Promise`\<`ClassModel`[]\>

Defined in: [server/src/utils/dbManager/Store/index.ts:446](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L446)

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getClass()

> **getClass**(`className`): `Promise`\<[`Class`](Class.md)\>

Defined in: [server/src/utils/dbManager/Store/index.ts:308](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L308)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<[`Class`](Class.md)\>

***

### getClassModel()

> **getClassModel**(`className`): `Promise`\<`ClassModel`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:415](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L415)

#### Parameters

##### className

`string`

#### Returns

`Promise`\<`ClassModel`\>

***

### getClassModels()

> **getClassModels**(`classNames`): `Promise`\<`ClassModel`[]\>

Defined in: [server/src/utils/dbManager/Store/index.ts:457](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L457)

#### Parameters

##### classNames

`string`[]

#### Returns

`Promise`\<`ClassModel`[]\>

***

### getDb()

> **getDb**(): `Database`\<\{ \}\>

Defined in: [server/src/utils/dbManager/Store/index.ts:136](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L136)

#### Returns

`Database`\<\{ \}\>

***

### getDbInfo()

> **getDbInfo**(): `Promise`\<`DatabaseInfo`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:140](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L140)

#### Returns

`Promise`\<`DatabaseInfo`\>

***

### getDbName()

> **getDbName**(): `string`

Defined in: [server/src/utils/dbManager/Store/index.ts:144](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L144)

#### Returns

`string`

***

### getDocRevision()

> **getDocRevision**(`docId`): `Promise`\<`string`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:364](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L364)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`string`\>

***

### getDocument()

> **getDocument**(`docId`): `Promise`\<`ExistingDocument`\<\{ \}\>\>

Defined in: [server/src/utils/dbManager/Store/index.ts:349](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L349)

#### Parameters

##### docId

`string`

#### Returns

`Promise`\<`ExistingDocument`\<\{ \}\>\>

***

### getLastDocId()

> **getLastDocId**(): `Promise`\<`number`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:156](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L156)

#### Returns

`Promise`\<`number`\>

***

### getSystem()

> **getSystem**(): `Promise`\<`SystemDoc`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:171](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L171)

#### Returns

`Promise`\<`SystemDoc`\>

***

### incrementLastDocId()

> **incrementLastDocId**(): `Promise`\<`number`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:468](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L468)

#### Returns

`Promise`\<`number`\>

***

### initdb()

> **initdb**(): `Promise`\<`Store`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:301](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L301)

#### Returns

`Promise`\<`Store`\>

***

### initIndex()

> **initIndex**(): `Promise`\<`void`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:320](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L320)

#### Returns

`Promise`\<`void`\>

***

### prepareDoc()

> **prepareDoc**(`_id`, `type`, `params`): `object`

Defined in: [server/src/utils/dbManager/Store/index.ts:765](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L765)

#### Parameters

##### \_id

`string`

##### type

`string`

##### params

`object`

#### Returns

`object`

***

### reset()

> **reset**(): `Promise`\<`Store`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:481](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L481)

#### Returns

`Promise`\<`Store`\>

***

### updateClass()

> **updateClass**(`classObj`): `Promise`\<`Document`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:549](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L549)

#### Parameters

##### classObj

[`Class`](Class.md)

#### Returns

`Promise`\<`Document`\>

***

### validateObject()

> **validateObject**(`obj`, `type`, `attributeModels`): `Promise`\<`boolean`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:568](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L568)

#### Parameters

##### obj

`any`

##### type

`string`

##### attributeModels

`AttributeModel`[]

#### Returns

`Promise`\<`boolean`\>

***

### validateObjectByType()

> **validateObjectByType**(`obj`, `type`, `schema?`): `Promise`\<`boolean`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:738](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L738)

#### Parameters

##### obj

`any`

##### type

`string`

##### schema?

`AttributeModel`[]

#### Returns

`Promise`\<`boolean`\>

***

### clear()

> `static` **clear**(`conn`): `Promise`\<`unknown`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:509](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L509)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`unknown`\>

***

### create()

> `static` **create**(`conn`, `options?`): `Promise`\<`Store`\>

Defined in: [server/src/utils/dbManager/Store/index.ts:149](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Store/index.ts#L149)

#### Parameters

##### conn

`string`

##### options?

`StoreOptions`

#### Returns

`Promise`\<`Store`\>
