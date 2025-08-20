import Class, { ClassModel } from "../Class";
import { AttributeModel } from "../Attribute";
export declare const BASE_SCHEMA: AttributeModel[];
export declare const CLASS_SCHEMA: (AttributeModel | {
    name: "schema";
    type: "attribute";
    config: {};
})[];
export type Document = PouchDB.Core.ExistingDocument<{
    type: string;
    createTimestamp: number;
    updateTimestamp?: number | null;
    [key: string]: any;
}>;
export interface Patch {
    version: string;
    docs: (PouchDB.Core.ExistingDocument<{
        [key: string]: any;
    }> | PouchDB.Core.Document<{
        [key: string]: any;
    }>)[];
}
type SurferOptions = {
    plugins: PouchDB.Plugin[];
} & PouchDB.Configuration.DatabaseConfiguration;
declare class Surfer {
    private db;
    private lastDocId;
    private connection;
    private options;
    private static appVersion;
    private constructor();
    private initialize;
    getDbInfo(): Promise<PouchDB.Core.DatabaseInfo>;
    getDbName(): string;
    static create(conn: string, options?: SurferOptions): Promise<Surfer>;
    getLastDocId(): Promise<number>;
    getSystem(): Promise<any>;
    private loadPatches;
    private applyPatch;
    private applyPatches;
    checkSystem(): Promise<void>;
    initdb(): Promise<this>;
    getClass(className: string): Promise<Class>;
    initIndex(): Promise<void>;
    getDocument(docId: string): Promise<PouchDB.Core.ExistingDocument<{}>>;
    getDocRevision(docId: string): Promise<string>;
    findDocuments(selector: any, fields?: any, skip?: any, limit?: any): Promise<{
        [key: string]: any;
        docs: (PouchDB.Core.ExistingDocument<{}>)[] | undefined[];
    }>;
    findDocument(selector: any, fields?: any, skip?: any, limit?: any): Promise<PouchDB.Core.ExistingDocument<{}>>;
    getClassModel(className: string): Promise<ClassModel>;
    getAllClassModels(): Promise<ClassModel[]>;
    getClassModels(classNames: string[]): Promise<ClassModel[]>;
    incrementLastDocId(): Promise<number>;
    reset(): Promise<this>;
    destroyDb(): Promise<unknown>;
    static clear(conn: string): Promise<unknown>;
    addClass(classObj: Class): Promise<ClassModel>;
    updateClass(classObj: Class): Promise<Document>;
    validateObject(obj: any, type: string, attributeModels: AttributeModel[]): Promise<boolean>;
    validateObjectByType(obj: any, type: string, schema?: ClassModel["schema"]): Promise<boolean>;
    prepareDoc(_id: string, type: string, params: object): object;
    createDoc(docId: string, type: string, classObj: Class, params: any): Promise<Document>;
}
export default Surfer;
