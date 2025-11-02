import type { StackPluginType } from "@docstack/shared";
/**
 * Plugin Factory method that returns a PouchDB plugin object
 * which performs on documents (before) triggers and validation against
 * their class schema
 * @param stack
 * @returns
 */
export declare const StackPlugin: StackPluginType;
