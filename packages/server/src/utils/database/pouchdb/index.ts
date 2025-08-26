import NodePouchDB from "pouchdb-node"
import memoryAdapter from "pouchdb-adapter-memory"
NodePouchDB.plugin(memoryAdapter)
import replicateChanges from "../replication/index.js"
import { docArray, changeLimit, maxChanges } from "../replication/index.js"
import Find from 'pouchdb-find'
NodePouchDB.plugin(Find)
import getLogger from "../../logger/"
const logger = getLogger().child({module: "pouchdb"})

const localdb = new NodePouchDB('wordsearch', {
  adapter: "memory"
});

const updateConnection = async (db: any, uuid: string, status:string) => {
  const fLogger = logger.child({function: "updateConnection", args: {db, uuid, status}})
  try {
    let data = {}
    const _rev = await checkDocExisting(db, uuid);
    if (_rev) {
      data = {
        _id: uuid,
        _rev: _rev,
        type: "user-connection",
        status: status,
        timestamp: Date.now()
      }
    } else {
      data = {
        _id: uuid,
        type: "user-connection",
        status: status,
        timestamp: Date.now()
      }
    }
    var response = await db.put(data);
    fLogger.debug("Response", {response});
  } catch (error) {
    fLogger.error("Exception", {error})
  }
}

const getDocByType = async (type: string) => {
  let findRes = await localdb.find({
    selector: { type },
    // fields: ['_id'],
  })
  let doc = findRes.docs?.[0];
  return doc;
}

const getDocById = async (db: any, id: string) => {
  try {
    const doc = await db.get(id);
    if (doc) return doc
  } catch (e) {
    // TODO: manage differently (warning) for document not_found
    console.log("error while retrieving document", e);
  }
  return null;
}

const checkDocExisting = async (db: any, id: string) => {
  const doc = await getDocById(db, id);
  if (doc) return doc.rev
  return false;
}

const registerConnection = async (db: any, uuid: string) => {
  return await updateConnection(db, uuid, "connected")
}

const registerDisconnection = async (db: any, uuid: string) => {
  return await updateConnection(db, uuid, "disconnected")
}

// Register a listener for changes on the local db. It will be triggered
// when a change is detected and will add the changed document to a queue
// for replication. The queue is then replicated to the cloud db.
const registerChangesListener = (db: any) => {
  let updateTimer: NodeJS.Timeout = undefined;
  var changes = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', async (change: any) => {
    console.log("found change, adding to queue for replication", change)
    docArray.push(change.doc);
    if (docArray.length == 1) {
      updateTimer = setTimeout(async () => {
        await replicateChanges(docArray, updateTimer)
      }, changeLimit)
    }
    if (docArray.length >= maxChanges) {
      await replicateChanges(docArray, updateTimer)
    }
  }).on('complete', function (info: any) {
    // changes() was canceled
    console.log("completed change")
  }).on('error', function (err: any) {
    console.log(err);
  });

  // TODO: check if this listeners can be stopped and resumed somehow
  return changes;
}

export default localdb;
export { registerChangesListener, getDocById, getDocByType, checkDocExisting, registerConnection, registerDisconnection }