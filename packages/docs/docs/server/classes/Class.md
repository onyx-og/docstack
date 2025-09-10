# Class: Class

Defined in: [packages/server/src/utils/stack/class.ts:20](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L20)

## Extends

- `Class`

## Properties

### attributes

> **attributes**: `object` = `{}`

Defined in: [packages/server/src/utils/stack/class.ts:27](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L27)

#### Index Signature

\[`name`: `string`\]: [`Attribute`](Attribute.md)

#### Overrides

`Class_.attributes`

***

### description?

> `optional` **description**: `string`

Defined in: [packages/server/src/utils/stack/class.ts:26](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L26)

#### Overrides

`Class_.description`

***

### id?

> `optional` **id**: `string`

Defined in: [packages/server/src/utils/stack/class.ts:30](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L30)

#### Overrides

`Class_.id`

***

### logger

> **logger**: `Logger`

Defined in: [packages/server/src/utils/stack/class.ts:35](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L35)

#### Overrides

`Class_.logger`

***

### model

> **model**: `ClassModel`

Defined in: [packages/server/src/utils/stack/class.ts:32](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L32)

#### Overrides

`Class_.model`

***

### name

> **name**: `string`

Defined in: [packages/server/src/utils/stack/class.ts:23](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L23)

#### Overrides

`Class_.name`

***

### schema

> **schema**: `object` = `{}`

Defined in: [packages/server/src/utils/stack/class.ts:28](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L28)

#### Index Signature

\[`name`: `string`\]: `AttributeModel`

#### Overrides

`Class_.schema`

***

### schemaZOD

> **schemaZOD**: `ZodObject`

Defined in: [packages/server/src/utils/stack/class.ts:29](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L29)

#### Overrides

`Class_.schemaZOD`

***

### space

> **space**: `Stack`

Defined in: [packages/server/src/utils/stack/class.ts:21](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L21)

#### Overrides

`Class_.space`

***

### state

> **state**: `"busy"` \| `"idle"` = `"idle"`

Defined in: [packages/server/src/utils/stack/class.ts:33](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L33)

#### Overrides

`Class_.state`

***

### triggers

> **triggers**: `Trigger`[] = `[]`

Defined in: [packages/server/src/utils/stack/class.ts:36](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L36)

#### Overrides

`Class_.triggers`

***

### type

> **type**: `string`

Defined in: [packages/server/src/utils/stack/class.ts:25](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L25)

#### Overrides

`Class_.type`

***

### logger

> `static` **logger**: `Logger`

Defined in: [packages/server/src/utils/stack/class.ts:34](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L34)

#### Overrides

`Class_.logger`

## Methods

### addAttribute()

> **addAttribute**(`attribute`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:409](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L409)

#### Parameters

##### attribute

[`Attribute`](Attribute.md)

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.addAttribute`

***

### addCard()

> **addCard**(`params`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/class.ts:442](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L442)

#### Parameters

##### params

#### Returns

`Promise`\<`Document`\>

#### Overrides

`Class_.addCard`

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

`Class_.addEventListener`

***

### addOrUpdateCard()

> **addOrUpdateCard**(`params`, `cardId?`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/class.ts:446](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L446)

#### Parameters

##### params

##### cardId?

`string`

#### Returns

`Promise`\<`Document`\>

#### Overrides

`Class_.addOrUpdateCard`

***

### addTrigger()

> **addTrigger**(`name`, `model`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:515](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L515)

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

Defined in: [packages/server/src/utils/stack/class.ts:54](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L54)

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.build`

***

### buildSchema()

> **buildSchema**(): `object`

Defined in: [packages/server/src/utils/stack/class.ts:297](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L297)

#### Returns

`object`

#### Overrides

`Class_.buildSchema`

***

### deleteCard()

> **deleteCard**(`cardId`): `Promise`\<`boolean`\>

Defined in: [packages/server/src/utils/stack/class.ts:497](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L497)

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

Defined in: packages/docs/node\_modules/typescript/lib/lib.dom.d.ts:8309

Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise.

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

Defined in: [packages/server/src/utils/stack/class.ts:364](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L364)

#### Parameters

##### names

...`string`[]

#### Returns

`object`

#### Overrides

`Class_.getAttributes`

***

### getCards()

