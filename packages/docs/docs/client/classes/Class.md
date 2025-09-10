# Abstract Class: Class

Defined in: [shared/src/utils/stack/class/index.ts:13](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L13)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new Class**(): `Class`

Defined in: [shared/src/utils/stack/class/index.ts:34](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L34)

#### Returns

`Class`

#### Overrides

`EventTarget.constructor`

## Properties

### addAttribute()

> `abstract` **addAttribute**: (`attribute`) => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:103](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L103)

#### Parameters

##### attribute

`Attribute`

#### Returns

`Promise`\<`Class`\>

***

### addCard()

> `abstract` **addCard**: (`params`) => `Promise`\<`null` \| `Document`\>

Defined in: [shared/src/utils/stack/class/index.ts:107](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L107)

#### Parameters

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

***

### addOrUpdateCard()

> `abstract` **addOrUpdateCard**: (`params`, `cardId?`) => `Promise`\<`null` \| `Document`\>

Defined in: [shared/src/utils/stack/class/index.ts:109](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L109)

#### Parameters

##### params

##### cardId?

`string`

#### Returns

`Promise`\<`null` \| `Document`\>

***

### addTrigger()

> `abstract` **addTrigger**: (`name`, `model`) => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:117](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L117)

#### Parameters

##### name

`string`

##### model

`TriggerModel`

#### Returns

`Promise`\<`Class`\>

***

### attributes

> **attributes**: `object` = `{}`

Defined in: [shared/src/utils/stack/class/index.ts:20](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L20)

#### Index Signature

\[`name`: `string`\]: `Attribute`

***

### build()

> `abstract` **build**: () => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:38](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L38)

#### Returns

`Promise`\<`Class`\>

***

### buildSchema()

> `abstract` **buildSchema**: () => `object`

Defined in: [shared/src/utils/stack/class/index.ts:86](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L86)

#### Returns

`object`

***

### deleteCard()

> `abstract` **deleteCard**: (`cardId`) => `Promise`\<`boolean`\>

Defined in: [shared/src/utils/stack/class/index.ts:115](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L115)

#### Parameters

##### cardId

`string`

#### Returns

`Promise`\<`boolean`\>

***

### description?

> `optional` **description**: `string`

Defined in: [shared/src/utils/stack/class/index.ts:19](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L19)

***

### getAttributes()

> `abstract` **getAttributes**: (...`names`) => `object`

Defined in: [shared/src/utils/stack/class/index.ts:93](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L93)

#### Parameters

##### names

...`string`[]

#### Returns

`object`

***

### getCards()

> `abstract` **getCards**: (`selector?`, `fields?`, `skip?`, `limit?`) => `Promise`\<`Document`[]\>

Defined in: [shared/src/utils/stack/class/index.ts:113](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L113)

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

***

### getDescription()

> `abstract` **getDescription**: () => `undefined` \| `string`

Defined in: [shared/src/utils/stack/class/index.ts:78](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L78)

#### Returns

`undefined` \| `string`

***

### getId()

> `abstract` **getId**: () => `undefined` \| `string`

Defined in: [shared/src/utils/stack/class/index.ts:82](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L82)

#### Returns

`undefined` \| `string`

***

### getModel()

> `abstract` **getModel**: () => `ClassModel`

Defined in: [shared/src/utils/stack/class/index.ts:88](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L88)

#### Returns

`ClassModel`

***

### getName()

> `abstract` **getName**: () => `string`

Defined in: [shared/src/utils/stack/class/index.ts:74](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L74)

#### Returns

`string`

***

### getPrimaryKeys()

> `abstract` **getPrimaryKeys**: () => `string`[]

Defined in: [shared/src/utils/stack/class/index.ts:32](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L32)

#### Returns

`string`[]

***

### getSpace()

> `abstract` **getSpace**: () => `undefined` \| `Stack`

Defined in: [shared/src/utils/stack/class/index.ts:76](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L76)

#### Returns

`undefined` \| `Stack`

***

### getType()

> `abstract` **getType**: () => `string`

Defined in: [shared/src/utils/stack/class/index.ts:80](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L80)

#### Returns

`string`

***

### hasAllAttributes()

> `abstract` **hasAllAttributes**: (...`names`) => `boolean`

Defined in: [shared/src/utils/stack/class/index.ts:95](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L95)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

***

