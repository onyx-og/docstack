import Transport, { TransportStreamOptions } from "winston-transport";
declare class PouchDBTransport extends Transport {
    db: PouchDB.Database<{}>;
    constructor(opts: {
        dbName: string;
    } & TransportStreamOptions);
    log(info: Object, callback: Function): Promise<void>;
}
export default PouchDBTransport;
