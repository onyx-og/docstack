import 'setimmediate';

// Logging
import winston from 'winston';
import Transport from 'winston-transport';

// Database
import PouchDBBrowser from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import * as shared from "@docstack/shared"

// Utilities
import * as zod from 'zod';
import * as semver from 'semver';
import * as jsondiffpatch from 'jsondiffpatch';

globalThis._nextTick = function(...args) {
    Promise.resolve().then(() => {
        args[0].apply(null, args.slice(1));
    });
}

globalThis.winston = winston;
globalThis.Transport = Transport;
globalThis.PouchDBBrowser = PouchDBBrowser;
globalThis.PouchDBFind = PouchDBFind;
globalThis.shared = shared;
globalThis.zod = zod;
globalThis.semver = semver;
globalThis.jsondiffpatch = jsondiffpatch;

