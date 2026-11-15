/**
 * The code-defined model, with no engine behind it.
 *
 * `@docstack/client` is the import path an application has for everything, including the
 * model builders - but its main entry carries the whole engine, and PouchDB with it. A
 * model module is also read **outside the browser**: `docstack revision` loads it in Node
 * to diff it against the patch chain. Importing the main entry there would make
 * generating a patch depend on the storage layer resolving, which is both unnecessary and
 * a way to fail for reasons that have nothing to do with the model.
 *
 * So a model file imports from here:
 *
 * ```typescript
 * import { defineClass, a, type InferDoc } from "@docstack/client/model";
 * ```
 *
 * Everything in it is pure: declarations, the attribute-to-validator mapping, the fold
 * and the diff. The same names are re-exported from the main entry, so application code
 * that is already importing the engine does not need a second import path.
 */
export {
    defineClass,
    defineModel,
    a,
    attributeSpecToZod,
    foldPatchChain,
    diffModel,
    mergePatchSchema,
    canonicalJson,
} from "@docstack/shared";

export type {
    AttributeSpec,
    AttributeShape,
    AttributeValue,
    ClassDefinition,
    ClassDefinitionInput,
    ModelDefinition,
    InferDoc,
    InferInput,
    FoldedChain,
    ModelDiff,
    AttributeType,
    AttributeTypeConfig,
    AttributeModel,
    ClassModel,
    Patch,
} from "@docstack/shared";
