import * as winston from "winston";
export declare const logRequest: import("express").Handler;
export declare const serverLogger: winston.Logger;
export declare const clientLogger: winston.Logger;
declare const getLogger: () => winston.Logger;
export default getLogger;
