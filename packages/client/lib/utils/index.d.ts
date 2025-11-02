import { Document } from "@docstack/shared";
import Class from "../core/class";
import * as jsondiff from 'jsondiffpatch';
export declare const applySchemaDelta: (doc: Document, schemaDelta: jsondiff.AddedDelta | jsondiff.ModifiedDelta | jsondiff.DeletedDelta | jsondiff.ObjectDelta | jsondiff.ArrayDelta | jsondiff.MovedDelta | jsondiff.TextDiffDelta, classObj: Class) => Promise<Document>;
