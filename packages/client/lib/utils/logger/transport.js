import Transport from "winston-transport";
import PouchDB from "pouchdb";
import 'setimmediate';
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class PouchDBTransport extends Transport {
    // fields for storing database connection information
    constructor(opts) {
        super(opts);
        // Make sure that the database connection information is passed
        // and use that information to connect to the database
        this.db = new PouchDB(opts.dbName);
    }
    async log(info, callback) {
        queueMicrotask(() => {
            this.emit('logged', info);
        });
        const response = await this.db.post({
            type: "log",
            log: info
        });
        if (response.ok) {
            // console.log("pouchdb-transport - pushed to pouchdb", response.id)
        }
        else {
            console.log("pouchdb-transport - failed to push to pouchdb", response);
        }
        // Perform the writing to the remote service
        callback();
    }
}
;
export default PouchDBTransport;
//# sourceMappingURL=transport.js.map