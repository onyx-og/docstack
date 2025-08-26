"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudant = void 0;
const cloudant_1 = require("@ibm-cloud/cloudant");
const cloudant_2 = require("@ibm-cloud/cloudant");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: './.env' });
exports.cloudant = cloudant_1.CloudantV1.newInstance({
    serviceName: "CLOUDANT",
    authenticator: new cloudant_2.IamAuthenticator({
        apikey: process.env.CLOUDANT_APIKEY,
    }),
    serviceUrl: process.env.CLOUDANT_URL,
});
// Try to create database if it doesn't exist
const initCloudDb = () => new Promise((resolve, reject) => {
    console.log("initCloudDb - starting to request creation of cloud db. May fail if already existing");
    exports.cloudant
        .putDatabase({ db: "wordsearchdb" })
        .then((putDatabaseResult) => {
        if (putDatabaseResult.result.ok) {
            console.log(`"wordsearchdb" database created."`);
            resolve(true);
        }
    })
        .catch((err) => {
        if (err.code === 412) {
            console.log(`Cannot create "wordsearchdb" database, it already exists.`);
            resolve(true);
        }
        else {
            console.log("initCloudDb - error while initializing db", err);
            reject(err);
        }
    });
});
exports.default = initCloudDb;
//# sourceMappingURL=index.js.map