export const ATTRIBUTE_TYPES = ["string", "decimal", "integer", "foreign_key", "date", "enum", "reference", "object", "boolean"];
export const isDocument = (object) => {
    if (object.hasOwnProperty("type")) {
        return true;
    }
    return false;
};
export const isClassModel = (object) => {
    if (object.hasOwnProperty("type") && object.type === "class") {
        return true;
    }
    return false;
};
//# sourceMappingURL=types.js.map