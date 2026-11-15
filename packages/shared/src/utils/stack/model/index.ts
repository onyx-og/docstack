/**
 * The code-defined model: declare a class once, get its TypeScript types and the
 * document the engine stores from the same definition (`proposal.md`).
 *
 * Nothing here touches a database or a Node API, so it is safe in a browser bundle and
 * in the CLI alike.
 */
export { a } from "./attributes.js";
export type {
    AttributeSpec, CommonAttributeConfig, StringConfig, NumberConfig, DecimalConfig,
    BooleanConfig, ObjectConfig, DateConfig, ForeignKeyConfig, ReferenceConfig, EnumConfig,
} from "./attributes.js";
export { defineClass, defineModel } from "./define.js";
export type { ClassDefinition, ClassDefinitionInput, ModelDefinition } from "./define.js";
export type {
    AttributeShape, AttributeValue, InferDoc, InferInput, Prettify,
} from "./infer.js";
