import PouchDB from "pouchdb";
import memoryAdapter from "pouchdb-adapter-memory";

/**
 * The one PouchDB constructor on the host.
 *
 * `@docstack/client`'s Node entry registers `pouchdb` as the engine's constructor and
 * applies `pouchdb-find` per stack; the host adds the memory adapter for development
 * and tests. Both resolve to the same module instance, so the plugin lands where the
 * engine looks.
 */
let prepared = false;

export const preparePouchDB = (): typeof PouchDB => {
    if (!prepared) {
        PouchDB.plugin(memoryAdapter);
        prepared = true;
    }
    return PouchDB;
};
