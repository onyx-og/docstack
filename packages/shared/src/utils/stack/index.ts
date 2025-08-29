import {
    CachedClass,
    Document,
    StoreOptions,
    ClassModel,
} from "../../types";

import Class from "./class";

abstract class Stack extends EventTarget {
    /* Initialized asynchronously */
    public db!: PouchDB.Database<{}>;
    /* Retrieved asynchronously */
    public lastDocId!: number;
    /* Populated on async constructor */
    public connection!: string;
    public options?: StoreOptions;
    public static appVersion: string = "0.0.1";
    /* Used to retrieve faster data */
    public cache: {
        [className: string]: CachedClass
    } = {}
    public patchCount!: number;

    abstract getClass: (className: string) => Promise<Class | null>;

    abstract addClass: (classObj: Class) => Promise<ClassModel>;

    abstract updateClass: (classObj: Class) => Promise<Document | null>;

    abstract createDoc: (docId: string | null, type: string,classObj: Class, params: {}) => Promise<Document | null> ;

    abstract findDocuments: (selector: {[key: string]: any}, fields?: string[], skip?: number, limit?: number ) => Promise<{
        [key: string]: any;
        docs: Document[];
    }>;

    abstract onClassDoc: (className: string) => PouchDB.Core.Changes<{}>;

    abstract getClassModel: (className: string) => Promise<ClassModel | null>;

}

export default Stack;