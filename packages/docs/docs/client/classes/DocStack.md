# Class: DocStack

Defined in: [packages/client/src/index.ts:34](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L34)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new DocStack**(`config?`): `DocStack`

Defined in: [packages/client/src/index.ts:155](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L155)

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

Defined in: [packages/client/src/index.ts:88](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L88)

#### Parameters

##### conn

`string`

#### Returns

`Promise`\<`void`\>

***

### createAttribute()

> **createAttribute**(`className`, `params`): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:128](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L128)

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

`"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

#### Returns

`Promise`\<`void`\>

***

### createClass()

> **createClass**(`name`, `config`): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:103](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L103)

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

Defined in: [packages/client/src/index.ts:76](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L76)

#### Returns

`boolean`

***

### getStore()

> **getStore**(): [`ClientStack`](ClientStack.md)

Defined in: [packages/client/src/index.ts:72](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L72)

#### Returns

[`ClientStack`](ClientStack.md)

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

Defined in: [packages/client/src/index.ts:79](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L79)

#### Returns

`Promise`\<`void`\>

***

### resetDb()

> **resetDb**(): `Promise`\<`void`\>

Defined in: [packages/client/src/index.ts:64](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/index.ts#L64)

#### Returns

`Promise`\<`void`\>
