import { Logger } from "winston";
import { DomainModel, Document } from "../../types";
import Stack from "./"

abstract class Domain extends EventTarget {
    abstract stack: Stack | undefined;
    abstract name: string;
    abstract type: "domain";
    abstract description: string | undefined;
    abstract id: string;
    abstract schema: DomainModel["schema"];
    abstract relation: DomainModel["relation"];
    abstract sourceClass: string;
    abstract targetClass: string;
    // parentDomain: Domain | null;
    abstract model: DomainModel;
    abstract state: "busy" | "idle";
    static logger: Logger;
    abstract logger: Logger;
    
    constructor() {
        super();
    }

    abstract getStack: () => typeof this.stack;

    abstract setId: ( id: string ) => void; 

    abstract setModel: ( model?: DomainModel ) => void;

    abstract build: () => Promise<Domain>;

    abstract init: (
        stack: Stack | null,
        name: string,
        type: "domain",
        relation: typeof this.relation,
        sourceClass: string,
        targetClass: string,
        description?: string,
        // schema: DomainModel["schema"] = {}
    ) => void;

    static get: (
        stack: Stack,
        name: string,
        type: "domain",
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema?: DomainModel["schema"],
    ) => Domain;

    static create:(
        stack: Stack,
        name: string,
        type: "domain",
        relation: "1:1" | "1:N" | "N:1" | "N:N",
        sourceClass: string,
        targetClass: string,
        description?: string,
        schema?: DomainModel["schema"]
        // parentClass: Class | null = null
    ) => Promise<Domain>

    static buildFromModel: (stack: Stack, domainModel: DomainModel) => Promise<Domain>

    static fetch: ( stack: Stack, domainName: string ) => Promise<Domain | null>

    abstract getModel: () => DomainModel;

    abstract validateRelation: (doc: Document, targetId: string) => Promise<boolean>;

    abstract addRelation: (sourceDoc: Document, targetId: string) => Promise<Document | null>;
}

export default Domain;