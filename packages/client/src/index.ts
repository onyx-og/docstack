/**
 * The browser entry: `pouchdb-browser` (IndexedDB, http, replication) is the engine's
 * constructor. Selected by the package's `browser` and `default` export conditions;
 * `@docstack/client/browser` names it explicitly for bundlers that ignore conditions.
 *
 * @module @docstack/client
 */
import PouchDB from "pouchdb-browser";
import { setPouchDB } from "./core/pouchdb.js";

setPouchDB(PouchDB);

export * from "./exports.js";
export { default } from "./exports.js";
