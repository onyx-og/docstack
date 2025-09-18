
import * as winston from "winston";
import { createLogger, transports, format } from "winston";
import PouchDBTransport from "./transport";

const clientLogger = (name: string = 'log') => {
    return createLogger({
        transports: [
            new PouchDBTransport({ dbName: name }),
            new winston.transports.Console(),
        ]
    });
}

export default clientLogger;