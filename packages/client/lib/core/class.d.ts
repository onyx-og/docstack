import { Class as Class_, TriggerModel } from "@docstack/shared";
import { Stack, ClassModel, AttributeModel, Document } from "@docstack/shared";
import Attribute from "./attribute";
import { Logger } from 'winston';
import { Trigger } from "./trigger";
import { z } from "zod";
declare class Class extends Class_ {
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
    static logger: Logger;
    logger: Logger;
    triggers: Trigger[];
    private constructor();
    build: () => Promise<Class>;
    init: (stack: Stack | null, name: string, type: "class", description?: string, schema?: ClassModel["schema"]) => void;
    static get: (stack: Stack, name: string, type?: "class", description?: string, schema?: ClassModel["schema"]) => Class;
    static create: (stack: Stack, name: string, type?: "class", description?: string, schema?: ClassModel["schema"]) => Promise<Class>;
    static buildFromModel: (stack: Stack, classModel: ClassModel) => Promise<Class>;
    static fetch: (stack: Stack, className: string) => Promise<Class | null>;
    uniqueCheck: (doc: Document) => Promise<boolean>;
    bulkUniqueCheck: (pKs: string[]) => Promise<boolean>;
    validate: (data: {
        [key: string]: any;
    }) => Promise<boolean>;
    setId: (id: string) => void;
    getName: () => string;
    getStack: () => Stack | undefined;
    getDescription: () => string | undefined;
    getType: () => "class";
    getId: () => string | undefined;
    buildSchema: () => {
        [name: string]: AttributeModel;
    };
    getModel: () => ClassModel;
    /**
     * It hydrates attributes and triggers from given model
     * @param model
     */
    setModel: (model?: ClassModel) => void;
    getPrimaryKeys: () => string[];
    getAttributes: (...names: string[]) => {
        [name: string]: Attribute;
    };
    hasAllAttributes: (...names: string[]) => boolean;
    hasAnyAttributes: (...names: string[]) => boolean;
    hasAttribute: (name: string) => boolean;
    addAttribute: (attribute: Attribute | AttributeModel) => Promise<Class>;
    modifyAttribute: (name: string, attribute: Attribute | AttributeModel) => Promise<Class>;
    removeAttribute: (name: string) => Promise<Class>;
    addCard: (params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    addCards: (paramsArray: {
        [key: string]: any;
    }[]) => Promise<Document[]>;
    getByPrimaryKeys: (params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    addOrUpdateCard: (params: {
        [key: string]: any;
    }, cardId?: string) => Promise<Document | null>;
    updateCard: (cardId: string, params: {
        [key: string]: any;
    }) => Promise<Document | null>;
    deleteCard: (cardId: string) => Promise<boolean>;
    getCards: (selector?: {
        [key: string]: any;
    }, fields?: string[], skip?: number, limit?: number) => Promise<Document[]>;
    addTrigger: (name: string, model: TriggerModel) => Promise<this>;
    removeTrigger: (name: string) => Promise<this>;
}
export default Class;
