
import * as winston from "winston";
import { createLogger } from "winston";
import PouchDBTransport from "./transport";

const clientLogger = (name: string = 'log') => {
    const transportsList = [
        new PouchDBTransport({ dbName: name })
    ];

    if (process.env.NODE_ENV !== "test") {
        transportsList.push(new winston.transports.Console());
    }

    return createLogger({
        transports: transportsList
    });
}

export default clientLogger;
