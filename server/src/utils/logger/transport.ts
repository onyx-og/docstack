import Transport, { TransportStreamOptions } from "winston-transport";
import NodePouchDB from "pouchdb-node"
import * as stream from 'stream';
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class PouchDBTransport extends Transport{
    db: PouchDB.Database<{}> = undefined;
    // fields for storing database connection information
constructor(opts: {dbName: string} & TransportStreamOptions) {
    super(opts);

    // Make sure that the database connection information is passed
    // and use that information to connect to the database
    this.db = new NodePouchDB(opts.dbName)
}

  async log(info: Object, callback: Function) {
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
      console.log("pouchdb-transport - failed to push to pouchdb", response)
    }
    // Perform the writing to the remote service
    callback();
  }
};

export default PouchDBTransport