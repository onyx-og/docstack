import { AttributeModel, Document } from "@docstack/shared";
import Attribute from "../core/attribute";
import Class from "../core/class";
import * as jsondiff from 'jsondiffpatch';
import createLogger from "./logger";

const attributeEffect = async (
    operation: "delete" | "add" | "change",
    model: AttributeModel,
    classObj: Class,
    doc: Document
) => {
    const attribute = new Attribute(
        null, model.name, model.type, 
        model.description, model.config
    );
    if (operation === "add") {
        doc = {...doc, ...attribute.getEmpty()};
    }

    if (operation === "delete") {
        delete doc[attribute.name];
    } else { // when addition or change also perform validation
        const res = await attribute.validate(doc[attribute.name]);
        if (!res) throw new Error(`Attribute '${classObj.name}.${attribute.name}' ${operation} fails for current document because of its validation`);
    }

   
    if (attribute.isPrimaryKey()) {
        const result = classObj.bulkUniqueCheck(classObj.getPrimaryKeys());
        if (!result) {
            throw new Error(`With attribute '${attribute.name}' ${operation} of class '${classObj.name}', docs fail primary keys check.`);
        }
    }
    if (operation !== "delete" && attribute.isMandatory() && doc[attribute.name] == undefined) {
        throw new Error(`Attribute '${classObj.name}.${attribute.name}' is mandatory but has no value.`);
    } 
    return doc;
}

export const applySchemaDelta = async (
    doc: Document, 
    schemaDelta: jsondiff.AddedDelta | jsondiff.ModifiedDelta | jsondiff.DeletedDelta | jsondiff.ObjectDelta | jsondiff.ArrayDelta | jsondiff.MovedDelta | jsondiff.TextDiffDelta, 
    classObj: Class): Promise<Document> => {
    const fnLogger = createLogger().child({method: "applySchemaDelta"});
    let updatedDoc = {...doc};

    const t = Object.entries(schemaDelta);
    for (const e of t) {
        fnLogger.debug(`Delta of attribute '${e[0]}'`);
        if (Array.isArray(e[1])) {
            // e[1] can represent an addition, a deletion or an edit
            // it's an addition when the array has only one element
            if (e[1].length === 1) {
                const attrModel = e[1][0] as AttributeModel;
                updatedDoc = await attributeEffect("add", attrModel, classObj, updatedDoc);
            }
            // it's an edit when it has 2 elements
            if (e[1].length === 1) {
                const attrModel = e[1][0] as AttributeModel;
                updatedDoc = await attributeEffect("change", attrModel, classObj, updatedDoc);
            }

            // it's a removal when it has 3 elements
            if (e[1].length === 3) {
                const attrModel = e[1][0] as AttributeModel;
                updatedDoc = await attributeEffect("change", attrModel, classObj, updatedDoc);
            }
            return updatedDoc;
        } else {
            // TODO: The change is nested within the attribute model
        }
    }

    return updatedDoc;
}