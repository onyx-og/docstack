import express from 'express';
import getLogger from "./utils/logger";
import Surfer from './utils/dbManager/Surfer';
import Class from './utils/dbManager/Class';
import Attribute from './utils/dbManager/Attribute';
import { EventEmitter } from 'node:events';
declare class CouchSurfer extends EventEmitter {
    private app;
    private dbName;
    private readyState;
    private surfer;
    private initInstance;
    resetDb(): Promise<void>;
    getSurfer(): Surfer;
    getReadyState(): boolean;
    reset(): Promise<void>;
    constructor(config?: {
        dbName: string;
    });
    getApp(): express.Express;
}
export { Surfer, Class, Attribute, getLogger };
export { CouchSurfer };
