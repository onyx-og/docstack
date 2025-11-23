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

    const logClass = await this.stack.getClass("log");
    if (!logClass) {
      console.log("pouchdb-transport - log class not found, cannot log");
    } else {
      try {
        const response = await logClass.addCard({
          "~class": "log",
          log: info
        });
      } catch (e: any) {
        console.log("pouchdb-transport - failed to log to pouchdb", e);
      }
    }
    // Perform the writing to the remote service
    callback();
  }
};

export default PouchDBTransport