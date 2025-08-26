import Attribute, { AttributeModel } from '../Attribute';
import Surfer, { Document } from '../Surfer';
export type ClassModel = Document & {
    type: string;
    name: string;
    description: string;
    parentClass?: string;
    schema?: AttributeModel[];
};
declare class Class {
    private space?;
    private name;
    private type;
    private description;
    private attributes;
    private schema;
    private id;
    private model;
    getPrimaryKeys(): string[];
    private constructor();
    private build;
    private init;
    static create(space: Surfer, name: string, type: string, description: string): Promise<Class>;
    static buildFromModel(space: Surfer, classModel: ClassModel): Promise<Class>;
    static fetch(space: Surfer, className: string): Promise<Class>;
    setId(id: string): void;
    getName(): string;
    getSpace(): Surfer;
    getDescription(): string;
    getType(): string;
    getId(): string;
    buildSchema(): any[];
    getModel(): ClassModel;
    private setModel;
    getAttributes(...names: string[]): Attribute[];
    hasAllAttributes(...names: string[]): boolean;
    hasAnyAttributes(...names: string[]): boolean;
    hasAttribute(name: string): boolean;
    addAttribute(attribute: Attribute): Promise<Class>;
    addCard(params: {
        [key: string]: any;
    }): Promise<Document>;
    addOrUpdateCard(params: {
        [key: string]: any;
    }, cardId?: string): Promise<Document>;
    updateCard(cardId: string, params: {
        [key: string]: any;
    }): Promise<Document>;
    getCards(selector: any, fields: any, skip: any, limit: any): Promise<PouchDB.Core.ExistingDocument<{}>[] | undefined[]>;
}
export default Class;
