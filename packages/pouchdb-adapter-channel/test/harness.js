import PouchDB from "pouchdb-core";
import memory from "pouchdb-adapter-memory";
import replication from "pouchdb-replication";
import ChannelPlugin, { serveChannel, createLoopbackPair } from "../lib/index.js";

// PouchDB plugins mutate the module singleton and refuse to apply twice, so the
// composition happens once here and every spec imports the result.
PouchDB.plugin(memory).plugin(replication).plugin(ChannelPlugin());

let n = 0;
export const fresh = prefix => `${prefix}-${Date.now()}-${n++}`;

/** A host db, a served channel, and a driver db pointed at it. */
export const rig = (options = {}) => {
    const hostDb = new PouchDB(fresh("host"), { adapter: "memory" });
    const [hostEnd, driverEnd] = createLoopbackPair();
    const server = serveChannel(hostDb, hostEnd, options);
    const driverDb = new PouchDB(fresh("driver"), { adapter: "channel", channel: driverEnd });
    return { hostDb, driverDb, server };
};

export const waitFor = async (predicate, timeoutMs = 5000) => {
    const start = Date.now();
    while (!(await predicate())) {
        if (Date.now() - start > timeoutMs) throw new Error("condition not reached in time");
        await new Promise(resolve => setTimeout(resolve, 25));
    }
};

export { PouchDB };
