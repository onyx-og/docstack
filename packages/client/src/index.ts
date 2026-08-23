import { DocStack } from "./core/index.js";

export { ClientStack, Class, Domain, Attribute, Trigger, DocStack } from "./core/index.js";

/**
 * Document-modelling types, re-exported from `@docstack/shared`.
 *
 * These describe the values consumers have to construct themselves — most of all
 * `Patch`, which `StackOptions.patches` asks for. `@docstack/shared` is an internal
 * package, so surfacing them here is the only import path an application has.
 *
 * Note that `Document` shadows the DOM's global `Document` in whichever module imports
 * it; alias it (`import type { Document as DocStackDocument }`) in code that needs both.
 */
export type {
    AttributeType,
    AttributeTypeConfig,
    AttributeModel,
    ClassModel,
    DomainModel,
    TriggerModel,
    Document,
    RelationDocument,
    Patch,
    SelectAST,
    UnionAST,
    ClientCredentials,
    DocstackReady,
    StackConfig,
    StackOptions,
} from "@docstack/shared";

export default DocStack;
