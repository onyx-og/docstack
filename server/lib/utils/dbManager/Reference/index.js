"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Attribute_1 = __importDefault(require("../Attribute"));
class ReferenceAttribute extends Attribute_1.default {
    constructor(classObj = null, name, config) {
        super(classObj, name, "reference", config);
        this.domain = config.domain;
        this.position = config.position;
    }
    static async build(attributeObj) {
        let classObj = attributeObj.getClass();
        let db = classObj.getSpace();
        if (db) {
            await classObj.addReferenceAttribute(attributeObj);
            return attributeObj;
        }
        else {
            throw new Error("Missing db configuration");
        }
    }
}
exports.default = ReferenceAttribute;
//# sourceMappingURL=index.js.map