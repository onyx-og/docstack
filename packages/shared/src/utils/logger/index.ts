import * as winston from "winston";
import { createLogger, transports, format } from "winston";

const logger = createLogger({
    transports: [
        new winston.transports.Console(),
    ]
});

export default logger;