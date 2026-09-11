/**
 * The PouchDB constructor the engine builds databases with, registered once per runtime.
 *
 * `@docstack/client` runs in a browser and on a host. The browser build needs
 * `pouchdb-browser` (IndexedDB, http, replication); Node needs `pouchdb` (LevelDB, http,
 * replication) and cannot even load `pouchdb-browser`, which reads `self` at module
 * scope. A static import would pin the package to one of them, so the entry points
 * register the right constructor here - `src/index.ts` for browsers, `src/node.ts` for
 * Node, selected by the package's conditional exports - and the engine asks for it at
 * use time. A host that composes its own PouchDB (extra adapters, plugins) registers
 * that instead, before opening a stack.
 *
 * Type positions keep `import type PouchDB from "pouchdb-browser"`: the declarations are
 * the same for both builds.
 *
 * @module
 */

let registered: PouchDB.Static | null = null;

/**
 * Registers the constructor every stack opened afterwards is built with.
 *
 * @param constructor - A PouchDB constructor, plugins already applied if any.
 */
export const setPouchDB = (constructor: PouchDB.Static): void => {
    registered = constructor;
};

/**
 * The registered constructor.
 *
 * @throws When nothing is registered: the package was imported through a path that
 * registers nothing, which no published entry does.
 */
export const getPouchDB = (): PouchDB.Static => {
    if (!registered) {
        throw new Error(
            "No PouchDB constructor is registered. Import '@docstack/client' in a browser or "
            + "'@docstack/client/node' under Node, or call setPouchDB(PouchDB) with your own.",
        );
    }
    return registered;
};
