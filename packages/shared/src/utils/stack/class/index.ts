import Attribute from '../attribute'
import {z} from "zod";
// import ReferenceAttribute from '../Reference';
import {ClassModel, AttributeModel, Document, TriggerModel} from "../../../types";
import Stack from '..';
import { Logger } from 'winston';
import Trigger from '../trigger';

const CLASS_TYPE = "class";
const SUPERCLASS_TYPE = "superclass";
const CLASS_TYPES = [CLASS_TYPE, SUPERCLASS_TYPE];

abstract class Class extends EventTarget {
    stack: Stack | undefined;
    /* Populated in init() */
    name!: string;
    /* Populated in init() */
    type!: "class";
    description?: string;
    attributes: {[name: string]: Attribute} = {};
    schema: ClassModel["schema"] = {};
    schemaZOD: z.ZodObject = z.object({});
    id?: string;
    // parentClass: Class | null;
    model!: ClassModel;
    state: "busy" | "idle" = 'idle';
    triggers: Trigger[] = [];

    static logger: Logger;
    abstract logger: Logger;

    abstract getPrimaryKeys: () => string[];

    constructor() {
        super();
    }
    
    abstract build: () => Promise<Class>;

    abstract init: (
        stack: Stack | null,
        name: string,
        type: "class",
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null
    ) => void;

    static get: (
        stack: Stack,
        name: string,
        type: "class",
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null = null
    ) => Class;

    static create: (
        stack: Stack,
        name: string,
        type: "class",
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null = null
    ) => Promise<Class>;

    static buildFromModel: (stack: Stack, classModel: ClassModel) => Promise<Class>;

    static fetch: ( stack: Stack, className: string ) => Promise<Class | null>;

    // TODO Turn into method (after factory method instantiation refactory is done)
    abstract setId: ( id: string ) => void;

    abstract getName: () => string;

    abstract getStack: () => Stack | undefined;

    abstract getDescription: () => string | undefined;

    abstract getType: () => "class";

    abstract getId: () => string | undefined;

    abstract getByPrimaryKeys: (params: {[key: string]: any}) => Promise<Document | null>;

    abstract validate: (data: {[key: string]: any}) => Promise<boolean>;

    abstract uniqueCheck: (doc: Document) => Promise<boolean>;

    abstract bulkUniqueCheck: (pks: string[]) => Promise<boolean>;

    abstract buildSchema: () => ClassModel["schema"];

    abstract getModel: () => ClassModel;

    // Set model should be called only after fetching the latest model from db
    abstract setModel: ( model?: ClassModel ) => void;

    abstract getAttributes: ( ...names: string[] ) => {[name: string]: Attribute};

    abstract hasAllAttributes: ( ...names: string[] ) => boolean;

    abstract hasAnyAttributes: ( ...names: string[] ) => boolean;

    // interface of hasAnyAttributes
    abstract hasAttribute: ( name: string ) => boolean;


    abstract addAttribute: (attribute: Attribute | AttributeModel) => Promise<Class>;

    abstract modifyAttribute: (name: string, attribute: Attribute | AttributeModel) => Promise<Class>;

    abstract removeAttribute: (name: string) => Promise<Class>;

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    abstract addCard: (params: {[key:string]: any}) => Promise<Document | null>;

    abstract addOrUpdateCard: (params: {[key:string]: any}, cardId?: string) => Promise<Document | null>;

    abstract updateCard: (cardId: string, params: {[key:string]: any}) => Promise<Document | null>;

    abstract getCards: (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => Promise<Document[]>;

    abstract deleteCard: (cardId: string) => Promise<boolean>;

    abstract addTrigger: (name: string, model: TriggerModel) => Promise<Class>;

    abstract removeTrigger: (name: string) => Promise<Class>;
}

export default Class;