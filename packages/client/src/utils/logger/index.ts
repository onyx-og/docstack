
import * as winston from "winston";
import { createLogger, transports, format } from "winston";
import PouchDBTransport from "./transport";

const clientLogger = createLogger({
    transports: [
        new PouchDBTransport({ dbName: "log" }),
        new winston.transports.Console(),
    ]
});

export default clientLogger;