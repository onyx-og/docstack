import Class from "./class";
import Domain from "./domain";
import { Stack, StackOptions, CachedClass, ClassModelPropagationStart, ClassModelPropagationComplete, CachedDomain, DomainModel } from "@docstack/shared";
import { SystemDoc, Patch, ClassModel, Document } from "@docstack/shared";
import type { SelectAST, UnionAST } from "./query-engine";
export declare const BASE_SCHEMA: ClassModel["schema"];
export declare const CLASS_SCHEMA: ClassModel["schema"];
declare class ClientStack extends Stack {
    db: PouchDB.Database<{}>;
    name: string;
    lastDocId: number;
    connection: string;
    options?: StackOptions;
    appVersion: string;
    cache: {
        [className: string]: CachedClass | CachedDomain;
    };
    patches: Patch[];
    patchCount: number;
    listeners: PouchDB.Core.Changes<{}>[];
    modelWorker: Worker | null;
    schemaVersion: string | undefined;
    private constructor();
    private initialize;
    getDb(): PouchDB.Database<{}>;
    getDbInfo(): Promise<PouchDB.Core.DatabaseInfo>;
    getDbName(): string;
    dump: () => Promise<PouchDB.Core.AllDocsResponse<{}>>;
    static create(conn: string, options?: StackOptions): Promise<ClientStack>;
    getLastDocId(): Promise<number>;
    getSystem(): Promise<SystemDoc | null>;
    private loadPatches;
    private applyPatch;
    private applyPatches;
    checkSystem(): Promise<void>;
    setListeners: () => void;
    /**
     * @description Clears all listeners from the Stack
     */
    removeAllListeners: () => void;
    /**
     * @description When a class model propagation starts write the ~lock document to the database.
     * It prevents any further modifications on the class data model
     * @param event
     */
    onClassModelPropagationStart: (event: CustomEvent<ClassModelPropagationStart>) => void;
    /**
     * @description When a class model propagation comes to completion remove the corresponding
     * ~lock from the database
     * @param event
     */
    onClassModelPropagationComplete: (event: CustomEvent<ClassModelPropagationComplete>) => void;
    /**
     * @returns PouchDB.Core.Changes<{}>
     */
    onClassModelChanges: () => PouchDB.Core.Changes<{}>;
    onClassLock: (className: string) => PouchDB.Core.Changes<{}>;
    addClassLock: (className: string) => Promise<boolean>;
    clearClassLock: (className: string) => Promise<boolean>;
    onClassDoc: (className: string) => PouchDB.Core.Changes<{}>;
    initdb(): Promise<this>;
    close: () => void;
    getClass: (className: string, fresh?: boolean) => Promise<Class | null>;
    getDomain: (domainName: string, fresh?: boolean) => Promise<Domain | null>;
    initIndex(): Promise<void>;
    getDocument(docId: string): Promise<PouchDB.Core.ExistingDocument<{}> | null>;
    getDocRevision(docId: string): Promise<string | null>;
    findDocuments: (selector: {
        [key: string]: any;
    }, fields?: string[], skip?: number, limit?: number) => Promise<{
        [key: string]: any;
        docs: Document[];
    }>;
    findDocument(selector: any, fields?: undefined, skip?: undefined, limit?: undefined): Promise<Document | null>;
    getClassModel: (className: string) => Promise<ClassModel | null>;
    getDomainModel: (domainName: string) => Promise<DomainModel | null>;
    getClassModels: (conf?: {
        listen?: boolean;
        filter?: string[];
        search?: string;
    }) => Promise<{
        list: ClassModel[];
        listener?: undefined;
    } | {
        list: ClassModel[];
        listener: PouchDB.Core.Changes<{}>;
    }>;
    getClasses: (conf: {
        filter?: string[];
        search?: string;
    }) => Promise<Class[]>;
    getDomainModels: (conf?: {
        listen?: boolean;
        filter?: string[];
        search?: string;
    }) => Promise<{
        list: DomainModel[];
        listener?: undefined;
    } | {
        list: DomainModel[];
        listener: PouchDB.Core.Changes<{}>;
    }>;
    getDomains: (conf: {
        filter?: string[];
        search?: string;
    }) => Promise<Domain[]>;
    incrementLastDocId(): Promise<number | undefined>;
    reset(): Promise<this>;
    destroyDb(): Promise<false | undefined>;
    static clear(conn: string): Promise<unknown>;
    addClass: (classObj: Class) => Promise<ClassModel>;
    addDomain: (domainObj: Domain) => Promise<DomainModel>;
    updateClass: (classObj: Class) => Promise<Document | null>;
    addDesignDocumentPKs: (className: string, pKs: string[], temp?: boolean) => Promise<string>;
    prepareDoc(_id: string, type: string, params: {
        [key: string]: string | number | boolean;
    }): {
        [key: string]: string | number | boolean;
    };
    createDoc: (docId: string | null, type: string, classObj: Class | ClassModel["schema"], params: {}) => Promise<Document | null>;
    createDocs: (docs: {
        docId: string | null;
        params: {};
    }[], type: string, classObj: Class | ClassModel["schema"]) => Promise<Document[]>;
    createRelationDoc: (docId: string | null, relationName: string, domainObj: Domain, params: {
        sourceClass: string;
        targetClass: string;
        sourceId: string;
        targetId: string;
    }) => Promise<Document | null>;
    createRelationDocs: (docs: {
        docId: string | null;
        params: {
            sourceClass: string;
            targetClass: string;
            sourceId: string;
            targetId: string;
        };
    }[], relationName: string, domainObj: Domain) => Promise<Document[]>;
    /**
     * Sets the active param of a document to false
     * @param _id
     * @returns Promise<boolean>
     */
    deleteDocument: (_id: string) => Promise<boolean>;
    query: (sql: string, ...params: any[]) => Promise<{
        rows: any;
        ast: (SelectAST | UnionAST)[];
    } | {
        rows: never[];
        ast: null;
    }>;
}
export default ClientStack;
