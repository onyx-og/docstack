import z from "zod";
import { AttributeModel, Document } from "@docstack/shared";
import Attribute from "../core/attribute.js";
import Class from "../core/class.js";
import * as jsondiff from 'jsondiffpatch';
import createLogger from "./logger/index.js";

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
    if (operation === "add" && !(attribute.name in doc)) {
        // Only documents that lack the key get the empty value. A document may
        // already hold one - a repair patch re-declaring an attribute the model
        // lost is exactly that case (ADR-0038) - and stamping `getEmpty()` over
        // it would be data loss; validation below still runs against it.
        doc = {...doc, ...attribute.getEmpty()};
    }

    if (operation === "delete") {
        delete doc[attribute.name];
    } else { // when addition or change also perform validation
        const res = await attribute.validate(doc[attribute.name]);
        // `safeParseAsync` resolves to a result object, which is truthy whether or not the
        // value is valid: the outcome has to be read off `success`, otherwise every invalid
        // value passes straight through.
        if (!res.success) {
            throw new Error(
                `Attribute '${classObj.name}.${attribute.name}' ${operation} fails for current document because of its validation: ${z.prettifyError(res.error)}`
            );
        }
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
    classObj: Class,
    newSchema?: { [name: string]: AttributeModel }): Promise<Document> => {
    const fnLogger = createLogger().child({method: "applySchemaDelta"});
    let updatedDoc = {...doc};

    // Every entry applies - the delta names one attribute per key, and a schema
    // change routinely touches several. Returning after the first one is how a
    // two-attribute patch used to stamp only whichever came first (ADR-0036).
    for (const [name, delta] of Object.entries(schemaDelta)) {
        fnLogger.debug(`Delta of attribute '${name}'`);
        if (Array.isArray(delta)) {
            // jsondiffpatch's array shapes: [new] is an addition, [old, new] a
            // wholesale replacement, [old, 0, 0] a removal.
            if (delta.length === 1) {
                updatedDoc = await attributeEffect("add", delta[0] as AttributeModel, classObj, updatedDoc);
            } else if (delta.length === 2) {
                // The *new* model: validating against the one on its way out
                // would pin every document to the definition being replaced.
                updatedDoc = await attributeEffect("change", delta[1] as AttributeModel, classObj, updatedDoc);
            } else if (delta.length === 3) {
                updatedDoc = await attributeEffect("delete", delta[0] as AttributeModel, classObj, updatedDoc);
            }
        } else {
            // A nested delta: jsondiffpatch recurses into object values, so an
            // attribute model edited in place (one config flag, a description)
            // lands here rather than in the [old, new] branch above - this is the
            // ordinary shape of an edit, not an exotic one. The delta carries
            // only the changed fragment, so the full model to validate against
            // comes from the schema being written.
            const attrModel = newSchema?.[name];
            if (attrModel) {
                updatedDoc = await attributeEffect("change", attrModel, classObj, updatedDoc);
            } else {
                fnLogger.warn(`Unhandled delta shape for attribute '${name}': no new model to validate against`, { delta });
            }
        }
    }

    return updatedDoc;
}