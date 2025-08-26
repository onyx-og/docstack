// import expressPino from "express-pino-logger";
import * as expressWinston from "express-winston"
import * as winston from "winston";
import { createLogger, transports, format } from "winston";
import PouchDBTransport from "./transport";

export const logRequest = expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
    level: "info",
});

export const serverLogger = createLogger({
    transports: [
      new PouchDBTransport({dbName: "log"}),
      new winston.transports.File({
        filename: 'combined.log',
        level: 'info'
      }),
      new winston.transports.Console(),
      new winston.transports.File({
        filename: 'errors.log',
        level: 'error'
      })
    ]
})

export const clientLogger = createLogger({
  transports: [
    new PouchDBTransport({dbName: "log"}),
    new winston.transports.Console(),
  ]
})

const getLogger = () => {
  if (typeof window !== 'undefined') {
    // Running in a browser
    return clientLogger;
  } else {
    // Running in Node.js
    return serverLogger;
  }
}

export default getLogger;