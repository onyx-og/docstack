# Class: Class

Defined in: [server/src/utils/dbManager/Class/index.ts:21](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L21)

## Methods

### addAttribute()

> **addAttribute**(`attribute`): `Promise`\<`Class`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:294](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L294)

#### Parameters

##### attribute

[`Attribute`](Attribute.md)

#### Returns

`Promise`\<`Class`\>

***

### addCard()

> **addCard**(`params`): `Promise`\<`Document`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:339](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L339)

#### Parameters

##### params

#### Returns

`Promise`\<`Document`\>

***

### addOrUpdateCard()

> **addOrUpdateCard**(`params`, `cardId?`): `Promise`\<`Document`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:343](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L343)

#### Parameters

##### params

##### cardId?

`string`

#### Returns

`Promise`\<`Document`\>

***

### buildSchema()

> **buildSchema**(): `any`[]

Defined in: [server/src/utils/dbManager/Class/index.ts:147](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L147)

#### Returns

`any`[]

***

### getAttributes()

> **getAttributes**(...`names`): [`Attribute`](Attribute.md)[]

Defined in: [server/src/utils/dbManager/Class/index.ts:204](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L204)

#### Parameters

##### names

...`string`[]

#### Returns

[`Attribute`](Attribute.md)[]

***

### getCards()

> **getCards**(`selector`, `fields`, `skip`, `limit`): `Promise`\<`ExistingDocument`\<\{ \}\>[] \| `undefined`[]\>

Defined in: [server/src/utils/dbManager/Class/index.ts:366](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L366)

#### Parameters

##### selector

`any`

##### fields

`any`

##### skip

`any`

##### limit

`any`

#### Returns

`Promise`\<`ExistingDocument`\<\{ \}\>[] \| `undefined`[]\>

***

### getDescription()

> **getDescription**(): `string`

Defined in: [server/src/utils/dbManager/Class/index.ts:135](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L135)

#### Returns

`string`

***

### getId()

> **getId**(): `string`

Defined in: [server/src/utils/dbManager/Class/index.ts:143](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L143)

#### Returns

`string`

***

### getModel()

> **getModel**(): `ClassModel`

Defined in: [server/src/utils/dbManager/Class/index.ts:157](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L157)

#### Returns

`ClassModel`

***

### getName()

> **getName**(): `string`

Defined in: [server/src/utils/dbManager/Class/index.ts:127](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L127)

#### Returns

`string`

***

### getPrimaryKeys()

> **getPrimaryKeys**(): `string`[]

Defined in: [server/src/utils/dbManager/Class/index.ts:32](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L32)

#### Returns

`string`[]

***

### getSpace()

> **getSpace**(): [`Store`](Store.md)

Defined in: [server/src/utils/dbManager/Class/index.ts:131](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L131)

#### Returns

[`Store`](Store.md)

***

### getType()

> **getType**(): `string`

Defined in: [server/src/utils/dbManager/Class/index.ts:139](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L139)

#### Returns

`string`

***

### hasAllAttributes()

> **hasAllAttributes**(...`names`): `boolean`

Defined in: [server/src/utils/dbManager/Class/index.ts:220](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L220)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

***

### hasAnyAttributes()

> **hasAnyAttributes**(...`names`): `boolean`

Defined in: [server/src/utils/dbManager/Class/index.ts:230](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L230)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

***

### hasAttribute()

> **hasAttribute**(`name`): `boolean`

Defined in: [server/src/utils/dbManager/Class/index.ts:241](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L241)

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### setId()

> **setId**(`id`): `void`

Defined in: [server/src/utils/dbManager/Class/index.ts:123](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L123)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### updateCard()

> **updateCard**(`cardId`, `params`): `Promise`\<`Document`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:362](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L362)

#### Parameters

##### cardId

`string`

##### params

#### Returns

`Promise`\<`Document`\>

***

### buildFromModel()

> `static` **buildFromModel**(`space`, `classModel`): `Promise`\<`Class`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:101](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L101)

#### Parameters

##### space

[`Store`](Store.md)

##### classModel

`ClassModel`

#### Returns

`Promise`\<`Class`\>

***

### create()

> `static` **create**(`space`, `name`, `type`, `description`): `Promise`\<`Class`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:88](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L88)

#### Parameters

##### space

[`Store`](Store.md)

##### name

`string`

##### type

`string` = `"class"`

##### description

`string`

#### Returns

`Promise`\<`Class`\>

***

### fetch()

> `static` **fetch**(`space`, `className`): `Promise`\<`Class`\>

Defined in: [server/src/utils/dbManager/Class/index.ts:113](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Class/index.ts#L113)

#### Parameters

##### space

[`Store`](Store.md)

##### className

`string`

#### Returns

`Promise`\<`Class`\>