### hasAnyAttributes()

> `abstract` **hasAnyAttributes**: (...`names`) => `boolean`

Defined in: [shared/src/utils/stack/class/index.ts:97](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L97)

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`

***

### hasAttribute()

> `abstract` **hasAttribute**: (`name`) => `boolean`

Defined in: [shared/src/utils/stack/class/index.ts:100](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L100)

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### hydrateSchema()

> `abstract` **hydrateSchema**: (`rawSchema`) => `void`

Defined in: [shared/src/utils/stack/class/index.ts:84](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L84)

#### Parameters

##### rawSchema

#### Returns

`void`

***

### id?

> `optional` **id**: `string`

Defined in: [shared/src/utils/stack/class/index.ts:23](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L23)

***

### init()

> `abstract` **init**: (`space`, `name`, `type`, `description?`, `schema?`) => `void`

Defined in: [shared/src/utils/stack/class/index.ts:40](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L40)

#### Parameters

##### space

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

***

### logger

> `abstract` **logger**: `Logger`

Defined in: [shared/src/utils/stack/class/index.ts:30](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L30)

***

### model

> **model**: `ClassModel`

Defined in: [shared/src/utils/stack/class/index.ts:25](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L25)

***

### name

> **name**: `string`

Defined in: [shared/src/utils/stack/class/index.ts:16](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L16)

***

### removeTrigger()

> `abstract` **removeTrigger**: (`name`) => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:119](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L119)

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`Class`\>

***

### schema

> **schema**: `object` = `{}`

Defined in: [shared/src/utils/stack/class/index.ts:21](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L21)

#### Index Signature

\[`name`: `string`\]: `AttributeModel`

***

### schemaZOD

> **schemaZOD**: `ZodObject`

Defined in: [shared/src/utils/stack/class/index.ts:22](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L22)

***

### setId()

> `abstract` **setId**: (`id`) => `void`

Defined in: [shared/src/utils/stack/class/index.ts:72](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L72)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### setModel()

> `abstract` **setModel**: (`model?`) => `void`

Defined in: [shared/src/utils/stack/class/index.ts:91](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L91)

#### Parameters

##### model?

`ClassModel`

#### Returns

`void`

***

### space

> **space**: `undefined` \| `Stack`

Defined in: [shared/src/utils/stack/class/index.ts:14](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L14)

***

### state

> **state**: `"busy"` \| `"idle"` = `'idle'`

Defined in: [shared/src/utils/stack/class/index.ts:26](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L26)

***

### triggers

> **triggers**: `Trigger`[] = `[]`

Defined in: [shared/src/utils/stack/class/index.ts:27](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L27)

***

### type

> **type**: `string`

Defined in: [shared/src/utils/stack/class/index.ts:18](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L18)

***

### updateCard()

> `abstract` **updateCard**: (`cardId`, `params`) => `Promise`\<`null` \| `Document`\>

Defined in: [shared/src/utils/stack/class/index.ts:111](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L111)

#### Parameters

##### cardId

`string`

##### params

#### Returns

`Promise`\<`null` \| `Document`\>

***

### buildFromModel()

> `static` **buildFromModel**: (`space`, `classModel`) => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:67](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L67)

#### Parameters

##### space

`Stack`

##### classModel

`ClassModel`

#### Returns

`Promise`\<`Class`\>

***

### create()

> `static` **create**: (`space`, `name`, `type`, `description?`, `schema?`) => `Promise`\<`Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:58](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L58)

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

`Promise`\<`Class`\>

***

### fetch()

> `static` **fetch**: (`space`, `className`) => `Promise`\<`null` \| `Class`\>

Defined in: [shared/src/utils/stack/class/index.ts:69](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L69)

#### Parameters

##### space

`Stack`

##### className

`string`

#### Returns

`Promise`\<`null` \| `Class`\>

***

### get()

> `static` **get**: (`space`, `name`, `type`, `description?`, `schema?`) => `Class`

Defined in: [shared/src/utils/stack/class/index.ts:49](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L49)

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

`Class`

***

### logger

> `static` **logger**: `Logger`

Defined in: [shared/src/utils/stack/class/index.ts:29](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/shared/src/utils/stack/class/index.ts#L29)

## Methods

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

`EventTarget.addEventListener`

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

`EventTarget.dispatchEvent`

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

`EventTarget.removeEventListener`
