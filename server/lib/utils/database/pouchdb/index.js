"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDisconnection = exports.registerConnection = exports.checkDocExisting = exports.getDocByType = exports.getDocById = exports.registerChangesListener = void 0;
const pouchdb_node_1 = __importDefault(require("pouchdb-node"));
const pouchdb_adapter_memory_1 = __importDefault(require("pouchdb-adapter-memory"));
pouchdb_node_1.default.plugin(pouchdb_adapter_memory_1.default);
const index_js_1 = __importDefault(require("../replication/index.js"));
const index_js_2 = require("../replication/index.js");
const pouchdb_find_1 = __importDefault(require("pouchdb-find"));
pouchdb_node_1.default.plugin(pouchdb_find_1.default);
const server_logger_js_1 = __importDefault(require("../../logger/server-logger.js"));
const logger = server_logger_js_1.default.child({ module: "pouchdb" });
const localdb = new pouchdb_node_1.default('wordsearch', {
    adapter: "memory"
});
const updateConnection = async (db, uuid, status) => {
    const fLogger = logger.child({ function: "updateConnection", args: { db, uuid, status } });
    try {
        let data = {};
        const _rev = await checkDocExisting(db, uuid);
        if (_rev) {
            data = {
                _id: uuid,
                _rev: _rev,
                type: "user-connection",
                status: status,
                timestamp: Date.now()
            };
        }
        else {
            data = {
                _id: uuid,
                type: "user-connection",
                status: status,
                timestamp: Date.now()
            };
        }
        var response = await db.put(data);
        fLogger.debug("Response", { response });
    }
    catch (error) {
        fLogger.error("Exception", { error });
    }
};
const getDocByType = async (type) => {
    var _a;
    let findRes = await localdb.find({
        selector: { type },
        // fields: ['_id'],
    });
    let doc = (_a = findRes.docs) === null || _a === void 0 ? void 0 : _a[0];
    return doc;
};
exports.getDocByType = getDocByType;
const getDocById = async (db, id) => {
    try {
        const doc = await db.get(id);
        if (doc)
            return doc;
    }
    catch (e) {
        // TODO: manage differently (warning) for document not_found
        console.log("error while retrieving document", e);
    }
    return null;
};
exports.getDocById = getDocById;
const checkDocExisting = async (db, id) => {
    const doc = await getDocById(db, id);
    if (doc)
        return doc.rev;
    return false;
};
exports.checkDocExisting = checkDocExisting;
const registerConnection = async (db, uuid) => {
    return await updateConnection(db, uuid, "connected");
};
exports.registerConnection = registerConnection;
const registerDisconnection = async (db, uuid) => {
    return await updateConnection(db, uuid, "disconnected");
};
exports.registerDisconnection = registerDisconnection;
// Register a listener for changes on the local db. It will be triggered
// when a change is detected and will add the changed document to a queue
// for replication. The queue is then replicated to the cloud db.
const registerChangesListener = (db) => {
    let updateTimer = undefined;
    var changes = db.changes({
        since: 'now',
        live: true,
        include_docs: true
    }).on('change', async (change) => {
        console.log("found change, adding to queue for replication", change);
        index_js_2.docArray.push(change.doc);
        if (index_js_2.docArray.length == 1) {
            updateTimer = setTimeout(async () => {
                await (0, index_js_1.default)(index_js_2.docArray, updateTimer);
            }, index_js_2.changeLimit);
        }
        if (index_js_2.docArray.length >= index_js_2.maxChanges) {
            await (0, index_js_1.default)(index_js_2.docArray, updateTimer);
        }
    }).on('complete', function (info) {
        // changes() was canceled
        console.log("completed change");
    }).on('error', function (err) {
        console.log(err);
    });
    // TODO: check if this listeners can be stopped and resumed somehow
    return changes;
};
exports.registerChangesListener = registerChangesListener;
exports.default = localdb;
//# sourceMappingURL=index.js.map