# Class: Class

Defined in: [packages/client/src/core/class.ts:20](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L20)

## Extends

- `Class`

## Properties

### attributes

> **attributes**: `object` = `{}`

Defined in: [packages/client/src/core/class.ts:27](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L27)

#### Index Signature

\[`name`: `string`\]: [`Attribute`](Attribute.md)

#### Overrides

`Class_.attributes`

***

### description?

> `optional` **description**: `string`

Defined in: [packages/client/src/core/class.ts:26](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L26)

#### Overrides

`Class_.description`

***

### id?

> `optional` **id**: `string`

Defined in: [packages/client/src/core/class.ts:30](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L30)

#### Overrides

`Class_.id`

***

### logger

> **logger**: `Logger`

Defined in: [packages/client/src/core/class.ts:35](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L35)

#### Overrides

`Class_.logger`

***

### model

> **model**: `ClassModel`

Defined in: [packages/client/src/core/class.ts:32](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L32)

#### Overrides

`Class_.model`

***

### name

> **name**: `string`

Defined in: [packages/client/src/core/class.ts:23](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L23)

#### Overrides

`Class_.name`

***

### schema

> **schema**: `object` = `{}`

Defined in: [packages/client/src/core/class.ts:28](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L28)

#### Index Signature

\[`name`: `string`\]: `AttributeModel`

#### Overrides

`Class_.schema`

***

### schemaZOD

> **schemaZOD**: `ZodObject`

Defined in: [packages/client/src/core/class.ts:29](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L29)

#### Overrides

`Class_.schemaZOD`

***

### stack

> **stack**: `undefined` \| `Stack`

Defined in: [packages/client/src/core/class.ts:21](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L21)

#### Overrides

`Class_.stack`

***

### state

> **state**: `"busy"` \| `"idle"` = `"idle"`

Defined in: [packages/client/src/core/class.ts:33](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L33)

#### Overrides

`Class_.state`

***

### triggers

> **triggers**: `Trigger`[] = `[]`

Defined in: [packages/client/src/core/class.ts:36](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L36)

#### Overrides

`Class_.triggers`

***

### type

> **type**: `string`

Defined in: [packages/client/src/core/class.ts:25](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L25)

#### Overrides

`Class_.type`

***

### logger

> `static` **logger**: `Logger`

Defined in: [packages/client/src/core/class.ts:34](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L34)

#### Overrides

`Class_.logger`

## Methods

### addAttribute()

> **addAttribute**(`attribute`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:381](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L381)

#### Parameters

##### attribute

`AttributeModel` | [`Attribute`](Attribute.md)

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.addAttribute`

***

### addCard()

> **addCard**(`params`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/class.ts:465](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L465)

#### Parameters

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Class_.addCard`

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

`Class_.addEventListener`

***

### addOrUpdateCard()

> **addOrUpdateCard**(`params`, `cardId?`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/class.ts:496](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L496)

#### Parameters

##### params

##### cardId?

`string`

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Class_.addOrUpdateCard`

***

### addTrigger()

> **addTrigger**(`name`, `model`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:548](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L548)

#### Parameters

##### name

`string`

##### model

`TriggerModel`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.addTrigger`

***

### build()

> **build**(): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:54](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L54)

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.build`

***

### buildSchema()

> **buildSchema**(): `object`

Defined in: [packages/client/src/core/class.ts:265](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L265)

#### Returns

`object`

#### Overrides

`Class_.buildSchema`

***

### bulkUniqueCheck()

> **bulkUniqueCheck**(`pKs`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/class.ts:185](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L185)

#### Parameters

##### pKs

`string`[]

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Class_.bulkUniqueCheck`

***

### deleteCard()

> **deleteCard**(`cardId`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/class.ts:530](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L530)

#### Parameters

##### cardId

`string`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Class_.deleteCard`

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

`Class_.dispatchEvent`

***

### getAttributes()

> **getAttributes**(...`names`): `object`

Defined in: [packages/client/src/core/class.ts:336](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L336)

#### Parameters

##### names

...`string`[]

#### Returns

`object`

#### Overrides

`Class_.getAttributes`

***

### getByPrimaryKeys()

> **getByPrimaryKeys**(`params`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/class.ts:469](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L469)

#### Parameters

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Class_.getByPrimaryKeys`

***

### getCards()

> **getCards**(`selector?`, `fields?`, `skip?`, `limit?`): `Promise`\<`Document`[]\>

Defined in: [packages/client/src/core/class.ts:541](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L541)

#### Parameters

##### selector?

##### fields?

`string`[]

##### skip?

`number`

##### limit?

`number`

#### Returns

`Promise`\<`Document`[]\>

#### Overrides

`Class_.getCards`

***

### getDescription()

> **getDescription**(): `undefined` \| `string`

Defined in: [packages/client/src/core/class.ts:253](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L253)

#### Returns

`undefined` \| `string`

#### Overrides

`Class_.getDescription`

***

### getId()

> **getId**(): `undefined` \| `string`

Defined in: [packages/client/src/core/class.ts:261](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L261)

#### Returns

`undefined` \| `string`

#### Overrides

`Class_.getId`

***

