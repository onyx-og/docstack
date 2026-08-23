import StackProvider, {DocStackContext, useDocStack} from "./components/StackProvider/index.js";
import { useFind, useQuerySQL } from "./hooks/index.js";
import { useClass, useClassList, useClassDocs, useClassCreate } from "./hooks/class.js";
import { useDomainList, useDomain, useDomainRelations, useDomainCreate } from "./hooks/domain.js";

export { StackProvider, DocStackContext, useDocStack };
export { useFind, useQuerySQL };

export { useClassList, useClass, useClassDocs, useClassCreate };
export { useDomainList, useDomain, useDomainRelations, useDomainCreate };

/**
 * Document-modelling types, re-exported from `@docstack/client`.
 *
 * Sourced from the client rather than `@docstack/shared` on purpose: the two packages
 * would otherwise resolve their own copies of `@docstack/shared`, and a consumer using
 * both could end up holding two structurally-identical-but-distinct `Patch` types.
 * One source means one copy.
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
} from "@docstack/client";
