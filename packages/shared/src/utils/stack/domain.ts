import { Logger } from "winston";
import { DomainModel, Document, DomainRelationValidation, DomainRelationParams, Class, RelationDocument } from "../../types";
import Stack from "./"

abstract class Domain extends EventTarget {
    abstract stack: Stack | undefined;
    abstract name: string;
    abstract type: DomainModel["~class"];
    abstract description: string | undefined;
    abstract id: string;
    abstract relation: DomainModel["relation"];
    abstract sourceClass: Class;
    abstract targetClass: Class;
    // parentDomain: Domain | null;
    abstract model: DomainModel;
    abstract state: "busy" | "idle";
    static logger: Logger;
    abstract logger: Logger;
    
    constructor() {
        super();
    }

    abstract getStack: () => typeof this.stack;

    abstract getName: () => string;

    abstract setId: ( id: string ) => void; 

    abstract setModel: ( model?: DomainModel ) => void;

    abstract build: () => Promise<Domain>;

    abstract init: (
        stack: Stack | null,
        id: string | null,
        name: string,
        type: DomainModel["~class"],
        relation: typeof this.relation,
        sourceClass: Class,
        targetClass: Class,
        description?: string,
        // schema: DomainModel["schema"] = {}
    ) => void;

    static get: (
        stack: Stack,
        id: string,
        name: string,
        type: DomainModel["~class"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: Class,
        targetClass: Class,
        description?: string,
    ) => Domain;

    static create:(
        stack: Stack,
        id: string | null,
        name: string,
        type: DomainModel["~class"],
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: Class,
        targetClass: Class,
        description?: string,
        // parentClass: Class | null = null
    ) => Promise<Domain>

    static buildFromModel: (stack: Stack, domainModel: DomainModel) => Promise<Domain>

    static fetch: ( stack: Stack, domainName: string ) => Promise<Domain | null>

    abstract getModel: () => DomainModel;

    abstract requireStack: () => Stack;

    abstract getDocumentRole: (doc: Document) => "source" | "target";

    abstract assertReferenceAllowed: (role: "source" | "target") => void;

    abstract buildRelationParams: (doc: Document, referenceId: string, role: "source" | "target") => DomainRelationParams;

    abstract fetchReferenceDocument: (referenceId: string, expectedType: string) => Promise<Document>;

    abstract validateRelation: (doc: Document, targetId: string) => Promise<DomainRelationValidation>;

    abstract findRelationDoc: (selector: {[key: string]: any}) => Promise<RelationDocument | null>;

    abstract throwIfRelationExists: (filter: {[key: string]: any}, params: DomainRelationParams) => Promise<RelationDocument | null>;

    abstract ensureCardinalityConstraints: (params: DomainRelationParams) => Promise<void>;

    abstract addRelation: (sourceDoc: Document, targetId: string) => Promise<RelationDocument | null>;

    abstract getRelations: (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => Promise<RelationDocument[]>;

    abstract deleteRelation: (sourceId: string, targetId: string) => Promise<boolean>;

    abstract deleteRelationDoc: (relationDocId: string) => Promise<boolean>;
}

export default Domain;