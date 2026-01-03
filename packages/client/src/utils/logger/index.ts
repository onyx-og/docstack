
import * as winston from "winston";
import { createLogger } from "winston";
import PouchDBTransport from "./transport";
import { Stack } from "@docstack/shared";

const clientLogger = (stack?: Stack | null) => {
    const transports: winston.transport[]= [];
    if (stack) {
        transports.push(new PouchDBTransport({ stack }));
    }

    // if (process.env.NODE_ENV !== "test") {
        const consoleTransport = new winston.transports.Console({
            level: "warn"
        });
        transports.push(consoleTransport);
    // }

    return createLogger({
        transports: transports
    });
}

export default clientLogger;
