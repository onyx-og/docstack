import { readNewEdits } from "../pouchdb";

describe("readNewEdits", () => {
    const docs = [{ _id: "Task-1", "~class": "Task" }];

    it("defaults to true when neither side says anything", () => {
        expect(readNewEdits(docs)).toBe(true);
        expect(readNewEdits(docs, null)).toBe(true);
        expect(readNewEdits(docs, {})).toBe(true);
        expect(readNewEdits({ docs })).toBe(true);
    });

    it("reads the flag from the options object", () => {
        expect(readNewEdits(docs, { new_edits: false } as any)).toBe(false);
        expect(readNewEdits(docs, { new_edits: true } as any)).toBe(true);
    });

    it("reads the flag from the request body", () => {
        // This is the shape pouchdb-replication uses:
        //   target.bulkDocs({ docs, new_edits: false }, bulkOpts)
        // Reading only `options` would miss every write replication makes, which is
        // exactly the write that must not run through the authoring path.
        expect(readNewEdits({ docs, new_edits: false })).toBe(false);
        expect(readNewEdits({ docs, new_edits: true })).toBe(true);
    });

    it("lets the options object win over the request body", () => {
        // pouchdb-core resolves the conflict the same way: `opts` is consulted first
        // and the body only fills in when `opts` is silent.
        expect(readNewEdits({ docs, new_edits: false }, { new_edits: true } as any)).toBe(true);
        expect(readNewEdits({ docs, new_edits: true }, { new_edits: false } as any)).toBe(false);
    });

    it("ignores a `new_edits` key sitting on an array of documents", () => {
        const arrayWithProperty = Object.assign([...docs], { new_edits: false });
        expect(readNewEdits(arrayWithProperty)).toBe(true);
    });

    it("treats any non-false value as true", () => {
        expect(readNewEdits(docs, { new_edits: undefined } as any)).toBe(true);
        expect(readNewEdits({ docs, new_edits: 0 as any })).toBe(true);
    });
});
