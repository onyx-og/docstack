import * as winston from "winston";
import { createLogger } from "winston";
const logger = createLogger({
    transports: [
        new winston.transports.Console(),
    ]
});
export default logger;
//# sourceMappingURL=index.js.map