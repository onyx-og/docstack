import { Class, Document, Trigger as Trigger_, TriggerModel, TriggerRunFunction } from "@docstack/shared";
/**
 * The Trigger class dynamically hydrates a function from a string.
 * This allows for declarative, data-driven logic to be executed at runtime.
 */
export declare class Trigger extends Trigger_ {
    /** The declarative model for the trigger. */
    readonly model: TriggerModel;
    readonly name: TriggerModel["name"];
    readonly order: TriggerModel["order"];
    /** A reference to the parent Class instance. */
    readonly classObj: Class | undefined;
    /** The dynamically hydrated function that executes the trigger logic. */
    readonly run: TriggerRunFunction;
    constructor(model: TriggerModel, classObj?: Class);
    /**
     * Executes the hydrated run function with the necessary context.
     * The method is now asynchronous by default.
     * @param document The document to be processed by the trigger.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    execute: (document: Document) => Promise<Document>;
    /**
     * Executes the hydrated run function without providing class or stack context.
     * This is useful for testing or previews where cross-document
     * behaviors are not desired.
     * @param document The document to be processed by the trigger.
     * @returns The updated document returned by the trigger logic as a Promise.
     */
    executeLimited: (document: Document) => Promise<Document>;
}