> **getCards**(`selector?`, `fields?`, `skip?`, `limit?`): `Promise`\<`Document`[]\>

Defined in: [packages/server/src/utils/stack/class.ts:508](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L508)

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

> **getDescription**(): `string`

Defined in: [packages/server/src/utils/stack/class.ts:285](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L285)

#### Returns

`string`

#### Overrides

`Class_.getDescription`

***

### getId()

> **getId**(): `string`

Defined in: [packages/server/src/utils/stack/class.ts:293](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L293)

#### Returns

`string`

#### Overrides

`Class_.getId`

***

### getModel()

> **getModel**(): `ClassModel`

Defined in: [packages/server/src/utils/stack/class.ts:305](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L305)

#### Returns

`ClassModel`

#### Overrides

`Class_.getModel`

***

### getName()

> **getName**(): `string`

Defined in: [packages/server/src/utils/stack/class.ts:277](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L277)

#### Returns

`string`

#### Overrides

`Class_.getName`

***

### getPrimaryKeys()

> **getPrimaryKeys**(): `string`[]

Defined in: [packages/server/src/utils/stack/class.ts:359](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L359)

#### Returns

`string`[]

#### Overrides

`Class_.getPrimaryKeys`

***

### getSpace()

> **getSpace**(): `Stack`

Defined in: [packages/server/src/utils/stack/class.ts:281](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L281)

#### Returns

`Stack`

#### Overrides

`Class_.getSpace`

***

### getType()

> **getType**(): `string`

Defined in: [packages/server/src/utils/stack/class.ts:289](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L289)

#### Returns

`string`

#### Overrides

`Class_.getType`

***

### hasAllAttributes()

> **hasAllAttributes**(...`names`): `boolean`

Defined in: [packages/server/src/utils/stack/class.ts:383](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L383)

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

Defined in: [packages/server/src/utils/stack/class.ts:393](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L393)

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

Defined in: [packages/server/src/utils/stack/class.ts:404](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L404)

#### Parameters

##### name

`string`

#### Returns

`boolean`

#### Overrides

`Class_.hasAttribute`

***

### hydrateSchema()

> **hydrateSchema**(`rawSchema`): `void`

Defined in: [packages/server/src/utils/stack/class.ts:173](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L173)

#### Parameters

##### rawSchema

#### Returns

`void`

#### Overrides

`Class_.hydrateSchema`

***

### init()

> **init**(`space`, `name`, `type`, `description?`, `schema?`): `void`

Defined in: [packages/server/src/utils/stack/class.ts:76](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L76)

#### Parameters

##### space

`Stack`

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

`Class_.removeEventListener`

***

### removeTrigger()

> **removeTrigger**(`name`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:532](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L532)

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

Defined in: [packages/server/src/utils/stack/class.ts:273](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L273)

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

Defined in: [packages/server/src/utils/stack/class.ts:329](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L329)

It hydrates attributes and triggers from given model

#### Parameters

##### model?

`ClassModel`

#### Returns

`void`

#### Overrides

`Class_.setModel`

***

### updateCard()

> **updateCard**(`cardId`, `params`): `Promise`\<`Document`\>

Defined in: [packages/server/src/utils/stack/class.ts:485](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L485)

#### Parameters

##### cardId

`string`

##### params

#### Returns

`Promise`\<`Document`\>

#### Overrides

`Class_.updateCard`

***

### buildFromModel()

> `static` **buildFromModel**(`space`, `classModel`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:142](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L142)

#### Parameters

##### space

`Stack`

##### classModel

`ClassModel`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.buildFromModel`

***

### create()

> `static` **create**(`space`, `name`, `type`, `description?`, `schema?`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:129](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L129)

#### Parameters

##### space

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

> `static` **fetch**(`space`, `className`): `Promise`\<`Class`\>

Defined in: [packages/server/src/utils/stack/class.ts:162](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L162)

#### Parameters

##### space

`Stack`

##### className

`string`

#### Returns

`Promise`\<`Class`\>

#### Overrides

`Class_.fetch`

***

### get()

> `static` **get**(`space`, `name`, `type`, `description?`, `schema?`): `Class`

Defined in: [packages/server/src/utils/stack/class.ts:107](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/class.ts#L107)

#### Parameters

##### space

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
