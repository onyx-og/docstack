# Class: DocStack

Defined in: [packages/client/src/index.ts:35](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L35)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new DocStack**(...`config`): `DocStack`

Defined in: [packages/client/src/index.ts:189](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L189)

#### Parameters

##### config

...`StackConfig`[]

#### Returns

`DocStack`

#### Overrides

`EventTarget.constructor`

## Methods

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

`EventTarget.addEventListener`

***

### clearConnection()

> **clearConnection**(`conn`): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:121](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L121)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`void`\>

***

### createAttribute()

> **createAttribute**(`className`, `params`): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:162](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L162)

#### Parameters

##### className

`string`

##### params

###### config?

\{ \}

###### description?

`string`

###### name

`string`

###### type

`"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"date"` \| `"foreign_key"`

#### Returns

`Promise`\<`void`\>

***

### createClass()

> **createClass**(`name`, `config`): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:137](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L137)

#### Parameters

##### name

`string`

##### config

###### description

`string`

###### type

`string`

#### Returns

`Promise`\<`void`\>

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

`EventTarget.dispatchEvent`

***

### getReadyState()

> **getReadyState**(): `boolean`

Defined in: [packages/client/src/index.ts:109](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L109)

#### Returns

`boolean`

***

### getStack()

> **getStack**(`name`): `undefined` \| [`ClientStack`](ClientStack.md)

Defined in: [packages/client/src/index.ts:105](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L105)

#### Parameters

##### name

`string`

#### Returns

`undefined` \| [`ClientStack`](ClientStack.md)

***

### getStacks()

> **getStacks**(): [`ClientStack`](ClientStack.md)[]

Defined in: [packages/client/src/index.ts:101](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L101)

#### Returns

[`ClientStack`](ClientStack.md)[]

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

`EventTarget.removeEventListener`

***

### reset()

> **reset**(): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:112](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L112)

#### Returns

`Promise`\<`void`\>

***

### resetAll()

> **resetAll**(): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:91](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/index.ts#L91)

#### Returns

`Promise`\<`void`\>
