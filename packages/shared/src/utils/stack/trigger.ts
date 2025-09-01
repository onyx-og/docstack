import { Document, TriggerRunFunction, TriggerModel } from "../../types";
import Class from "./class";

abstract class Trigger {
    abstract readonly name: string;
    abstract readonly order: "before" | "after";
    abstract readonly model: TriggerModel;
    abstract readonly classObj: Class | undefined;

    constructor() {}

    abstract run: TriggerRunFunction;

    abstract execute: (document: Document) => Promise<Document>;

    abstract executeLimited: (document: Document) => Promise<Document>; 
}

export default Trigger;