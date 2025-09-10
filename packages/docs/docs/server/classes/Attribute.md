# Class: Attribute

Defined in: [packages/server/src/utils/stack/attribute.ts:4](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L4)

## Extends

- `Attribute`

## Constructors

### Constructor

> **new Attribute**(`classObj`, `name`, `type`, `config?`): `Attribute`

Defined in: [packages/server/src/utils/stack/attribute.ts:10](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L10)

#### Parameters

##### classObj

[`Class`](Class.md) = `null`

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Attribute`

#### Overrides

`Attribute_.constructor`

## Properties

### class

> **class**: [`Class`](Class.md)

Defined in: [packages/server/src/utils/stack/attribute.ts:7](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L7)

#### Overrides

`Attribute_.class`

***

### defaultValue?

> `optional` **defaultValue**: `any`

Defined in: [packages/server/src/utils/stack/attribute.ts:8](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L8)

#### Overrides

`Attribute_.defaultValue`

***

### model

> **model**: `AttributeModel`

Defined in: [packages/server/src/utils/stack/attribute.ts:6](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L6)

#### Overrides

`Attribute_.model`

***

### name

> **name**: `string`

Defined in: [packages/server/src/utils/stack/attribute.ts:5](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L5)

#### Overrides

`Attribute_.name`

## Methods

### checkTypeValidity()

> **checkTypeValidity**(`type`): `boolean`

Defined in: [packages/server/src/utils/stack/attribute.ts:82](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L82)

#### Parameters

##### type

`string`

#### Returns

`boolean`

#### Overrides

`Attribute_.checkTypeValidity`

***

### getClass()

> **getClass**(): [`Class`](Class.md)

Defined in: [packages/server/src/utils/stack/attribute.ts:45](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L45)

#### Returns

[`Class`](Class.md)

#### Overrides

`Attribute_.getClass`

***

### getModel()

> **getModel**(): `AttributeModel`

Defined in: [packages/server/src/utils/stack/attribute.ts:41](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L41)

#### Returns

`AttributeModel`

#### Overrides

`Attribute_.getModel`

***

### getName()

> **getName**(): `string`

Defined in: [packages/server/src/utils/stack/attribute.ts:78](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L78)

#### Returns

`string`

#### Overrides

`Attribute_.getName`

***

### getType()

> **getType**(`type`): `"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

Defined in: [packages/server/src/utils/stack/attribute.ts:69](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L69)

#### Parameters

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

#### Returns

`"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

#### Overrides

`Attribute_.getType`

***

### getTypeConf()

> **getTypeConf**(`type`, `config`): `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

Defined in: [packages/server/src/utils/stack/attribute.ts:95](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L95)

#### Parameters

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

#### Overrides

`Attribute_.getTypeConf`

***

### isPrimaryKey()

> **isPrimaryKey**(): `boolean`

Defined in: [packages/server/src/utils/stack/attribute.ts:36](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L36)

#### Returns

`boolean`

#### Overrides

`Attribute_.isPrimaryKey`

***

### setModel()

> **setModel**(`model`): `void`

Defined in: [packages/server/src/utils/stack/attribute.ts:61](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L61)

#### Parameters

##### model

`AttributeModel`

#### Returns

`void`

#### Overrides

`Attribute_.setModel`

***

### build()

> `static` **build**(`attributeObj`): `Promise`\<`Attribute`\>

Defined in: [packages/server/src/utils/stack/attribute.ts:50](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L50)

#### Parameters

##### attributeObj

`Attribute`

#### Returns

`Promise`\<`Attribute`\>

#### Overrides

`Attribute_.build`

***

### create()

> `static` **create**(`classObj`, `name`, `type`, `config?`): `Promise`\<`Attribute`\>

Defined in: [packages/server/src/utils/stack/attribute.ts:25](https://github.com/onyx-og/docstack/blob/e1811111621ad0131f194807e782fe7339ab2ab7/packages/server/src/utils/stack/attribute.ts#L25)

#### Parameters

##### classObj

[`Class`](Class.md)

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Promise`\<`Attribute`\>

#### Overrides

`Attribute_.create`
