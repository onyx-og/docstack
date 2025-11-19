import Transport, { TransportStreamOptions } from "winston-transport";
import PouchDB from "pouchdb"
import 'setimmediate';
import * as stream from 'stream';
import { Stack } from "@docstack/shared";
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class PouchDBTransport extends Transport{
    stack: Stack;
    // fields for storing database connection information
    constructor(opts: {
        stack: Stack
    } & TransportStreamOptions) {
    super(opts);

    // Make sure that the database connection information is passed
    // and use that information to connect to the database
    this.stack = opts.stack;
}

  async log(info: Object, callback: Function) {
    queueMicrotask(() => {
      this.emit('logged', info);
    });

    const response = await this.stack.db.post({
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