// pouchdb-selector-core ships no typings; declared here for the transaction
// engine's overlay, which uses pouchdb-find's own matcher and collation so the
// two cannot disagree about what a selector means (ADR-0039).
declare module "pouchdb-selector-core" {
    export function massageSelector(selector: object): object;
    export function matchesSelector(doc: object, selector: object): boolean;
    export function filterInMemoryFields(rows: object[], requestDef: object, inMemoryFields: string[]): object[];
    export function createFieldSorter(sort: unknown): (a: object, b: object) => number;
    export function compare(a: unknown, b: unknown): number;
    export function parseField(fieldName: string): string[];
    export function getFieldFromDoc(doc: object, parsedField: string[]): unknown;
}
