/**
 * The Node entry: `pouchdb` (LevelDB, http, replication) is the engine's constructor.
 * Selected by the package's `node` export condition; `@docstack/client/node` names it
 * explicitly. The same engine, byte for byte, as the browser build - only the
 * constructor differs (ADR-0047, spec 03).
 *
 * @module @docstack/client/node
 */
import PouchDB from "pouchdb";
import { setPouchDB } from "./core/pouchdb.js";

setPouchDB(PouchDB as unknown as PouchDB.Static);

export * from "./exports.js";
export { default } from "./exports.js";
