import {
    CachedClass,
    Document,
    StackOptions,
    ClassModel,
    Patch,
    CachedDomain,
    DomainModel,
    SelectAST,
    UnionAST,
} from "../../types";

import Class from "./class";
import Domain from "./domain";

abstract class Stack extends EventTarget {
    /* Initialized asynchronously */
    public db!: PouchDB.Database<{}>;
    /* Retrieved asynchronously */
    public lastDocId!: number;
    /* Populated on async constructor */
    public connection!: string;
    public options?: StackOptions;
    abstract name: string;
    public appVersion: string = "0.0.1";
    abstract schemaVersion: string | undefined;
    abstract patches: Patch[];
    /* Used to retrieve faster data */
    public cache: {
        [className: string]: CachedClass | CachedDomain
    } = {}
    public patchCount!: number;

    listeners: PouchDB.Core.Changes<{}>[] = [];

    modelWorker: Worker | null = null;

    abstract dump: () => Promise<PouchDB.Core.AllDocsResponse<{}>>;

    abstract setListeners: () => void;

    abstract close: () => void;

    abstract removeAllListeners: () => void;

    abstract getClass: (className: string, fresh?: boolean) => Promise<Class | null>;

    abstract getDomain: (domainName: string, fresh?: boolean) => Promise<Domain | null>;

    abstract addClass: (classObj: Class) => Promise<ClassModel>;

    abstract addDomain: (domainObj: Domain) => Promise<DomainModel>;

    abstract updateClass: (classObj: Class) => Promise<Document | null>;

    abstract addClassLock: (className: string) => Promise<boolean>;

    abstract clearClassLock: (className: string) => Promise<boolean>;

    abstract onClassModelPropagationStart: (event: CustomEvent<any>) => void;

    abstract onClassLock: (className: string) => PouchDB.Core.Changes<{}>;

    abstract onClassDoc: (className: string) => PouchDB.Core.Changes<{}>;

    abstract validateObjectByType: (obj: any, type: string, schema?: ClassModel["schema"]) => Promise<boolean>;

    abstract createDoc: (docId: string | null, type: string,classObj: Class | ClassModel["schema"], params: {}) => Promise<Document | null>;

    abstract createDocs: ( docs: {docId: string | null, params: {}}[], type: string, classObj: Class | ClassModel["schema"] ) => Promise<Document[]>;

    abstract createRelationDoc: (docId: string | null, relationName: string, domainObj: Domain, params: {
        sourceClass: string,
        targetClass: string,
        sourceId: string,
        targetId: string
    }) => Promise<Document | null>;

    abstract createRelationDocs: ( docs: {docId: string | null, params: {
        sourceClass: string,
        targetClass: string,
        sourceId: string,
        targetId: string
    }}[], relationName: string, domainObj: Domain ) => Promise<Document[]>;

    abstract findDocuments: (selector: {[key: string]: any}, fields?: string[], skip?: number, limit?: number ) => Promise<{
        [key: string]: any;
        docs: Document[];
    }>;


    abstract getClassModel: (className: string) => Promise<ClassModel | null>;

    abstract getDomainModel: (domainName: string) => Promise<DomainModel | null>;

    abstract deleteDocument: (_id: string) => Promise<boolean>;

    abstract addDesignDocumentPKs: (className: string, pKs: string[], temp?: boolean) => Promise<string>;

    abstract query: (sql: string, ...params: any[]) => Promise<{ rows: any[]; ast: (SelectAST | UnionAST)[]; } | { rows: never[]; ast: null; }>;
}

export default Stack;