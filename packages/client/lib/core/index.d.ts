import ClientStack from './stack';
import Class from "./class";
import Domain from './domain';
import { Trigger } from "./trigger";
import Attribute from './attribute';
import { AttributeType, StackConfig } from "@docstack/shared";
declare class DocStack extends EventTarget {
    private config;
    private readyState;
    private store;
    private stacks;
    private logger;
    private addStack;
    private initStacks;
    resetAll(): Promise<void>;
    getStacks(): ClientStack[];
    getStack: (name: string) => ClientStack | undefined;
    getReadyState(): boolean;
    reset(): Promise<void>;
    clearConnection: (conn: string) => Promise<void>;
    export: (stackName: string) => Promise<PouchDB.Core.AllDocsResponse<{}>>;
    createClass: (name: string, config: {
        type: string;
        description: string;
    }) => Promise<void>;
    createAttribute: (className: string, params: {
        name: string;
        type: AttributeType["type"];
        description?: string;
        config?: {};
    }) => Promise<void>;
    constructor(...config: StackConfig[]);
}
export { ClientStack, Trigger, Class, Attribute, Domain };
export { DocStack };
