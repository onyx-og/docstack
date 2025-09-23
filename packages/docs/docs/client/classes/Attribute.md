# Class: Attribute

Defined in: [packages/client/src/core/attribute.ts:5](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L5)

## Extends

- `Attribute`

## Constructors

### Constructor

> **new Attribute**(`classObj`, `name`, `type`, `description?`, `config?`): `Attribute`

Defined in: [packages/client/src/core/attribute.ts:13](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L13)

#### Parameters

##### classObj

`null` | [`Class`](Class.md)

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"date"` | `"foreign_key"`

##### description?

`string`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Attribute`

#### Overrides

`Attribute_.constructor`

## Properties

### class

> **class**: `null` \| [`Class`](Class.md)

Defined in: [packages/client/src/core/attribute.ts:10](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L10)

#### Overrides

`Attribute_.class`

***

### defaultValue?

> `optional` **defaultValue**: `any`

Defined in: [packages/client/src/core/attribute.ts:11](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L11)

#### Overrides

`Attribute_.defaultValue`

***

### description?

> `optional` **description**: `string`

Defined in: [packages/client/src/core/attribute.ts:7](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L7)

#### Overrides

`Attribute_.description`

***

### field

> **field**: `ZodType`

Defined in: [packages/client/src/core/attribute.ts:9](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L9)

#### Overrides

`Attribute_.field`

***

### model

> **model**: `AttributeModel`

Defined in: [packages/client/src/core/attribute.ts:8](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L8)

#### Overrides

`Attribute_.model`

***

### name

> **name**: `string`

Defined in: [packages/client/src/core/attribute.ts:6](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L6)

#### Overrides

`Attribute_.name`

## Methods

### checkTypeValidity()

> **checkTypeValidity**(`type`): `boolean`

Defined in: [packages/client/src/core/attribute.ts:226](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L226)

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

Defined in: [packages/client/src/core/attribute.ts:176](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L176)

#### Returns

[`Class`](Class.md)

#### Overrides

`Attribute_.getClass`

***

### getEmpty()

> **getEmpty**(): `object`

Defined in: [packages/client/src/core/attribute.ts:211](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L211)

#### Returns

`object`

#### Overrides

`Attribute_.getEmpty`

***

### getModel()

> **getModel**(): `AttributeModel`

Defined in: [packages/client/src/core/attribute.ts:172](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L172)

#### Returns

`AttributeModel`

#### Overrides

`Attribute_.getModel`

***

### getName()

> **getName**(): `string`

Defined in: [packages/client/src/core/attribute.ts:222](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L222)

#### Returns

`string`

#### Overrides

`Attribute_.getName`

***

### getType()

> **getType**(`type`): `"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"date"` \| `"foreign_key"`

Defined in: [packages/client/src/core/attribute.ts:204](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L204)

#### Parameters

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"date"` | `"foreign_key"`

#### Returns

`"string"` \| `"boolean"` \| `"object"` \| `"integer"` \| `"decimal"` \| `"date"` \| `"foreign_key"`

#### Overrides

`Attribute_.getType`

***

### getTypeConf()

> **getTypeConf**(`type`, `config`): `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

Defined in: [packages/client/src/core/attribute.ts:239](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L239)

#### Parameters

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"date"` | `"foreign_key"`

##### config

`undefined` | `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig` \| `object` & `AttributeTypeConfig`

#### Overrides

`Attribute_.getTypeConf`

***

### isMandatory()

> **isMandatory**(): `boolean`

Defined in: [packages/client/src/core/attribute.ts:168](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L168)

#### Returns

`boolean`

#### Overrides

`Attribute_.isMandatory`

***

### isPrimaryKey()

> **isPrimaryKey**(): `boolean`

Defined in: [packages/client/src/core/attribute.ts:163](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L163)

#### Returns

`boolean`

#### Overrides

`Attribute_.isPrimaryKey`

***

### setField()

> **setField**(): `void`

Defined in: [packages/client/src/core/attribute.ts:31](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L31)

#### Returns

`void`

#### Overrides

`Attribute_.setField`

***

### setModel()

> **setModel**(`model`): `void`

Defined in: [packages/client/src/core/attribute.ts:196](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L196)

#### Parameters

##### model

`AttributeModel`

#### Returns

`void`

#### Overrides

`Attribute_.setModel`

***

### validate()

> **validate**(`data`): `Promise`\<`ZodSafeParseResult`\<`unknown`\>\>

Defined in: [packages/client/src/core/attribute.ts:181](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L181)

#### Parameters

##### data

`any`

#### Returns

`Promise`\<`ZodSafeParseResult`\<`unknown`\>\>

#### Overrides

`Attribute_.validate`

***

### build()

> `static` **build**(`attributeObj`): `Promise`\<`Attribute`\>

Defined in: [packages/client/src/core/attribute.ts:185](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L185)

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

Defined in: [packages/client/src/core/attribute.ts:151](https://github.com/onyx-og/docstack/blob/8fe77cd2e0f22df702409b01965e114b72d2f5c7/packages/client/src/core/attribute.ts#L151)

#### Parameters

##### classObj

[`Class`](Class.md)

##### name

`string`

##### type

`"string"` | `"boolean"` | `"object"` | `"integer"` | `"decimal"` | `"date"` | `"foreign_key"`

##### description?

`string`

##### config?

`AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig` | `object` & `AttributeTypeConfig`

#### Returns

`Promise`\<`Attribute`\>

#### Overrides

`Attribute_.create`
