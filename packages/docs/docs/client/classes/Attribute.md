# Class: Attribute

Defined in: [packages/client/src/utils/stack/attribute.ts:4](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L4)

## Extends

- `Attribute`

## Constructors

### Constructor

> **new Attribute**(`classObj`, `name`, `type`, `description?`, `config?`): `Attribute`

Defined in: [packages/client/src/utils/stack/attribute.ts:11](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L11)

#### Parameters

##### classObj

`null` | `Class`

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### description?

`string`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Attribute`

#### Overrides

`Attribute_.constructor`

## Properties

### class

> **class**: `null` \| `Class`

Defined in: [packages/client/src/utils/stack/attribute.ts:8](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L8)

#### Overrides

`Attribute_.class`

***

### defaultValue?

> `optional` **defaultValue**: `any`

Defined in: [packages/client/src/utils/stack/attribute.ts:9](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L9)

#### Overrides

`Attribute_.defaultValue`

***

### description?

> `optional` **description**: `string`

Defined in: [packages/client/src/utils/stack/attribute.ts:6](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L6)

#### Overrides

`Attribute_.description`

***

### model

> **model**: `AttributeModel`

Defined in: [packages/client/src/utils/stack/attribute.ts:7](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L7)

#### Overrides

`Attribute_.model`

***

### name

> **name**: `string`

Defined in: [packages/client/src/utils/stack/attribute.ts:5](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L5)

#### Overrides

`Attribute_.name`

## Methods

### checkTypeValidity()

> **checkTypeValidity**(`type`): `boolean`

Defined in: [packages/client/src/utils/stack/attribute.ts:86](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L86)

#### Parameters

##### type

`string`

#### Returns

`boolean`

#### Overrides

`Attribute_.checkTypeValidity`

***

### getClass()

> **getClass**(): `Class`

Defined in: [packages/client/src/utils/stack/attribute.ts:49](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L49)

#### Returns

`Class`

#### Overrides

`Attribute_.getClass`

***

### getModel()

> **getModel**(): `AttributeModel`

Defined in: [packages/client/src/utils/stack/attribute.ts:45](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L45)

#### Returns

`AttributeModel`

#### Overrides

`Attribute_.getModel`

***

### getName()

> **getName**(): `string`

Defined in: [packages/client/src/utils/stack/attribute.ts:82](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L82)

#### Returns

`string`

#### Overrides

`Attribute_.getName`

***

### getType()

> **getType**(`type`): `"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"foreign_key"`

Defined in: [packages/client/src/utils/stack/attribute.ts:73](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L73)

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

Defined in: [packages/client/src/utils/stack/attribute.ts:99](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L99)

#### Parameters

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### config

`undefined` | `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

#### Overrides

`Attribute_.getTypeConf`

***

### isPrimaryKey()

> **isPrimaryKey**(): `boolean`

Defined in: [packages/client/src/utils/stack/attribute.ts:40](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L40)

#### Returns

`boolean`

#### Overrides

`Attribute_.isPrimaryKey`

***

### setModel()

> **setModel**(`model`): `void`

Defined in: [packages/client/src/utils/stack/attribute.ts:65](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L65)

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

Defined in: [packages/client/src/utils/stack/attribute.ts:54](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L54)

#### Parameters

##### attributeObj

`Attribute`

#### Returns

`Promise`\<`Attribute`\>

#### Overrides

`Attribute_.build`

***

### create()

> `static` **create**(`classObj`, `name`, `type`, `description?`, `config?`): `Promise`\<`Attribute`\>

Defined in: [packages/client/src/utils/stack/attribute.ts:28](https://github.com/onyx-og/docstack/blob/b2170f8fde219e53e469f3acacbad3f9b1b531a7/packages/client/src/utils/stack/attribute.ts#L28)

#### Parameters

##### classObj

`Class`

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"foreign_key"`

##### description?

`string`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Promise`\<`Attribute`\>

#### Overrides

`Attribute_.create`
