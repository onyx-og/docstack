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
const express_1 = __importDefault(require("express"));
const express_2 = require("express");
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: './.env' });
const path_1 = require("path");
const server_logger_1 = __importStar(require("./utils/logger/server-logger"));
const test_1 = __importDefault(require("./utils/dbManager/test"));
const app = (0, express_1.default)();
app.use(server_logger_1.logRequest);
const port = process.env.APP_PORT || 5000;
const server = app.listen(port, () => server_logger_1.default.info(`Listening on port ${port}`));
app.use((0, express_2.static)('./dist'));
app.get('*', (req, res) => {
    const templatePath = (0, path_1.resolve)(__dirname, './dist', 'index.html');
    res.sendFile(templatePath);
});
(0, test_1.default)();
//# sourceMappingURL=index.js.map