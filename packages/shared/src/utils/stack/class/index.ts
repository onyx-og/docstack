import Attribute from '../attribute'
import logger from "../../logger";
// import ReferenceAttribute from '../Reference';
import {ClassModel, AttributeModel, Document} from "../../../types";
import Stack from '..';
import { Logger } from 'winston';

const CLASS_TYPE = "class";
const SUPERCLASS_TYPE = "superclass";
const CLASS_TYPES = [CLASS_TYPE, SUPERCLASS_TYPE];

abstract class Class extends EventTarget {
    space: Stack | null = null;
    /* Populated in init() */
    name!: string;
    /* Populated in init() */
    type!: string;
    description?: string;
    attributes: Attribute[] = [];
    schema!: AttributeModel[]
    id?: string;
    // parentClass: Class | null;
    model!: ClassModel;
    state: "busy" | "idle" = 'idle';

    static logger: Logger;

    abstract getPrimaryKeys: () => string[];

    constructor() {
        super();
    }
    
    abstract build: () => Promise<Class>;

    abstract init: (
        space: Stack | null,
        name: string,
        type: string,
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null
    ) => void;

    static get: (
        space: Stack,
        name: string,
        type: string,
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null = null
    ) => Class;

    static create: (
        space: Stack,
        name: string,
        type: string,
        description?: string,
        schema?: ClassModel["schema"],
        // parentClass: Class | null = null
    ) => Promise<Class>;

    static buildFromModel: (space: Stack, classModel: ClassModel) => Promise<Class>;

    static fetch: ( space: Stack, className: string ) => Promise<Class | null>;

    // TODO Turn into method (after factory method instantiation refactory is done)
    abstract setId: ( id: string ) => void;

    abstract getName: () => string;

    abstract getSpace: () => Stack | null;

    abstract getDescription: () => string | undefined;

    abstract getType: () => string;

    abstract getId: () => string | undefined;

    abstract buildSchema: () => AttributeModel[];

    abstract getModel: () => ClassModel;

    // Set model should be called only after fetching the latest model from db
    abstract setModel: ( model: ClassModel ) => void;

    abstract getAttributes: ( ...names: string[] ) => Attribute[];

    abstract hasAllAttributes: ( ...names: string[] ) => boolean;

    abstract hasAnyAttributes: ( ...names: string[] ) => boolean;

    // interface of hasAnyAttributes
    abstract hasAttribute: ( name: string ) => boolean;


    abstract addAttribute: (attribute: Attribute) => Promise<Class>;

    // TODO: modify to pass also the current class model
    // consider first fetching/updating the local class model
    abstract addCard: (params: {[key:string]: any}) => Promise<Document | null>;

    abstract addOrUpdateCard: (params: {[key:string]: any}, cardId?: string) => Promise<Document | null>;

    abstract updateCard: (cardId: string, params: {[key:string]: any}) => Promise<Document | null>;

    abstract getCards: (selector?: {[key: string]: any}, fields?: string[], skip?: number, limit?: number) => Promise<Document[]>;

    abstract deleteCard: (cardId: string) => Promise<boolean>;
}

export default Class;