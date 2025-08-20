(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('express'), require('dotenv'), require('cors'), require('express-winston'), require('winston'), require('winston-transport'), require('pouchdb-node'), require('crypto'), require('fs'), require('node:fs'), require('node:path'), require('jsonwebtoken'), require('cookie-parser'), require('node:events')) :
    typeof define === 'function' && define.amd ? define(['exports', 'express', 'dotenv', 'cors', 'express-winston', 'winston', 'winston-transport', 'pouchdb-node', 'crypto', 'fs', 'node:fs', 'node:path', 'jsonwebtoken', 'cookie-parser', 'node:events'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.couchsurfer = {}, global.express, global.dotenv, global.cors, global.expressWinston, global.winston, global.Transport, global.NodePouchDB, global.crypto, global.fs, global.fs$1, global.path, global.jwt, global.cookieParser, global.node_events));
})(this, (function (exports, express, dotenv, cors, expressWinston, winston, Transport, NodePouchDB, crypto, fs, fs$1, path, jwt, cookieParser, node_events) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    function _interopNamespace(e) {
        if (e && e.__esModule) return e;
        var n = Object.create(null);
        if (e) {
            Object.keys(e).forEach(function (k) {
                if (k !== 'default') {
                    var d = Object.getOwnPropertyDescriptor(e, k);
                    Object.defineProperty(n, k, d.get ? d : {
                        enumerable: true,
                        get: function () { return e[k]; }
                    });
                }
            });
        }
        n["default"] = e;
        return Object.freeze(n);
    }

    var express__default = /*#__PURE__*/_interopDefaultLegacy(express);
    var dotenv__default = /*#__PURE__*/_interopDefaultLegacy(dotenv);
    var dotenv__namespace = /*#__PURE__*/_interopNamespace(dotenv);
    var cors__default = /*#__PURE__*/_interopDefaultLegacy(cors);
    var expressWinston__namespace = /*#__PURE__*/_interopNamespace(expressWinston);
    var winston__namespace = /*#__PURE__*/_interopNamespace(winston);
    var Transport__default = /*#__PURE__*/_interopDefaultLegacy(Transport);
    var NodePouchDB__default = /*#__PURE__*/_interopDefaultLegacy(NodePouchDB);
    var crypto__default = /*#__PURE__*/_interopDefaultLegacy(crypto);
    var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
    var fs__default$1 = /*#__PURE__*/_interopDefaultLegacy(fs$1);
    var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
    var jwt__default = /*#__PURE__*/_interopDefaultLegacy(jwt);
    var cookieParser__default = /*#__PURE__*/_interopDefaultLegacy(cookieParser);

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise, SuppressedError, Symbol, Iterator */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
        return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (g && (g = 0, op[0] && (_ = 0)), _) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __spreadArray(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    }

    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    //
    // Inherit from `winston-transport` so you can take advantage
    // of the base functionality and `.exceptions.handle()`.
    //
    var PouchDBTransport = /** @class */ (function (_super) {
        __extends(PouchDBTransport, _super);
        // fields for storing database connection information
        function PouchDBTransport(opts) {
            var _this = _super.call(this, opts) || this;
            _this.db = undefined;
            // Make sure that the database connection information is passed
            // and use that information to connect to the database
            _this.db = new NodePouchDB__default["default"](opts.dbName);
            return _this;
        }
        PouchDBTransport.prototype.log = function (info, callback) {
            return __awaiter(this, void 0, void 0, function () {
                var response;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            setImmediate(function () {
                                _this.emit('logged', info);
                            });
                            return [4 /*yield*/, this.db.post({
                                    type: "log",
                                    log: info
                                })];
                        case 1:
                            response = _a.sent();
                            if (response.ok) ;
                            else {
                                console.log("pouchdb-transport - failed to push to pouchdb", response);
                            }
                            // Perform the writing to the remote service
                            callback();
                            return [2 /*return*/];
                    }
                });
            });
        };
        return PouchDBTransport;
    }(Transport__default["default"]));

    // import expressPino from "express-pino-logger";
    var logRequest = expressWinston__namespace.logger({
        transports: [
            new winston__namespace.transports.Console()
        ],
        level: "info",
    });
    var serverLogger = winston.createLogger({
        transports: [
            new PouchDBTransport({ dbName: "log" }),
            new winston__namespace.transports.File({
                filename: 'combined.log',
                level: 'info'
            }),
            new winston__namespace.transports.Console(),
            new winston__namespace.transports.File({
                filename: 'errors.log',
                level: 'error'
            })
        ]
    });
    var clientLogger = winston.createLogger({
        transports: [
            new PouchDBTransport({ dbName: "log" }),
            new winston__namespace.transports.Console(),
        ]
    });
    var getLogger = function () {
        if (typeof window !== 'undefined') {
            // Running in a browser
            return clientLogger;
        }
        else {
            // Running in Node.js
            return serverLogger;
        }
    };

    var envPath$2 = '.env';
    dotenv__default["default"].config({ path: envPath$2 });
    var checkKeyPairPresence = function (keys) {
        var missingKeys = keys.filter(function (key) {
            return process.env[key] === undefined || process.env[key] === "";
        });
        return missingKeys;
    };
    var hashStringEpoch = function (string) {
        return crypto__default["default"].createHash('sha256').update(string + Date.now()).digest('base64');
    };
    var generatePair = function () {
        var passphrase = process.env.ENCRYPTION_PASSPHRASE;
        if (passphrase === undefined) {
            throw new Error("No passphrase found in .env file");
        }
        // Placeholder method, aimed to provide in the future additional
        // customizations for the key pair generation
        var _a = crypto__default["default"].generateKeyPairSync("rsa", {
            // The standard secure default length for RSA keys is 2048 bits
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: process.env.ENCRYPTION_PASSPHRASE,
            },
        }), publicKey = _a.publicKey, privateKey = _a.privateKey;
        return { publicKey: publicKey, privateKey: privateKey };
    };
    // TODO: Consider moving to another dir
    var updateEnvFile = function (config) {
        var envFilePath = envPath$2;
        var envConfig = dotenv__default["default"].parse(fs__default["default"].readFileSync(envFilePath));
        for (var _i = 0, _a = Object.entries(config); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            envConfig[key] = value;
        }
        var envContent = Object.entries(envConfig)
            .map(function (_a) {
            var key = _a[0], value = _a[1];
            return "".concat(key, "=\"").concat(value, "\"");
        })
            .join('\n');
        fs__default["default"].writeFileSync(envFilePath, envContent);
    };
    var generatePswKeys = function () {
        var keys = checkKeyPairPresence(["PSW_PUBLIC_KEY", "PSW_PRIVATE_KEY"]);
        if (keys.length === 0) {
            console.log("Password Key pair already exists");
            return;
        }
        var _a = generatePair(), publicKey = _a.publicKey, privateKey = _a.privateKey;
        updateEnvFile({ "PSW_PUBLIC_KEY": publicKey, "PSW_PRIVATE_KEY": privateKey });
        console.log("Key pair generated successfully. Reloading .env file...");
        dotenv__default["default"].config({ override: true });
    };
    var generateJwtKeys = function () {
        var keys = checkKeyPairPresence(["JWT_PUBLIC_KEY", "JWT_PRIVATE_KEY"]);
        if (keys.length === 0) {
            console.log("JWT Key pair already exists");
            return;
        }
        var _a = generatePair(), publicKey = _a.publicKey, privateKey = _a.privateKey;
        updateEnvFile({ "JWT_PUBLIC_KEY": publicKey, "JWT_PRIVATE_KEY": privateKey });
        console.log("JWT key pair generated successfully. Reloading .env file...");
        dotenv__default["default"].config({ override: true });
    };
    var encryptString = function (stringToEncrypt) {
        var publicKey = process.env.PSW_PUBLIC_KEY;
        var encryptedData = crypto__default["default"].publicEncrypt({
            key: publicKey,
            padding: crypto__default["default"].constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        }, 
        // We convert the data string to a buffer using `Buffer.from`
        Buffer.from(stringToEncrypt));
        return encryptedData.toString("base64");
    };
    // TODO: Consider adding more params like:
    // custom padding and encoding output
    var decryptData = function (encryptedData) {
        var privateKey = process.env.PSW_PRIVATE_KEY;
        var passphrase = process.env.ENCRYPTION_PASSPHRASE;
        if (privateKey === undefined) {
            throw new Error("No public key found in .env file");
        }
        if (passphrase === undefined) {
            throw new Error("No passphrase found in .env file");
        }
        try {
            // const decipher = crypto.createDecipheriv('aes-256-cbc', passphrase);
            var decryptedData = crypto__default["default"].privateDecrypt({
                key: privateKey,
                passphrase: passphrase,
                // In order to decrypt the data, we need to specify the
                // same hashing function and padding scheme that we used to
                // encrypt the data in the previous step
                padding: crypto__default["default"].constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            }, encryptedData);
            // The decrypted data is of the Buffer type, which we can convert to a
            // string to reveal the original data
            return decryptedData.toString();
        }
        catch (error) {
            if (error.message.includes('error:0407109F:rsa routines:RSA_padding_check_PKCS1_type_2:pkcs decoding error')) {
                console.error("Decryption failed: Incorrect padding.");
            }
            else if (error.message.includes('error:04065072:rsa routines:RSA_EAY_PRIVATE_DECRYPT:padding check failed')) {
                console.error("Decryption failed: Incorrect private key or corrupted data.");
            }
            else if (error.message.includes('error:0407006E:rsa routines:RSA_padding_add_PKCS1_OAEP_mgf1:data too large for key size')) {
                console.error("Decryption failed: Data too large for key size.");
            }
            else {
                console.error("Decryption failed:", error);
            }
            return null;
        }
    };
    var decryptString = function (stringToDecrypt) {
        return decryptData(Buffer.from(stringToDecrypt, "base64"));
    };

    // import { AttributeTypeReference } from "../Reference";
    var ATTRIBUTE_TYPES = ["string", "number", "integer", "reference", "boolean"];
    var Attribute = /** @class */ (function () {
        function Attribute(classObj, name, type, config) {
            if (classObj === void 0) { classObj = null; }
            this.name = name;
            this.setModel({
                name: this.name,
                type: this.getType(type),
                config: this.getTypeConf(type, config),
            });
            // if it's given a class
            if (classObj) {
                // attempt to add attribute
                this.class = classObj;
            }
        }
        Attribute.create = function () {
            return __awaiter(this, arguments, void 0, function (classObj, name, type, config) {
                var attribute;
                if (classObj === void 0) { classObj = null; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            attribute = new Attribute(classObj, name, type, config);
                            return [4 /*yield*/, Attribute.build(attribute)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, attribute];
                    }
                });
            });
        };
        Attribute.prototype.isPrimaryKey = function () {
            var model = this.getModel();
            return model.config.primaryKey;
        };
        Attribute.prototype.getModel = function () {
            return this.model;
        };
        Attribute.prototype.getClass = function () {
            if (this.class)
                return this.class;
            else
                throw Error("Missing class configuration for this attribute");
        };
        Attribute.build = function (attributeObj) {
            return __awaiter(this, void 0, void 0, function () {
                var classObj, surfer;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            classObj = attributeObj.getClass();
                            surfer = classObj.getSpace();
                            if (!surfer) return [3 /*break*/, 2];
                            return [4 /*yield*/, classObj.addAttribute(attributeObj)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, attributeObj];
                        case 2: throw new Error("Missing db configuration");
                    }
                });
            });
        };
        Attribute.prototype.setModel = function (model) {
            var currentModel = this.getModel();
            model = Object.assign(currentModel || {}, model);
            this.model = model;
            this.defaultValue = model.config.defaultValue;
        };
        // TODO: Better define config
        Attribute.prototype.getType = function (type) {
            if (this.checkTypeValidity(type)) {
                return type;
            }
            else
                throw Error("Invalid attribute type: " + type);
            // return this?
        };
        // getType()
        Attribute.prototype.getName = function () {
            return this.name;
        };
        Attribute.prototype.checkTypeValidity = function (type) {
            var validity = false;
            if (ATTRIBUTE_TYPES.includes(type)) {
                validity = true;
            }
            return validity;
        };
        // TODO: change to imported const default configs for types
        // as of now it accepts only string
        // TODO: since config depends on attribute's type, 
        // find a way to check if given configs are correct
        // find a way to add default configs base on type
        Attribute.prototype.getTypeConf = function (type, config) {
            switch (type) {
                // TODO: add missing cases and change values to imported const 
                case "decimal":
                    config = Object.assign({ max: null, min: null, precision: null, isArray: false }, config);
                    break;
                case "integer":
                    config = Object.assign({ max: null, min: null, isArray: false }, config);
                    break;
                case "string":
                    config = Object.assign({ maxLength: 50, isArray: false }, config);
                    break;
                default:
                    throw new Error("Unexpected type: " + type);
                // return "^[a-zA-Z0-9_\\s]".concat("{0,"+config.maxLength+"}$");
            }
            return config;
        };
        return Attribute;
    }());

    // import ReferenceAttribute from '../Reference';
    var logger$2 = getLogger().child({ module: "Surfer" });
    var Class = /** @class */ (function () {
        function Class() {
            // Private constructor to prevent direct instantiation
        }
        Class.prototype.getPrimaryKeys = function () {
            return this.attributes.filter(function (attr) { return attr.isPrimaryKey(); })
                .map(function (attr) { return attr.getName(); });
        };
        // TODO: Test
        /*
        inheritAttributes( parentClass: Class ) {
            let parentAttributes = parentClass.getAttributes();
            for ( let attribute of parentAttributes ) {
                this.addAttribute(attribute);
            }
        } */
        Class.prototype.build = function () {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                            var space, classModel;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        space = this.getSpace();
                                        if (!space) return [3 /*break*/, 2];
                                        return [4 /*yield*/, space.addClass(this)];
                                    case 1:
                                        classModel = _a.sent();
                                        this.setModel(classModel);
                                        logger$2.info("build - classModel", { classModel: classModel });
                                        this.setId(classModel._id);
                                        resolve(this);
                                        return [3 /*break*/, 3];
                                    case 2:
                                        reject("Missing db configuration");
                                        _a.label = 3;
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); })];
                });
            });
        };
        Class.prototype.init = function (space, name, type, description) {
            this.name = name;
            this.description = description;
            this.type = type;
            this.attributes = [];
            this.space = null;
            this.id = null;
            this.schema = [];
            // this.parentClass = parentClass;
            if (space) {
                this.space = space;
            }
            // TODO: Waiting for test of method
            // if (parentClass) this.inheritAttributes(parentClass);
        };
        Class.create = function (space_1, name_1) {
            return __awaiter(this, arguments, void 0, function (space, name, type, description) {
                var _class;
                if (type === void 0) { type = "class"; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _class = new Class();
                            _class.init(space, name, type, description);
                            return [4 /*yield*/, _class.build()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, _class];
                    }
                });
            });
        };
        Class.buildFromModel = function (space, classModel) {
            return __awaiter(this, void 0, void 0, function () {
                var classObj;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, Class.create(space, classModel.name, classModel.type, classModel.type)];
                        case 1:
                            classObj = _a.sent();
                            classObj.setModel(classModel);
                            return [2 /*return*/, classObj];
                    }
                });
            });
        };
        Class.fetch = function (space, className) {
            return __awaiter(this, void 0, void 0, function () {
                var classModel;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, space.getClassModel(className)];
                        case 1:
                            classModel = _a.sent();
                            if (classModel) {
                                return [2 /*return*/, Class.buildFromModel(space, classModel)];
                            }
                            else {
                                throw new Error("Class not found: " + className);
                            }
                    }
                });
            });
        };
        // TODO Turn into private method (after factory method instantiation refactory is done)
        Class.prototype.setId = function (id) {
            this.id = id;
        };
        Class.prototype.getName = function () {
            return this.name;
        };
        Class.prototype.getSpace = function () {
            return this.space;
        };
        Class.prototype.getDescription = function () {
            return this.description;
        };
        Class.prototype.getType = function () {
            return this.type;
        };
        Class.prototype.getId = function () {
            return this.id;
        };
        Class.prototype.buildSchema = function () {
            var schema = [];
            for (var _i = 0, _a = this.getAttributes(); _i < _a.length; _i++) {
                var attribute = _a[_i];
                var attributeModel = attribute.getModel();
                schema.push(attributeModel);
            }
            this.schema = schema;
            return schema;
        };
        Class.prototype.getModel = function () {
            var model = {
                _id: this.getName(),
                name: this.getName(),
                description: this.getDescription(),
                type: this.getType(),
                schema: this.buildSchema(),
                _rev: this.model ? this.model._rev : undefined,
                createTimestamp: this.model ? this.model.createTimestamp : undefined,
            };
            return model;
        };
        // Set model should be called only after fetching the latest model from db
        Class.prototype.setModel = function (model) {
            logger$2.info("setModel - got incoming model", { model: model });
            var currentModel = this.getModel();
            model = Object.assign(currentModel, model);
            this.schema = this.schema || [];
            model.schema = __spreadArray(__spreadArray([], model.schema, true), (this.schema), true);
            // let _model = Object.assign(currentModel, {...model, schema: this.schema});
            this.attributes = [];
            for (var _i = 0, _a = model.schema; _i < _a.length; _i++) {
                var attribute = _a[_i];
                var _attribute = new Attribute(this, attribute.name, attribute.type, attribute.config);
                this.attributes.push(_attribute);
            }
            //     this.addAttribute(attribute.name, attribute.type);
            // }
            // this.model = {...this.model, ...model};
            this.name = model.name;
            this.description = model.description;
            logger$2.info("setModel - model after processing", { model: model });
        };
        Class.prototype.getAttributes = function () {
            var names = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                names[_i] = arguments[_i];
            }
            var attributes = [];
            for (var _a = 0, _b = this.attributes; _a < _b.length; _a++) {
                var attribute = _b[_a];
                if (names.length > 0) {
                    // filter with given names
                    for (var _c = 0, names_1 = names; _c < names_1.length; _c++) {
                        var name_1 = names_1[_c];
                        // match?
                        if (name_1 != null && attribute.getName() == name_1) {
                            return [attribute];
                        }
                    }
                }
                else
                    attributes.push(attribute); // no filter, add all
            }
            return attributes;
        };
        Class.prototype.hasAllAttributes = function () {
            var names = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                names[_i] = arguments[_i];
            }
            var result = false;
            var attributes = this.getAttributes.apply(this, names);
            for (var _a = 0, attributes_1 = attributes; _a < attributes_1.length; _a++) {
                var attribute = attributes_1[_a];
                result = names.includes(attribute.getName());
                if (!result)
                    break;
            }
            return result;
        };
        Class.prototype.hasAnyAttributes = function () {
            var names = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                names[_i] = arguments[_i];
            }
            var result = false;
            var attributes = this.getAttributes.apply(this, names);
            for (var _a = 0, attributes_2 = attributes; _a < attributes_2.length; _a++) {
                var attribute = attributes_2[_a];
                result = names.includes(attribute.getName());
                if (result)
                    break;
            }
            return result;
        };
        // interface of hasAnyAttributes
        Class.prototype.hasAttribute = function (name) {
            return this.hasAnyAttributes(name);
        };
        /*
        async addReferenceAttribute( attribute: ReferenceAttribute ) {
            return this.addAttribute(attribute)
        }*/
        /*
        async addAttribute(nameOrAttribute: string | Attribute, type?: AttributeType["type"]) {
            try {
                let attribute: Attribute;
                if (typeof nameOrAttribute === 'string' && type) {
                    attribute = new Attribute(this, nameOrAttribute, type);
                } else if (nameOrAttribute instanceof ReferenceAttribute) {
                    let _attribute = nameOrAttribute as ReferenceAttribute;
                    // check if the target domain exists
                    let targetDomain = _attribute.domain;
                    if (this.space && (await this.space.getDomain(targetDomain)) != null) {
                        attribute = _attribute;
                    } else if (!this.space) {
                        throw new Error("Missing db configuration");
                    } else {
                        throw new Error("Target domain not found: " + targetDomain);
                    }
                } else if (nameOrAttribute instanceof Attribute) {
                    attribute = nameOrAttribute;
                } else {
                    throw new Error('Invalid arguments');
                }

                let name = attribute.getName();
                if (!this.hasAttribute(name)) {
                    logger.info("addAttribute - adding attribute", {name: name, type: type})
                    this.attributes.push(attribute);
                    let attributeModel = attribute.getModel();
                    logger.info("addAttribute - adding attribute to schema", {attributeModel: attributeModel})
                    this.schema.push(attributeModel); // sometimes getting schema undefined
                    // update class on db
                    logger.info("addAttribute - checking for requirements before updating class on db", {space: (this.space != null), id: this.id})
                    if (this.space && this.id) {
                        logger.info("addAttribute - updating class on db")
                        await this.space.updateClass(this);
                        // TODO: Check if this class has subclasses
                        // if ( this.class )
                    }
                    return this; // return class object
                } else throw Error("Attribute with name " + name + " already exists within this Class")
            } catch (e) {
                logger.info("Falied adding attribute because: ", e)
            }
        } */
        Class.prototype.addAttribute = function (attribute) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                            var name_2, attributeModel, e_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 6, , 7]);
                                        name_2 = attribute.getName();
                                        if (!!this.hasAttribute(name_2)) return [3 /*break*/, 4];
                                        logger$2.info("addAttribute - adding attribute", { name: name_2, type: attribute.getModel() });
                                        this.attributes.push(attribute);
                                        attributeModel = attribute.getModel();
                                        logger$2.info("addAttribute - adding attribute to schema", { attributeModel: attributeModel });
                                        this.schema.push(attributeModel); // sometimes getting schema undefined
                                        // update class on db
                                        logger$2.info("addAttribute - checking for requirements before updating class on db", { space: (this.space != null), id: this.id });
                                        if (!(this.space && this.id)) return [3 /*break*/, 2];
                                        logger$2.info("addAttribute - updating class on db");
                                        return [4 /*yield*/, this.space.updateClass(this)];
                                    case 1:
                                        _a.sent();
                                        resolve(this);
                                        return [3 /*break*/, 3];
                                    case 2:
                                        logger$2.info("addAttribute - class not updated on db because of missing space or id");
                                        resolve(this);
                                        _a.label = 3;
                                    case 3: return [3 /*break*/, 5];
                                    case 4:
                                        reject("Attribute with name " + name_2 + " already exists within this Class");
                                        _a.label = 5;
                                    case 5: return [3 /*break*/, 7];
                                    case 6:
                                        e_1 = _a.sent();
                                        logger$2.info("Falied adding attribute because: ", e_1);
                                        reject(e_1);
                                        return [3 /*break*/, 7];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        }); })];
                });
            });
        };
        // TODO: modify to pass also the current class model
        // consider first fetching/updating the local class model
        Class.prototype.addCard = function (params) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.space.createDoc(null, this.getName(), this, params)];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            });
        };
        Class.prototype.addOrUpdateCard = function (params, cardId) {
            return __awaiter(this, void 0, void 0, function () {
                var filter, cards;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (cardId)
                                return [2 /*return*/, this.updateCard(cardId, params)];
                            filter = {};
                            this.getPrimaryKeys().reduce(function (accumulator, currentValue) { return accumulator[currentValue] = params[currentValue]; }, filter);
                            return [4 /*yield*/, this.getCards(filter, null, 0, 1)];
                        case 1:
                            cards = _a.sent();
                            if (cards.length > 0) {
                                return [2 /*return*/, this.updateCard(cards[0]._id, params)];
                            }
                            else {
                                return [2 /*return*/, this.addCard(params)];
                            }
                    }
                });
            });
        };
        Class.prototype.updateCard = function (cardId, params) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.space.createDoc(cardId, this.getName(), this, params)];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            });
        };
        Class.prototype.getCards = function (selector, fields, skip, limit) {
            return __awaiter(this, void 0, void 0, function () {
                var _selector, docs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _selector = __assign(__assign({}, selector), { type: this.name });
                            logger$2.info("getCards - selector", { selector: _selector, fields: fields, skip: skip, limit: limit });
                            return [4 /*yield*/, this.space.findDocuments(_selector, fields, skip, limit)];
                        case 1:
                            docs = (_a.sent()).docs;
                            return [2 /*return*/, docs];
                    }
                });
            });
        };
        return Class;
    }());

    var envPath$1 = '.env';
    dotenv__default["default"].config({ path: envPath$1 });
    // TODO: Consider an alternative for when running in the browser
    // like ftp
    var countPatches = function () {
        try {
            var folderPath = path__default["default"].resolve(__dirname, 'patch');
            console.log("countPatches - checking directory", folderPath);
            return fs__default$1["default"].readdirSync(folderPath).length;
        }
        catch (e) {
            console.log("countPatches - problem while reading patch folder", e);
        }
    };
    var importJsonFile = function (importFilePath) { return __awaiter(void 0, void 0, void 0, function () {
        var _path, data, dataObj, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    _path = path__default["default"].resolve(__dirname, importFilePath);
                    console.log("importJsonFile - importing from directory", _path);
                    return [4 /*yield*/, fs__default$1["default"].promises.readFile(_path, 'utf8')];
                case 1:
                    data = _a.sent();
                    dataObj = JSON.parse(data);
                    // console.log("importJsonFile - imported file content", dataObj)
                    return [2 /*return*/, dataObj];
                case 2:
                    error_1 = _a.sent();
                    console.error('Error reading JSON file:', error_1);
                    throw error_1;
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var setPatchCount = function () {
        var count = countPatches();
        updateEnvFile({ "PATCH_COUNT": "".concat(count) });
        console.log("PATCH_COUNT environment updated successfully. Reloading .env file...");
        dotenv__default["default"].config({ override: true });
    };

    var logger$1 = getLogger().child({ module: "Surfer" });
    var BASE_SCHEMA = [
        { name: "_id", type: "string", config: { maxLength: 100 } },
        { name: "type", type: "string", config: { maxLength: 100 } },
        { name: "createTimestamp", type: "integer", config: { min: 0 } },
        { name: "updateTimestamp", type: "integer", config: { min: 0 } },
        { name: "description", type: "string", config: { maxLength: 1000 } }
    ];
    var CLASS_SCHEMA = __spreadArray(__spreadArray([], BASE_SCHEMA, true), [
        { name: "schema", type: "attribute", config: { maxLength: 1000, isArray: true } },
        { name: "parentClass", type: "foreign_key", config: { isArray: false } },
    ], false);
    var DOMAIN_SCHEMA = __spreadArray([
        { name: "schema", type: "attribute", config: {
                isArray: true,
                defaultValue: [
                    {
                        name: "source",
                        type: "foreign_key",
                        config: {
                            isArray: false
                        }
                    },
                    {
                        name: "target",
                        type: "foreign_key",
                        config: {
                            isArray: false
                        }
                    }
                ]
            } },
        { name: "parentDomain", type: "foreign_key", config: { isArray: false } },
        { name: "relation", type: "string", config: { maxLength: 100, isArray: false } },
        { name: "sourceClass", type: "foreign_key", config: { isArray: true } },
        { name: "targetClass", type: "foreign_key", config: { isArray: true } }
    ], BASE_SCHEMA, true);
    var Surfer = /** @class */ (function () {
        function Surfer() {
            this.db = undefined;
            // Private constructor to prevent direct instantiation
        }
        Surfer.prototype.initialize = function (conn, options) {
            return __awaiter(this, void 0, void 0, function () {
                var PouchDB, Find, _i, _a, plugin;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            // Store the connection string and options
                            this.connection = conn;
                            this.options = options;
                            if (!(typeof window !== 'undefined')) return [3 /*break*/, 3];
                            return [4 /*yield*/, import('pouchdb-browser')];
                        case 1:
                            // Running in a browser
                            PouchDB = (_b.sent()).default;
                            return [4 /*yield*/, import('pouchdb-find')];
                        case 2:
                            Find = (_b.sent()).default;
                            return [3 /*break*/, 6];
                        case 3: return [4 /*yield*/, import('pouchdb-node')];
                        case 4:
                            // Running in Node.js
                            PouchDB = (_b.sent()).default;
                            return [4 /*yield*/, import('pouchdb-find')];
                        case 5:
                            Find = (_b.sent()).default;
                            _b.label = 6;
                        case 6:
                            // Load default plugins
                            PouchDB.plugin(Find);
                            if (options === null || options === void 0 ? void 0 : options.plugins) {
                                for (_i = 0, _a = options.plugins; _i < _a.length; _i++) {
                                    plugin = _a[_i];
                                    PouchDB.plugin(plugin);
                                }
                            }
                            this.db = new PouchDB(conn);
                            this.cache = {
                            // empty at init
                            };
                            return [2 /*return*/];
                    }
                });
            });
        };
        Surfer.prototype.getDb = function () {
            return this.db;
        };
        Surfer.prototype.getDbInfo = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.db.info()];
                });
            });
        };
        Surfer.prototype.getDbName = function () {
            return this.db.name;
        };
        // asynchronous factory method
        Surfer.create = function (conn, options) {
            return __awaiter(this, void 0, void 0, function () {
                var surfer;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            surfer = new Surfer();
                            return [4 /*yield*/, surfer.initialize(conn, options)];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, surfer.initdb()];
                        case 2:
                            _a.sent();
                            return [2 /*return*/, surfer];
                    }
                });
            });
        };
        Surfer.prototype.getLastDocId = function () {
            return __awaiter(this, void 0, void 0, function () {
                var lastDocId, doc, e_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            lastDocId = 0;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.db.get("lastDocId")];
                        case 2:
                            doc = _a.sent();
                            lastDocId = doc.value;
                            return [3 /*break*/, 4];
                        case 3:
                            e_1 = _a.sent();
                            if (e_1.name === 'not_found') {
                                logger$1.info("getLastDocId - not found", e_1);
                                return [2 /*return*/, lastDocId];
                            }
                            logger$1.error("checkdb - something went wrong", { "error": e_1 });
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/, lastDocId];
                    }
                });
            });
        };
        Surfer.prototype.getSystem = function () {
            return __awaiter(this, void 0, void 0, function () {
                var doc, e_2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.db.get("~system")];
                        case 1:
                            doc = _a.sent();
                            return [2 /*return*/, doc];
                        case 2:
                            e_2 = _a.sent();
                            if (e_2.name === 'not_found') {
                                logger$1.info("get System - not found", e_2);
                                return [2 /*return*/, null];
                            }
                            logger$1.error("getSystem - something went wrong", { "error": e_2 });
                            throw new Error(e_2);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        // TODO Parametrize the URL in a way that during the build procedure
        // it get substituted with the correct path for the build configuration
        Surfer.prototype.loadPatches = function () {
            return __awaiter(this, void 0, void 0, function () {
                var __patchDir, patchCount, patches, e_3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            __patchDir = "../datamodel/patch";
                            __patchDir = "patch";
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            patchCount = Number(process.env.PATCH_COUNT);
                            logger$1.info("loadPatches - preparing to load ".concat(patchCount, " patches"));
                            return [4 /*yield*/, Promise.all(Array.from({ length: patchCount }).map(function (_, index) {
                                    var _index = "".concat(index).padStart(3, '0');
                                    var importFilePath = "".concat(__patchDir, "/patch-").concat(_index, ".json");
                                    logger$1.info("loadPatches - loading patch from path", { path: importFilePath });
                                    return importJsonFile(importFilePath);
                                    // return import(importFilePath)
                                }))];
                        case 2:
                            patches = _a.sent();
                            patches = patches.map(function (patch) {
                                logger$1.info("loadPatches - Parsing patch", { patch: patch });
                                return patch;
                            });
                            logger$1.info("loadPatches - Successfully loaded patches");
                            logger$1.info("loadPatches - patches", { patches: patches });
                            return [2 /*return*/, patches];
                        case 3:
                            e_3 = _a.sent();
                            logger$1.error("loadPatches - something went wrong", e_3);
                            throw new Error(e_3);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        // TODO: Consider storing applied patches in a Class like "Patch"
        // this would help keeping track of the application date of patches
        // and eventually provide a better way to discern which patch to apply or not
        Surfer.prototype.applyPatch = function (patch) {
            return __awaiter(this, void 0, void 0, function () {
                var e_4;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            logger$1.info("applyPatch - attempting to apply patch", { patch: patch });
                            return [4 /*yield*/, this.db.bulkDocs(patch.docs)];
                        case 1:
                            _a.sent();
                            logger$1.info("applyPatch - Successfully applied patch", { version: patch.version });
                            return [2 /*return*/, patch.version];
                        case 2:
                            e_4 = _a.sent();
                            logger$1.error("applyPatch - something went wrong", e_4);
                            throw new Error(e_4);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        Surfer.prototype.applyPatches = function (schemaVersion) {
            return __awaiter(this, void 0, void 0, function () {
                var _schemaVersion, allPatches, startingIndex, patches, _i, patches_1, patch, e_5;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _schemaVersion = schemaVersion;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 7, , 8]);
                            return [4 /*yield*/, this.loadPatches()];
                        case 2:
                            allPatches = _a.sent();
                            startingIndex = schemaVersion ? (allPatches.findIndex(function (patch) { return patch.version === schemaVersion; }) + 1)
                                : 0;
                            logger$1.info("applyPatches - Starting to apply patches from index ".concat(startingIndex));
                            if (startingIndex === -1 || startingIndex === allPatches.length) {
                                logger$1.info("applyPatches - No patches to apply");
                                return [2 /*return*/, schemaVersion];
                            }
                            patches = allPatches.slice(startingIndex);
                            _i = 0, patches_1 = patches;
                            _a.label = 3;
                        case 3:
                            if (!(_i < patches_1.length)) return [3 /*break*/, 6];
                            patch = patches_1[_i];
                            return [4 /*yield*/, this.applyPatch(patch)];
                        case 4:
                            _schemaVersion = _a.sent();
                            _a.label = 5;
                        case 5:
                            _i++;
                            return [3 /*break*/, 3];
                        case 6:
                            logger$1.info("applyPatches - Successfully applied patches till version", { version: _schemaVersion });
                            return [3 /*break*/, 8];
                        case 7:
                            e_5 = _a.sent();
                            logger$1.error("applyPatches - something went wrong", e_5);
                            return [3 /*break*/, 8];
                        case 8: return [2 /*return*/, _schemaVersion];
                    }
                });
            });
        };
        // Method that verifies wether the system information are updated
        // applies patches too
        // TODO: Test if works corrrectly with multiple patch files
        Surfer.prototype.checkSystem = function () {
            return __awaiter(this, void 0, void 0, function () {
                var systemDoc, _systemDoc, dbInfo, schemaVersion, schemaVersion, e_6;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.getSystem()];
                        case 1:
                            systemDoc = _a.sent();
                            return [4 /*yield*/, this.getDbInfo()];
                        case 2:
                            dbInfo = _a.sent();
                            logger$1.info("checkSystem - current system doc", { system: systemDoc });
                            if (!!systemDoc) return [3 /*break*/, 4];
                            _systemDoc = {
                                _id: "~system",
                                appVersion: Surfer.appVersion,
                                dbInfo: dbInfo,
                                schemaVersion: undefined,
                                startupTime: (new Date()).valueOf()
                            };
                            return [4 /*yield*/, this.applyPatches(_systemDoc.schemaVersion)];
                        case 3:
                            schemaVersion = _a.sent();
                            _systemDoc.schemaVersion = schemaVersion;
                            return [3 /*break*/, 6];
                        case 4:
                            logger$1.info("checkSystem - system doc already exists. Checking for updates", systemDoc);
                            return [4 /*yield*/, this.applyPatches(systemDoc.schemaVersion)];
                        case 5:
                            schemaVersion = _a.sent();
                            _systemDoc = __assign(__assign({}, systemDoc), { appVersion: Surfer.appVersion, dbInfo: dbInfo, schemaVersion: schemaVersion, startupTime: (new Date()).valueOf() });
                            _a.label = 6;
                        case 6:
                            _a.trys.push([6, 8, , 9]);
                            return [4 /*yield*/, this.db.put(_systemDoc)];
                        case 7:
                            _a.sent();
                            return [3 /*break*/, 9];
                        case 8:
                            e_6 = _a.sent();
                            logger$1.error("checkSystem - There was a problem while updating system", { error: e_6 });
                            throw new Error(e_6);
                        case 9:
                            logger$1.info("checkSystem - updated system", { system: _systemDoc });
                            return [2 /*return*/];
                    }
                });
            });
        };
        // Database initialization should be about making sure that all the documents
        // representing the base data model for this framework are present
        // perform tasks like applying patches, creating indexes, etc.
        Surfer.prototype.initdb = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.initIndex()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.checkSystem()];
                        case 2:
                            _a.sent();
                            return [2 /*return*/, this];
                    }
                });
            });
        };
        // TODO: Make the caching time configurable, and implement regular cleaning of cache
        Surfer.prototype.getClass = function (className) {
            return __awaiter(this, void 0, void 0, function () {
                var classObj;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            // Check if class is in cache and not expired
                            if (this.cache[className] && Date.now() < this.cache[className].ttl) {
                                logger$1.info("getClass -  retrieving class from cache", { ttl: this.cache[className].ttl });
                                return [2 /*return*/, this.cache[className]];
                            }
                            return [4 /*yield*/, Class.fetch(this, className)];
                        case 1:
                            classObj = _a.sent();
                            classObj.ttl = Date.now() + 60000; // 1 minute expiration
                            this.cache[className];
                            return [2 /*return*/, classObj];
                    }
                });
            });
        };
        Surfer.prototype.initIndex = function () {
            return __awaiter(this, void 0, void 0, function () {
                var lastDocId, response, e_7;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 5, , 6]);
                            return [4 /*yield*/, this.getLastDocId()];
                        case 1:
                            lastDocId = _a.sent();
                            if (!!lastDocId) return [3 /*break*/, 3];
                            lastDocId = Number(lastDocId);
                            return [4 /*yield*/, this.db.put({
                                    _id: "lastDocId",
                                    value: ++lastDocId
                                })];
                        case 2:
                            response = _a.sent();
                            if (response.ok)
                                this.lastDocId = lastDocId;
                            else
                                throw new Error("Got problem while putting doc" + response);
                            return [3 /*break*/, 4];
                        case 3:
                            logger$1.info("initdb - db already initialized, consider purge");
                            _a.label = 4;
                        case 4:
                            this.lastDocId = Number(lastDocId);
                            return [3 /*break*/, 6];
                        case 5:
                            e_7 = _a.sent();
                            logger$1.error("initdb -  something went wrong", e_7);
                            throw new Error("initdb -  something went wrong" + e_7);
                        case 6: return [2 /*return*/];
                    }
                });
            });
        };
        // static async build( that: Surfer ) {
        //     let result = await that.initdb();
        //     return result;
        // }
        // TODO: Consider filtering returned properties
        Surfer.prototype.getDocument = function (docId) {
            return __awaiter(this, void 0, void 0, function () {
                var doc, e_8;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            doc = undefined;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.db.get(docId)];
                        case 2:
                            doc = _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            e_8 = _a.sent();
                            if (e_8.name === 'not_found') {
                                logger$1.info("getDocument - not found", e_8);
                                return [2 /*return*/, null];
                            }
                            logger$1.info("getDocument - error", e_8);
                            throw new Error(e_8);
                        case 4: return [2 /*return*/, doc];
                    }
                });
            });
        };
        Surfer.prototype.getDocRevision = function (docId) {
            return __awaiter(this, void 0, void 0, function () {
                var _rev, doc, e_9;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _rev = null;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.getDocument(docId)];
                        case 2:
                            doc = _a.sent();
                            _rev = doc._rev;
                            return [3 /*break*/, 4];
                        case 3:
                            e_9 = _a.sent();
                            logger$1.info("getDocRevision - error", e_9);
                            throw new Error(e_9);
                        case 4: return [2 /*return*/, _rev];
                    }
                });
            });
        };
        // Expects a selector like { type: { $eq: "class" } }
        Surfer.prototype.findDocuments = function (selector_1) {
            return __awaiter(this, arguments, void 0, function (selector, fields, skip, limit) {
                var indexFields, result, foundResult, e_10;
                if (fields === void 0) { fields = undefined; }
                if (skip === void 0) { skip = undefined; }
                if (limit === void 0) { limit = undefined; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            indexFields = Object.keys(selector);
                            result = {
                                docs: []
                            };
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.db.createIndex({
                                    index: { fields: indexFields }
                                })];
                        case 2:
                            _a.sent();
                            return [4 /*yield*/, this.db.find({
                                    selector: selector,
                                    fields: fields,
                                    skip: skip,
                                    limit: limit
                                })];
                        case 3:
                            foundResult = _a.sent();
                            logger$1.info("findDocument - found", {
                                result: foundResult,
                                selector: selector,
                            });
                            result = { docs: foundResult.docs, selector: selector, skip: skip, limit: limit };
                            return [2 /*return*/, result];
                        case 4:
                            e_10 = _a.sent();
                            logger$1.info("findDocument - error", e_10);
                            return [2 /*return*/, { docs: [], error: e_10.toString(), selector: selector, skip: skip, limit: limit }];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        };
        Surfer.prototype.findDocument = function (selector_1) {
            return __awaiter(this, arguments, void 0, function (selector, fields, skip, limit) {
                var result;
                if (fields === void 0) { fields = undefined; }
                if (skip === void 0) { skip = undefined; }
                if (limit === void 0) { limit = undefined; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.findDocuments(selector, fields, skip, limit)];
                        case 1:
                            result = _a.sent();
                            return [2 /*return*/, result.docs.length > 0 ? result.docs[0] : null];
                    }
                });
            });
        };
        // TODO: Understand why most classes are empty of attributes
        Surfer.prototype.getClassModel = function (className) {
            return __awaiter(this, void 0, void 0, function () {
                var selector, response, result, e_11;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            selector = {
                                type: { $eq: "class" },
                                name: { $eq: className }
                            };
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.findDocument(selector)];
                        case 2:
                            response = _a.sent();
                            if (response == null)
                                return [2 /*return*/, null];
                            result = response;
                            logger$1.info("getClassModel - result", { result: result });
                            return [2 /*return*/, result];
                        case 3:
                            e_11 = _a.sent();
                            logger$1.info("getClassModel - error", e_11);
                            throw new Error(e_11);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        /*
        async getDomainModel( domainName: string ) {
            let selector = {
                type: { $eq: "domain" },
                name: { $eq: domainName }
            }

            let response = await this.findDocument(selector)
            let result: DomainModel = response as DomainModel
            logger.info("getDomainModel - result", {result})
            return result;
        } */
        Surfer.prototype.getAllClassModels = function () {
            return __awaiter(this, void 0, void 0, function () {
                var selector, fields, response, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            selector = {
                                type: { $eq: "class" }
                            };
                            fields = ['_id', 'name', 'description'];
                            return [4 /*yield*/, this.findDocuments(selector, fields)];
                        case 1:
                            response = _a.sent();
                            result = response.docs;
                            return [2 /*return*/, result];
                    }
                });
            });
        };
        Surfer.prototype.getClassModels = function (classNames) {
            return __awaiter(this, void 0, void 0, function () {
                var allClasses, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.getAllClassModels()];
                        case 1:
                            allClasses = _a.sent();
                            result = allClasses.filter(function (classObj) { return classNames.includes(classObj.name); });
                            return [2 /*return*/, result];
                    }
                });
            });
        };
        Surfer.prototype.incrementLastDocId = function () {
            return __awaiter(this, void 0, void 0, function () {
                var docId, _rev;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            docId = "lastDocId";
                            return [4 /*yield*/, this.getDocRevision(docId)];
                        case 1:
                            _rev = _a.sent();
                            return [4 /*yield*/, this.db.put({
                                    _id: "lastDocId",
                                    _rev: _rev,
                                    value: ++this.lastDocId
                                })];
                        case 2:
                            _a.sent();
                            return [2 /*return*/, this.lastDocId];
                    }
                });
            });
        };
        // The idea of this method is to be called from within the server (like CLI command)
        // 
        Surfer.prototype.reset = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.destroyDb()];
                        case 1:
                            _a.sent();
                            // wait a few seconds
                            return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                        case 2:
                            // wait a few seconds
                            _a.sent();
                            return [4 /*yield*/, this.initialize(this.connection, this.options)];
                        case 3:
                            _a.sent();
                            return [4 /*yield*/, this.initdb()];
                        case 4:
                            _a.sent();
                            return [2 /*return*/, this];
                    }
                });
            });
        };
        Surfer.prototype.destroyDb = function () {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            try {
                                _this.db.destroy(null, function () {
                                    logger$1.info("reset - Destroyed db");
                                    resolve(true);
                                });
                            }
                            catch (e) {
                                logger$1.error("reset - Error while destroying db" + e);
                                reject(false);
                            }
                        })];
                });
            });
        };
        // This method is similar to destroyDb, but intended to be called from the client (not to destroy the main db)
        // TODO: Right now this allows to clear any db
        // there should be more restrictions
        Surfer.clear = function (conn) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            try {
                                var db = new NodePouchDB__default["default"](conn);
                                db.destroy(null, function () {
                                    logger$1.info("clear - Destroyed db");
                                    resolve(true);
                                });
                            }
                            catch (e) {
                                logger$1.error("clear - Error while destroying db" + e);
                                reject(false);
                            }
                        })];
                });
            });
        };
        Surfer.prototype.addClass = function (classObj) {
            return __awaiter(this, void 0, void 0, function () {
                var classModel, existingDoc, resultDoc;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            classModel = classObj.getModel();
                            logger$1.info("addClass - got class model", { classModel: classModel });
                            return [4 /*yield*/, this.getClassModel(classModel.name)];
                        case 1:
                            existingDoc = _a.sent();
                            if (!(existingDoc == null)) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.createDoc(classModel.name, 'class', classObj, classModel)];
                        case 2:
                            resultDoc = _a.sent();
                            logger$1.info("addClass - result", { result: resultDoc });
                            return [2 /*return*/, resultDoc];
                        case 3: return [2 /*return*/, existingDoc];
                    }
                });
            });
        };
        // async addDomain( domainObj: Domain ) {
        //     let domainModel = domainObj.getModel();
        //     let existingDoc = await this.getDomainModel(domainModel.name);
        //     if ( existingDoc == null ) {
        //         let resultDoc = await this.createDoc(domainModel.name, domainObj, domainModel);
        //         logger.info("addClass - result", resultDoc)
        //         return resultDoc as DomainModel;
        //     } else {
        //         return existingDoc;
        //     }
        // }
        Surfer.prototype.updateClass = function (classObj) {
            return __awaiter(this, void 0, void 0, function () {
                var result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.createDoc(classObj.getId(), 'class', classObj, classObj.getModel())];
                        case 1:
                            result = _a.sent();
                            logger$1.info("updateClass - result", result);
                            return [2 /*return*/, result];
                    }
                });
            });
        };
        // async updateDomain(domainObj: Domain) {
        //     return this.createDoc(domainObj.getId(), domainObj, domainObj.getModel());
        // }
        // You have an object and array of AttributeModels,
        // therefore each element of the array has an attribute name,
        // a type and a configuration
        // Based on the configuration apply various checks on the given object's
        // value at the corresponding attribute name
        // [TODO] Implement also for attributes of type different from string
        // [TODO] Implement primary key check for combination of attributes and not just one
        Surfer.prototype.validateObject = function (obj, type, attributeModels) {
            return __awaiter(this, void 0, void 0, function () {
                var isValid, _i, attributeModels_1, model, value, message, message, _a, decryptedString, duplicates, foreignKeyDoc, e_12;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            logger$1.info("validateObject - given args", { obj: obj, attributeModels: attributeModels });
                            isValid = true;
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 13, , 14]);
                            _i = 0, attributeModels_1 = attributeModels;
                            _c.label = 2;
                        case 2:
                            if (!(_i < attributeModels_1.length)) return [3 /*break*/, 12];
                            model = attributeModels_1[_i];
                            value = obj[model.name];
                            logger$1.info("validateObject - model", { model: model, value: value });
                            // Check if the property exists
                            if (value === undefined && model.config.mandatory) {
                                message = "Property ".concat(model.name, " does not exist on the object.");
                                logger$1.error(message);
                                throw new Error(message);
                            }
                            if (!model.config.mandatory && value === undefined) {
                                message = "Property ".concat(model.name, " is not mandatory and does not exist on the object. Skipping validation of this attribute");
                                logger$1.info(message);
                                return [3 /*break*/, 11];
                            }
                            // update object's value to the default value
                            if (model.config.defaultValue && value === undefined) {
                                logger$1.info("Property ".concat(model.name, " is missing, setting to default value."));
                                obj[model.name] = model.config.defaultValue;
                                value = obj[model.name];
                            }
                            _a = model.type;
                            switch (_a) {
                                case 'string': return [3 /*break*/, 3];
                                case 'decimal': return [3 /*break*/, 6];
                                case 'integer': return [3 /*break*/, 7];
                                case "foreign_key": return [3 /*break*/, 8];
                            }
                            return [3 /*break*/, 10];
                        case 3:
                            if (!model.config.isArray && typeof value !== model.type) {
                                logger$1.info("Property ".concat(model.name, " is not of type ").concat(model.type, "."));
                                return [2 /*return*/, false];
                            }
                            else if (model.config.isArray && !Array.isArray(value)) {
                                logger$1.info("Property ".concat(model.name, " is not an array."));
                                return [2 /*return*/, false];
                            }
                            if (!model.config) return [3 /*break*/, 5];
                            if (model.config.maxLength && value.length > model.config.maxLength) {
                                logger$1.info("Property ".concat(model.name, " is longer than ").concat(model.config.maxLength, " characters."));
                                return [2 /*return*/, false];
                            }
                            if (model.config.encrypted) {
                                decryptedString = decryptString(value);
                                console.log("decryptedString", decryptedString);
                                if (decryptedString === null) {
                                    logger$1.info("Property ".concat(model.name, " is not encrypted correctly."));
                                    return [2 /*return*/, false];
                                }
                            }
                            if (!model.config.primaryKey) return [3 /*break*/, 5];
                            logger$1.info("primaryKey check", { type: type, model: model, value: value });
                            return [4 /*yield*/, this.findDocuments((_b = {
                                        "type": { $eq: type }
                                    },
                                    _b[model.name] = { $eq: value },
                                    _b))];
                        case 4:
                            duplicates = _c.sent();
                            if (duplicates.docs.length > 0) {
                                logger$1.info("A card with property ".concat(model.name, " already exists."), duplicates);
                                throw new Error("A card with property ".concat(model.name, " already exists."));
                            }
                            _c.label = 5;
                        case 5: return [3 /*break*/, 11];
                        case 6:
                            // TODO: decide how to interpret decimal
                            if (model.config) {
                                if (model.config.min && value < model.config.min) {
                                    logger$1.info("Property ".concat(model.name, " is less than ").concat(model.config.min, "."));
                                    return [2 /*return*/, false];
                                }
                                if (model.config.max && value > model.config.max) {
                                    logger$1.info("Property ".concat(model.name, " is greater than ").concat(model.config.max, "."));
                                    return [2 /*return*/, false];
                                }
                            }
                            return [3 /*break*/, 11];
                        case 7:
                            if (!model.config.isArray && typeof value !== 'number') {
                                logger$1.info("Property ".concat(model.name, " is not of type ").concat(model.type, "."));
                            }
                            else if (model.config.isArray && (!Array.isArray(value) || !value.every(function (v) { return typeof v === 'number'; }))) {
                                logger$1.info("Property ".concat(model.name, " is not an array."));
                                return [2 /*return*/, false];
                            }
                            if (model.config) {
                                if (model.config.min && value < model.config.min) {
                                    logger$1.info("Property ".concat(model.name, " is less than ").concat(model.config.min, "."));
                                    return [2 /*return*/, false];
                                }
                                if (model.config.max && value > model.config.max) {
                                    logger$1.info("Property ".concat(model.name, " is greater than ").concat(model.config.max, "."));
                                    return [2 /*return*/, false];
                                }
                            }
                            return [3 /*break*/, 11];
                        case 8:
                            model.config;
                            return [4 /*yield*/, this.getDocument(value)];
                        case 9:
                            foreignKeyDoc = _c.sent();
                            if (foreignKeyDoc == null) {
                                logger$1.info("Foreign key ".concat(value, " does not exist."));
                                return [2 /*return*/, false];
                            }
                            return [3 /*break*/, 11];
                        case 10:
                            logger$1.info("Probably an attribute? Huh", model);
                            _c.label = 11;
                        case 11:
                            _i++;
                            return [3 /*break*/, 2];
                        case 12: return [3 /*break*/, 14];
                        case 13:
                            e_12 = _c.sent();
                            logger$1.info("validateObject - error", e_12);
                            return [2 /*return*/, false];
                        case 14:
                            logger$1.info("validateObject - result", { type: type, result: isValid });
                            return [2 /*return*/, isValid];
                    }
                });
            });
        };
        Surfer.prototype.validateObjectByType = function (obj, type, schema) {
            return __awaiter(this, void 0, void 0, function () {
                var schema_, _a, classDoc, e_13;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            logger$1.info("validateObjectByType - given args", { obj: obj, type: type, schema: schema });
                            schema_ = [];
                            _a = type;
                            switch (_a) {
                                case "class": return [3 /*break*/, 1];
                                case "domain": return [3 /*break*/, 2];
                            }
                            return [3 /*break*/, 3];
                        case 1:
                            schema_ = CLASS_SCHEMA;
                            return [3 /*break*/, 7];
                        case 2:
                            schema_ = DOMAIN_SCHEMA;
                            return [3 /*break*/, 7];
                        case 3:
                            if (!!schema) return [3 /*break*/, 7];
                            _b.label = 4;
                        case 4:
                            _b.trys.push([4, 6, , 7]);
                            return [4 /*yield*/, this.getClassModel(type)];
                        case 5:
                            classDoc = _b.sent();
                            schema_ = classDoc.schema;
                            return [3 /*break*/, 7];
                        case 6:
                            e_13 = _b.sent();
                            // if 404 validation failed because of missing class
                            logger$1.info("validateObjectByType - failed because of error", e_13);
                            return [2 /*return*/, false];
                        case 7: return [4 /*yield*/, this.validateObject(obj, type, schema_)];
                        case 8: return [2 /*return*/, _b.sent()];
                    }
                });
            });
        };
        Surfer.prototype.prepareDoc = function (_id, type, params) {
            logger$1.info("prepareDoc - given args", { _id: _id, type: type, params: params });
            params["_id"] = _id;
            params["type"] = type;
            params["createTimestamp"] = new Date().getTime();
            logger$1.info("prepareDoc - after elaborations", { params: params });
            return params;
        };
        Surfer.prototype.createDoc = function (docId, type, classObj, params) {
            return __awaiter(this, void 0, void 0, function () {
                var schema, db, doc, isNewDoc, validationRes, existingDoc, doc_, response, e_14;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            schema = classObj.buildSchema();
                            logger$1.info("createDoc - args", { docId: docId, type: type, params: params, schema: schema });
                            db = this.db, isNewDoc = false;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 7, , 8]);
                            return [4 /*yield*/, this.validateObjectByType(params, type, schema)];
                        case 2:
                            validationRes = _a.sent();
                            if (!validationRes) {
                                throw new Error("createDoc - Invalid object");
                            }
                            if (!docId) return [3 /*break*/, 4];
                            return [4 /*yield*/, this.getDocument(docId)];
                        case 3:
                            existingDoc = _a.sent();
                            logger$1.info("retrieved doc", { existingDoc: existingDoc });
                            if (existingDoc && existingDoc.type === type) {
                                logger$1.info("createDoc - assigning existing doc");
                                doc = __assign({}, existingDoc);
                            }
                            else if (existingDoc && existingDoc.type !== type) {
                                throw new Error("createDoc - Existing document type differs");
                            }
                            else {
                                isNewDoc = true;
                                doc = this.prepareDoc(docId, type, params);
                            }
                            return [3 /*break*/, 5];
                        case 4:
                            docId = "".concat(type, "-").concat((this.lastDocId + 1));
                            doc = this.prepareDoc(docId, type, params);
                            isNewDoc = true;
                            logger$1.info("createDoc - generated docId", docId);
                            _a.label = 5;
                        case 5:
                            logger$1.info("createDoc - doc BEFORE elaboration (i.e. merge)", { doc: doc, params: params });
                            doc_ = __assign(__assign(__assign({}, doc), params), { _id: docId, updateTimestamp: new Date().getTime() });
                            logger$1.info("createDoc - doc AFTER elaboration (i.e. merge)", { doc_: doc_ });
                            return [4 /*yield*/, db.put(doc_)];
                        case 6:
                            response = _a.sent();
                            logger$1.info("createDoc - Response after put", { "response": response });
                            if (response.ok && isNewDoc) {
                                this.incrementLastDocId();
                                // let uploadedDoc = await db.get(response.id);
                                // logger.info({"doc": uploadedDoc}, "createDoc - Uploaded doc")
                                docId = response.id;
                                // create relations if needed
                                // logger.info("createDoc - schema detail", {schema})
                                /*
                                for (const attributeModel of schema) {
                                    if (attributeModel.type === "reference") {
                                        let referenceAttr = new ReferenceAttribute(classObj, attributeModel.name, attributeModel.config as AttributeTypeReference["config"]);
                                        await this.createRelationFromRef(referenceAttr, doc);
                                    }
                                } */
                            }
                            else if (response.ok) {
                                docId = response.id;
                            }
                            else {
                                throw new Error("createDoc - error:" + response.ok);
                            }
                            return [3 /*break*/, 8];
                        case 7:
                            e_14 = _a.sent();
                            if (e_14.name === 'conflict') {
                                logger$1.info("createDoc - conflict! Ignoring..");
                                // try {
                                //     let error_response = await db.get(docId).then((_doc) => {   
                                //         doc = Object.assign(_doc, doc);
                                //         doc.updateTimestamp = new Date().getTime();
                                //         doc._rev = _doc._rev;
                                //         return db.put(doc);
                                //     })
                                //     logger.info("createDoc - Response after conflict put",{"response": error_response});
                                // } catch (e) {
                                //     logger.info("another error",e)
                                // }
                                // conflict!
                            }
                            else {
                                logger$1.info("createDoc - Problem while putting doc", {
                                    "error": e_14,
                                    "document": doc
                                });
                                throw new Error("createDoc - Problem while putting doc" + e_14);
                            }
                            return [3 /*break*/, 8];
                        case 8: 
                        // Note that doc don't contain the _rev field. This approach enforce the use of 
                        // retreiving the document from the database to get the _rev field
                        return [2 /*return*/, doc];
                    }
                });
            });
        };
        Surfer.appVersion = "0.0.1";
        return Surfer;
    }());

    var logger = getLogger().child({ module: "auth" });
    var envPath = '.env';
    dotenv__default["default"].config({ path: envPath });
    var generateToken = function (payload) {
        var secretKey = process.env.JWT_PRIVATE_KEY;
        if (!secretKey || secretKey === '') {
            throw new Error('JWT secret key not found');
        }
        // TODO: Consider making the expiration time configurable
        var options = {
            expiresIn: '1h', // Token expiration time
        };
        var token = jwt__default["default"].sign(payload, secretKey, options);
        return token;
    };
    var login = function (username, password) { return __awaiter(void 0, void 0, void 0, function () {
        var userDoc, storedDecryptedPsw, receivedDecryptedPsw, UserSessionClass, sessionCard, token, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!username || !password) {
                        return [2 /*return*/, { responseCode: 400, body: { error: 'Username and password are required' } }];
                    }
                    return [4 /*yield*/, globalThis.surfer.findDocument({
                            "type": "User",
                            username: { $eq: username },
                        })];
                case 1:
                    userDoc = _a.sent();
                    if (!userDoc) {
                        return [2 /*return*/, { responseCode: 404, body: { error: 'User not found' } }];
                    }
                    storedDecryptedPsw = decryptString(userDoc.password);
                    receivedDecryptedPsw = decryptString(password);
                    if (!(receivedDecryptedPsw === storedDecryptedPsw)) return [3 /*break*/, 4];
                    return [4 /*yield*/, globalThis.surfer.getClass("UserSession")];
                case 2:
                    UserSessionClass = _a.sent();
                    return [4 /*yield*/, UserSessionClass.addOrUpdateCard({
                            username: userDoc.username, //PK
                            sessionId: hashStringEpoch(userDoc.username), //unique
                            sessionStart: new Date().toISOString(),
                            sessionStatus: "active",
                        })];
                case 3:
                    sessionCard = _a.sent();
                    token = generateToken({
                        username: userDoc.username,
                        id: userDoc.id,
                        email: userDoc.email,
                        sessionId: sessionCard.sessionId
                    }) // return the token and expiration time (1h)
                    ;
                    body = {
                        success: true,
                        message: 'Login successful',
                        // token,
                        expiresIn: 3600,
                        sessionId: sessionCard.sessionId
                    };
                    return [2 /*return*/, { responseCode: 200, body: body, token: token }];
                case 4: return [2 /*return*/, { responseCode: 401, body: { error: 'Incorrect password' } }];
            }
        });
    }); };
    // Setups admin user using environment values
    var setupAdminUser = function () { return __awaiter(void 0, void 0, void 0, function () {
        var adminUsername, adminPassword, UserClass, userAdminCards, adminUser, encryptedPassword, userDocument, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("setupAdminUser - setting up admin user");
                    adminUsername = process.env.ADMIN_USERNAME;
                    adminPassword = process.env.ADMIN_PASSWORD;
                    if (!adminUsername || adminUsername === '') {
                        throw new Error("Can't configure admin user because of missing username");
                    }
                    if (!adminPassword || adminPassword === '') {
                        throw new Error("Can't configure admin user because of missing password");
                    }
                    return [4 /*yield*/, globalThis.surfer.getClass("User")];
                case 1:
                    UserClass = _a.sent();
                    return [4 /*yield*/, UserClass.getCards({
                            username: { $eq: adminUsername }
                        }, null, 0, 1)];
                case 2:
                    userAdminCards = _a.sent();
                    adminUser = userAdminCards.length ? userAdminCards[0] : undefined;
                    if (!!adminUser) return [3 /*break*/, 7];
                    logger.info("setupAdminUser - Missing admin user \"".concat(adminUsername, "\". Setting up..."));
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    encryptedPassword = encryptString(adminPassword);
                    return [4 /*yield*/, UserClass.addCard({
                            username: adminUsername, password: encryptedPassword,
                            email: "admin@email.com", firstName: "FirstName", lastName: "LastName"
                        })];
                case 4:
                    userDocument = _a.sent();
                    logger.info("setupAdminUser - Admin user just got setup successfully", { username: userDocument.username });
                    return [3 /*break*/, 6];
                case 5:
                    e_1 = _a.sent();
                    logger.error("setupAdminUser - error", { error: e_1 });
                    throw new Error(e_1);
                case 6: return [3 /*break*/, 8];
                case 7:
                    logger.info("setupAdminUser - Admin user already setup");
                    _a.label = 8;
                case 8: return [2 /*return*/];
            }
        });
    }); };

    dotenv__namespace.config({ path: './.env' });
    var CouchSurfer = /** @class */ (function (_super) {
        __extends(CouchSurfer, _super);
        function CouchSurfer(config) {
            var _this = _super.call(this) || this;
            _this.dbName = (config && config.dbName) ? config.dbName : "couchsurfer";
            var logger = getLogger().child({ module: "express" });
            _this.app = express__default["default"]();
            _this.readyState = false;
            _this.app.use(logRequest);
            // Enable CORS for all routes
            if (process.env.NODE_ENV === 'development') {
                _this.app.use(cors__default["default"]({
                    origin: 'http://localhost:8080',
                    // Replace with the origin of webpack dev server
                    methods: ['GET', 'POST'],
                    credentials: true,
                }));
            }
            // Use built-in middleware for parsing JSON and URL-encoded data
            _this.app.use(express__default["default"].json());
            _this.app.use(express__default["default"].urlencoded({ extended: true }));
            _this.app.use(cookieParser__default["default"]());
            _this.app.use(function (req, res, next) {
                if (!_this.readyState) {
                    return res.status(503); // Service Unavailable.
                }
                // Server is ready to receive requests
                next();
            });
            _this.app.use('/api/private', function (req, res, next) {
                var token = req.cookies.jwtToken;
                if (!token) {
                    logger.error("No token provided");
                    return res.status(403).json({
                        success: false,
                        message: 'No token provided',
                    });
                }
                var secretKey = process.env.JWT_PUBLIC_KEY;
                if (!secretKey || secretKey === '') {
                    logger.error("No secret key found");
                    return res.status(500).json({
                        success: false,
                        message: 'No secret key found',
                    });
                }
                jwt__default["default"].verify(token, secretKey, function (err, payload) { return __awaiter(_this, void 0, void 0, function () {
                    var sessionId, UserSessionClass, sessionCards;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (!err) return [3 /*break*/, 1];
                                logger.error("Invalid token", err);
                                return [2 /*return*/, res.status(403).json({
                                        success: false,
                                        message: 'Invalid token',
                                    })];
                            case 1:
                                sessionId = payload.sessionId;
                                return [4 /*yield*/, this.surfer.getClass("UserSession")];
                            case 2:
                                UserSessionClass = _a.sent();
                                return [4 /*yield*/, UserSessionClass.getCards({
                                        sessionId: { $eq: sessionId },
                                        sessionStatus: { $eq: "active" }
                                    }, null, 0, 1)];
                            case 3:
                                sessionCards = _a.sent();
                                if (sessionCards.length === 0) {
                                    return [2 /*return*/, res.status(403).json({
                                            success: false,
                                            message: 'Session expired',
                                        })];
                                }
                                // TODO: Consider passing the session card to the next middleware
                                next();
                                _a.label = 4;
                            case 4: return [2 /*return*/];
                        }
                    });
                }); });
            });
            // TODO: Serve the dashboard to a specific route, i.e.: admin 
            // this.app.use(exStatic('./dist'));
            // TODO: Serve the static files from the build folder
            // of the UI application
            // this.app.get('*', (req, res) => {
            //     const templatePath = resolve(__dirname, './dist', 'index.html');
            //     res.sendFile(templatePath);
            // });
            _this.app.post('/login', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, username, password, _b, responseCode, body, token, cookieOptions, error_1;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _c.trys.push([0, 2, , 3]);
                            _a = req.body, username = _a.username, password = _a.password;
                            return [4 /*yield*/, login(username, password)];
                        case 1:
                            _b = _c.sent(), responseCode = _b.responseCode, body = _b.body, token = _b.token;
                            cookieOptions = {};
                            if (process.env.NODE_ENV === 'development') {
                                cookieOptions = { sameSite: 'None', secure: true, maxAge: 1000 * 60 * 15 };
                                logger.warn("Development mode: setting cookie options to SameSite=None; Secure=true for JWT token");
                            }
                            else
                                cookieOptions = { sameSite: 'Strict', httpOnly: true, maxAge: 1000 * 60 * 15 };
                            res.cookie('jwtToken', token, cookieOptions);
                            return [2 /*return*/, res.status(responseCode).json(body)];
                        case 2:
                            error_1 = _c.sent();
                            console.error("Error during login", error_1);
                            return [2 /*return*/, res.status(500).json({ success: false, error: 'An error occurred' })];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            _this.app.get('/api/private/reset', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.reset()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, res.status(200).json({ success: true, message: 'Internal database reset' })];
                        case 2:
                            _a.sent();
                            return [2 /*return*/, res.status(500).json({ success: false, error: 'An error occurred' })];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            _this.app.get('/api/private/clear:conn', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var conn, e_2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            conn = req.params.conn;
                            if (!conn) {
                                throw new Error("Connection name not provided");
                            }
                            return [4 /*yield*/, Surfer.clear(conn)];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, res.status(200).json({ success: true, message: 'Internal database cleared' })];
                        case 2:
                            e_2 = _a.sent();
                            logger.error("Error during database clear", e_2);
                            return [2 /*return*/, res.status(500).json({ success: false, error: 'An error occurred' })];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            _this.app.get('/api/private/test', function (req, res) {
                return res.status(200).json({ message: 'Hello from the server! This is a private route' });
            });
            _this.app.post('/api/private/create-class/:name', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var name, _a, type, description, newClass, e_3;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            name = req.params.name;
                            _a = req.query, type = _a.type, description = _a.description;
                            logger.info("create-class - received request", {
                                params: req.params,
                                query: req.query
                            });
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, Class.create(this.surfer, name, type, description)];
                        case 2:
                            newClass = _b.sent();
                            logger.info("create-class", "class '".concat(name, "' created successfully."), { classModel: newClass.getModel() });
                            return [3 /*break*/, 4];
                        case 3:
                            e_3 = _b.sent();
                            logger.error("Error during class '".concat(name, " creation"), e_3);
                            return [2 /*return*/, res.status(500).json({ success: false, error: 'An error occurred' })];
                        case 4: return [2 /*return*/, res.status(200).json({ success: true, message: 'Class created successfully' })];
                    }
                });
            }); });
            _this.app.put('/api/private/create-attribute/:name', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var className, _a, name, type, config, classObj, newAttribute, e_4;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            className = req.params.name;
                            _a = req.body, name = _a.name, type = _a.type, config = _a.config;
                            logger.info("create-attribute - for class '".concat(className, "'"), {
                                name: name,
                                type: type,
                                config: config
                            });
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.surfer.getClass(className)];
                        case 2:
                            classObj = _b.sent();
                            return [4 /*yield*/, Attribute.create(classObj, name, type, config)];
                        case 3:
                            newAttribute = _b.sent();
                            logger.info("create-attribute - Attribute '".concat(name, "' added to class '").concat(className, "'"), { attributeModel: newAttribute.getModel() });
                            return [3 /*break*/, 5];
                        case 4:
                            e_4 = _b.sent();
                            logger.error("Error during attribute '".concat(name, "' creation"), e_4);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            // const port = process.env.SERVER_PORT || 5000;
            // const server = this.app.listen(port, () => logger.info(`Listening on port ${port}`));
            // Procedure that should run once only
            // can be considered "setup procedures"
            generatePswKeys();
            generateJwtKeys();
            // Server "startup procedures"
            setPatchCount();
            // setTimeout(test, 1000)
            _this.initInstance(_this.dbName);
            _this.on("ready", function () { return logger.info("CouchSurfer successfully initialized"); });
            return _this;
        }
        CouchSurfer.prototype.initInstance = function (dbName) {
            return __awaiter(this, void 0, void 0, function () {
                var surfer;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, Surfer.create("db-".concat(dbName), {
                                // defaults to leveldb
                                // adapter: 'memory', 
                                plugins: [
                                // https://www.npmjs.com/package/pouchdb-adapter-memory
                                // memoryAdapter
                                ]
                            })];
                        case 1:
                            surfer = _a.sent();
                            this.surfer = surfer;
                            globalThis.surfer = this.surfer;
                            return [4 /*yield*/, setupAdminUser()];
                        case 2:
                            _a.sent();
                            this.readyState = true;
                            this.emit('ready'); // TODO: consider wether to provide args
                            return [2 /*return*/];
                    }
                });
            });
        };
        CouchSurfer.prototype.resetDb = function () {
            return __awaiter(this, void 0, void 0, function () {
                var e_5;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.surfer.reset()];
                        case 1:
                            _a.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            e_5 = _a.sent();
                            throw new Error(e_5);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        CouchSurfer.prototype.getSurfer = function () {
            return this.surfer;
        };
        CouchSurfer.prototype.getReadyState = function () {
            return this.readyState;
        };
        CouchSurfer.prototype.reset = function () {
            return __awaiter(this, void 0, void 0, function () {
                var e_6;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, this.resetDb()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.initInstance(this.dbName)];
                        case 2:
                            _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            e_6 = _a.sent();
                            throw new Error(e_6);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        CouchSurfer.prototype.getApp = function () {
            return this.app;
        };
        return CouchSurfer;
    }(node_events.EventEmitter));

    exports.Attribute = Attribute;
    exports.Class = Class;
    exports.CouchSurfer = CouchSurfer;
    exports.Surfer = Surfer;
    exports.getLogger = getLogger;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
