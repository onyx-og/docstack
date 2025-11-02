import * as winston from "winston";
import { createLogger } from "winston";
import PouchDBTransport from "./transport";
const clientLogger = (name = 'log') => {
    return createLogger({
        transports: [
            new PouchDBTransport({ dbName: name }),
            new winston.transports.Console(),
        ]
    });
};
export default clientLogger;
//# sourceMappingURL=index.js.map