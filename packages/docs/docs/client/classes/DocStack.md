# Class: DocStack

Defined in: [client/src/index.ts:34](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L34)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new DocStack**(`config?`): `DocStack`

Defined in: [client/src/index.ts:155](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L155)

#### Parameters

##### config?

###### dbName

`string`

#### Returns

`DocStack`

#### Overrides

`EventTarget.constructor`

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

### clearConnection()

> **clearConnection**(`conn`): `Promise`\<`void`\>

Defined in: [client/src/index.ts:88](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L88)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`void`\>

***

### createAttribute()

> **createAttribute**(`className`, `params`): `Promise`\<`void`\>

Defined in: [client/src/index.ts:128](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L128)

#### Parameters

##### className

`string`

##### params

###### config

\{ \}

###### name

`string`

###### type

`"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

#### Returns

`Promise`\<`void`\>

***

### createClass()

> **createClass**(`name`, `config`): `Promise`\<`void`\>

Defined in: [client/src/index.ts:103](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L103)

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

### getReadyState()

> **getReadyState**(): `boolean`

Defined in: [client/src/index.ts:76](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L76)

#### Returns

`boolean`

***

### getStore()

> **getStore**(): [`ClientStack`](ClientStack.md)

Defined in: [client/src/index.ts:72](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L72)

#### Returns

[`ClientStack`](ClientStack.md)

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

***

### reset()

> **reset**(): `Promise`\<`void`\>

Defined in: [client/src/index.ts:79](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L79)

#### Returns

`Promise`\<`void`\>

***

### resetDb()

> **resetDb**(): `Promise`\<`void`\>

Defined in: [client/src/index.ts:64](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/client/src/index.ts#L64)

#### Returns

`Promise`\<`void`\>