### getModel()

> **getModel**(): `ClassModel`

Defined in: [packages/client/src/core/class.ts:273](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L273)

#### Returns

`ClassModel`

#### Overrides

`Class_.getModel`

***

### getName()

> **getName**(): `string`

Defined in: [packages/client/src/core/class.ts:245](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L245)

#### Returns

`string`

#### Overrides

`Class_.getName`

***

### getPrimaryKeys()

> **getPrimaryKeys**(): `string`[]

Defined in: [packages/client/src/core/class.ts:331](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L331)

#### Returns

`string`[]

#### Overrides

`Class_.getPrimaryKeys`

***

### getStack()

> **getStack**(): `undefined` \| `Stack`

Defined in: [packages/client/src/core/class.ts:249](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L249)

#### Returns

`undefined` \| `Stack`

#### Overrides

`Class_.getStack`

***

### getType()

> **getType**(): `string`

Defined in: [packages/client/src/core/class.ts:257](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L257)

#### Returns

`string`

#### Overrides

`Class_.getType`

***

### hasAllAttributes()

> **hasAllAttributes**(...`names`): `boolean`

Defined in: [packages/client/src/core/class.ts:355](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L355)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

#### Overrides

`Class_.hasAllAttributes`

***

### hasAnyAttributes()

> **hasAnyAttributes**(...`names`): `boolean`

Defined in: [packages/client/src/core/class.ts:365](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L365)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

#### Overrides

`Class_.hasAnyAttributes`

***

### hasAttribute()

> **hasAttribute**(`name`): `boolean`

Defined in: [packages/client/src/core/class.ts:376](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L376)

#### Parameters

##### name

`string`

#### Returns

`boolean`

#### Overrides

`Class_.hasAttribute`

***

### init()

> **init**(`stack`, `name`, `type`, `description?`, `schema?`): `void`

Defined in: [packages/client/src/core/class.ts:76](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L76)

#### Parameters

##### stack

`null` | `Stack`

##### name

`string`

##### type

`string`

##### description?

`string`

##### schema?

#### Returns

`void`

#### Overrides

`Class_.init`

***

### modifyAttribute()

> **modifyAttribute**(`name`, `attribute`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:418](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L418)

#### Parameters

##### name

`string`

##### attribute

`AttributeModel` | [`Attribute`](Attribute.md)

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.modifyAttribute`

***

### removeAttribute()

> **removeAttribute**(`name`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:442](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L442)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.removeAttribute`

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

`Class_.removeEventListener`

***

### removeTrigger()

> **removeTrigger**(`name`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:565](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L565)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.removeTrigger`

***

### setId()

> **setId**(`id`): `void`

Defined in: [packages/client/src/core/class.ts:241](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L241)

#### Parameters

##### id

`string`

#### Returns

`void`

#### Overrides

`Class_.setId`

***

### setModel()

> **setModel**(`model?`): `void`

Defined in: [packages/client/src/core/class.ts:297](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L297)

It hydrates attributes and triggers from given model

#### Parameters

##### model?

`ClassModel`

#### Returns

`void`

#### Overrides

`Class_.setModel`

***

### uniqueCheck()

> **uniqueCheck**(`doc`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/class.ts:173](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L173)

#### Parameters

##### doc

`Document`

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Class_.uniqueCheck`

***

### updateCard()

> **updateCard**(`cardId`, `params`): `Promise`\<`null` \| `Document`\>

Defined in: [packages/client/src/core/class.ts:518](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L518)

#### Parameters

##### cardId

`string`

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

#### Overrides

`Class_.updateCard`

***

### validate()

> **validate**(`data`): `Promise`\<`boolean`\>

Defined in: [packages/client/src/core/class.ts:229](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L229)

#### Parameters

##### data

#### Returns

`Promise`\<`boolean`\>

#### Overrides

`Class_.validate`

***

### buildFromModel()

> `static` **buildFromModel**(`stack`, `classModel`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:143](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L143)

#### Parameters

##### stack

`Stack`

##### classModel

`ClassModel`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.buildFromModel`

***

### create()

> `static` **create**(`stack`, `name`, `type`, `description?`, `schema?`): `Promise`\<`Class`\>

Defined in: [packages/client/src/core/class.ts:130](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L130)

#### Parameters

##### stack

`Stack`

##### name

`string`

##### type

`string` = `"class"`

##### description?

`string`

##### schema?

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.create`

***

### fetch()

> `static` **fetch**(`stack`, `className`): `Promise`\<`null` \| `Class`\>

Defined in: [packages/client/src/core/class.ts:163](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L163)

#### Parameters

##### stack

`Stack`

##### className

`string`

#### Returns

`Promise`\<`null` \| `Class`\>

#### Overrides

`Class_.fetch`

***

### get()

> `static` **get**(`stack`, `name`, `type`, `description?`, `schema?`): `Class`

Defined in: [packages/client/src/core/class.ts:108](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/class.ts#L108)

#### Parameters

##### stack

`Stack`

##### name

`string`

##### type

`string` = `"class"`

##### description?

`string`

##### schema?

#### Returns

`Class`

#### Overrides

`Class_.get`
