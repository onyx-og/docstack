"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_transport_1 = __importDefault(require("winston-transport"));
const pouchdb_node_1 = __importDefault(require("pouchdb-node"));
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class PouchDBTransport extends winston_transport_1.default {
    // fields for storing database connection information
    constructor(opts) {
        super(opts);
        this.db = undefined;
        // Make sure that the database connection information is passed
        // and use that information to connect to the database
        this.db = new pouchdb_node_1.default(opts.dbName);
    }
    async log(info, callback) {
        setImmediate(() => {
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
exports.default = PouchDBTransport;
//# sourceMappingURL=transport.js.map