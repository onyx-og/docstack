# Class: Attribute

Defined in: [server/src/utils/dbManager/Attribute/index.ts:46](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L46)

## Constructors

### Constructor

> **new Attribute**(`classObj`, `name`, `type`, `config?`): `Attribute`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:52](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L52)

#### Parameters

##### classObj

[`Class`](Class.md) = `null`

##### name

`string`

##### type

`"string"` | `"boolean"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Attribute`

## Properties

### class

> **class**: [`Class`](Class.md)

Defined in: [server/src/utils/dbManager/Attribute/index.ts:49](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L49)

***

### defaultValue?

> `optional` **defaultValue**: `any`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:50](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L50)

***

### model

> **model**: `AttributeModel`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:48](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L48)

***

### name

> **name**: `string`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:47](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L47)

## Methods

### checkTypeValidity()

> **checkTypeValidity**(`type`): `boolean`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:123](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L123)

#### Parameters

##### type

`any`

#### Returns

`boolean`

***

### getClass()

> **getClass**(): [`Class`](Class.md)

Defined in: [server/src/utils/dbManager/Attribute/index.ts:86](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L86)

#### Returns

[`Class`](Class.md)

***

### getModel()

> **getModel**(): `AttributeModel`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:82](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L82)

#### Returns

`AttributeModel`

***

### getName()

> **getName**(): `string`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:119](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L119)

#### Returns

`string`

***

### getType()

> **getType**(`type`): `"string"` \| `"boolean"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:110](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L110)

#### Parameters

##### type

`"string"` | `"boolean"` | `"integer"` | `"decimal"` | `"foreign_key"`

#### Returns

`"string"` \| `"boolean"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

***

### getTypeConf()

> **getTypeConf**(`type`, `config`): `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:136](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L136)

#### Parameters

##### type

`"string"` | `"boolean"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

***

### isPrimaryKey()

> **isPrimaryKey**(): `boolean`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:77](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L77)

#### Returns

`boolean`

***

### setModel()

> **setModel**(`model`): `void`

Defined in: [server/src/utils/dbManager/Attribute/index.ts:102](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L102)

#### Parameters

##### model

`AttributeModel`

#### Returns

`void`

***

### build()

> `static` **build**(`attributeObj`): `Promise`\<`Attribute`\>

Defined in: [server/src/utils/dbManager/Attribute/index.ts:91](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L91)

#### Parameters

##### attributeObj

`Attribute`

#### Returns

`Promise`\<`Attribute`\>

***

### create()

> `static` **create**(`classObj`, `name`, `type`, `config?`): `Promise`\<`Attribute`\>

Defined in: [server/src/utils/dbManager/Attribute/index.ts:66](https://github.com/onyx-og/docstack/blob/cf14b69edf319c37febe9f63990e8b31ca2bebd9/server/src/utils/dbManager/Attribute/index.ts#L66)

#### Parameters

##### classObj

[`Class`](Class.md) = `null`

##### name

`string`

##### type

`"string"` | `"boolean"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Promise`\<`Attribute`\>
