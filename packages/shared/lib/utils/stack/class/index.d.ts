import Attribute from '../attribute';
import { z } from "zod";
import { ClassModel, AttributeModel, Document, TriggerModel } from "../../../types";
import Stack from '..';
import { Logger } from 'winston';
import Trigger from '../trigger';
declare abstract class Class extends EventTarget {
    stack: Stack | undefined;
    name: string;
    type: "class";
    description?: string;
    attributes: {
        [name: string]: Attribute;
    };
    schema: ClassModel["schema"];
    schemaZOD: z.ZodObject;
    id?: string;
    model: ClassModel;
    state: "busy" | "idle";
    triggers: Trigger[];
    static logger: Logger;
    abstract logger: Logger;
    abstract getPrimaryKeys: () => string[];
    constructor();
    abstract build: () => Promise<Class>;
    abstract init: (stack: Stack | null, name: string, type: "class", description?: string, schema?: ClassModel["schema"]) => void;
    static get: (stack: Stack, name: string, type: "class", description?: string, schema?: ClassModel["schema"]) => Class;
    static create: (stack: Stack, name: string, type: "class", description?: string, schema?: ClassModel["schema"]) => Promise<Class>;
    static buildFromModel: (stack: Stack, classModel: ClassModel) => Promise<Class>;
    static fetch: (stack: Stack, className: string) => Promise<Class | null>;
    abstract setId: (id: string) => void;
    abstract getName: () => string;
    abstract getStack: () => Stack | undefined;
    abstract getDescription: () => string | undefined;
    abstract getType: () => "class";
    abstract getId: () => string | undefined;
    abstract getByPrimaryKeys: (params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    abstract validate: (data: {
        [key: string]: any;
    }) => Promise<boolean>;
    abstract uniqueCheck: (doc: Document) => Promise<boolean>;
    abstract bulkUniqueCheck: (pks: string[]) => Promise<boolean>;
    abstract buildSchema: () => ClassModel["schema"];
    abstract getModel: () => ClassModel;
    abstract setModel: (model?: ClassModel) => void;
    abstract getAttributes: (...names: string[]) => {
        [name: string]: Attribute;
    };
    abstract hasAllAttributes: (...names: string[]) => boolean;
    abstract hasAnyAttributes: (...names: string[]) => boolean;
    abstract hasAttribute: (name: string) => boolean;
    abstract addAttribute: (attribute: Attribute | AttributeModel) => Promise<Class>;
    abstract modifyAttribute: (name: string, attribute: Attribute | AttributeModel) => Promise<Class>;
    abstract removeAttribute: (name: string) => Promise<Class>;
    abstract addCard: (params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    abstract addCards: (paramsArray: {
        [key: string]: any;
    }[]) => Promise<Document[]>;
    abstract addOrUpdateCard: (params: {
        [key: string]: any;
    }, cardId?: string) => Promise<Document | null>;
    abstract updateCard: (cardId: string, params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    abstract getCards: (selector?: {
        [key: string]: any;
    }, fields?: string[], skip?: number, limit?: number) => Promise<Document[]>;
    abstract deleteCard: (cardId: string) => Promise<boolean>;
    abstract addTrigger: (name: string, model: TriggerModel) => Promise<Class>;
    abstract removeTrigger: (name: string) => Promise<Class>;
}
export default Class;
