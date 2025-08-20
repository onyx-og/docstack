"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRequest = void 0;
// import expressPino from "express-pino-logger";
const expressWinston = __importStar(require("express-winston"));
const winston = __importStar(require("winston"));
const winston_1 = require("winston");
const transport_1 = __importDefault(require("./transport"));
// import pino from "pino"
exports.logRequest = expressWinston.logger({
    transports: [
        new winston.transports.Console()
    ],
    level: "info",
});
const serverLogger = (0, winston_1.createLogger)({
    transports: [new transport_1.default({ dbName: "log" }), new winston.transports.File({
            filename: 'combined.log',
            level: 'info'
        }),
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'errors.log',
            level: 'error'
        })]
});
exports.default = serverLogger;
//# sourceMappingURL=server-logger.js.map