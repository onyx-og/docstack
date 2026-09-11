import { Document, TriggerRunFunction, TriggerModel, StackSession } from "../../types.js";
import Class from "./class/index.js";

abstract class Trigger {
    abstract readonly name: string;
    abstract readonly order: "before" | "after";
    abstract readonly model: TriggerModel;
    abstract readonly classObj: Class | undefined;

    constructor() {}

    abstract run: TriggerRunFunction;

    abstract execute: (document: Document, session?: StackSession) => Promise<Document>;

    abstract executeLimited: (document: Document) => Promise<Document>; 
}

export default Trigger;