import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("PouchDB plugin class validation", () => {
    it("rejects documents that reference missing classes", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "missing-class",
            evaluate: async ({ stack }) => {
                const missingClass = "MissingClass";
                const doc = { _id: `missing-${Date.now()}`, "~class": missingClass };

                let threw = false;
                let errorMessage = "";
                try {
                    await stack.db.bulkDocs([doc]);
                } catch (e: any) {
                    threw = true;
                    errorMessage = e.message || "";
                }

                return { threw, errorMessage, missingClass };
            },
        });

        expect(result.threw).toBe(true);
        expect(result.errorMessage).toContain(`Class '${result.missingClass}' not found`);
    });

    it("fills declared defaults on a first write, and only then", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "declared-defaults",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const defaulted = await Class.create(stack, "Defaulted", "class", "Defaulted", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                    // Mandatory WITH a default: the case that used to validate and store
                    // nothing, so the declaration meant nothing.
                    flag: { name: "flag", type: "boolean", config: { mandatory: true, defaultValue: true } },
                    note: { name: "note", type: "string", config: { defaultValue: "none" } },
                    // No default: absence stays absence, nothing stamps null over it.
                    bare: { name: "bare", type: "string", config: {} },
                    // An array's default is an element default, so there is no sound
                    // document-level value and the attribute is left alone.
                    tags: { name: "tags", type: "string", config: { isArray: true, defaultValue: "x" } },
                });

                const created = await defaulted.addCard({ title: "first" });
                const read = await stack.getDocument(created._id);

                // An update must not resurrect a value the caller cleared.
                await defaulted.updateCard(created._id, { note: null });
                const afterClear = await stack.getDocument(created._id);

                return {
                    flag: (read as any)?.flag,
                    note: (read as any)?.note,
                    hasBare: read ? "bare" in (read as any) : null,
                    hasTags: read ? "tags" in (read as any) : null,
                    noteAfterClear: (afterClear as any)?.note,
                };
            },
        });

        expect(result.flag).toBe(true);
        expect(result.note).toBe("none");
        expect(result.hasBare).toBe(false);
        expect(result.hasTags).toBe(false);
        expect(result.noteAfterClear).toBe(null);
    });

    it("an integer attribute rejects a decimal", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "integer-validation",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const counted = await Class.create(stack, "Counted", "class", "Counted", {
                    pages: { name: "pages", type: "integer", config: { mandatory: true, min: 1 } },
                    weight: { name: "weight", type: "decimal", config: { precision: 2 } },
                });
                let writeError: string | null = null;
                try {
                    await counted.addCard({ pages: 1.5 });
                } catch (e: any) {
                    writeError = String(e?.message ?? e);
                }
                return {
                    whole: await counted.validate({ pages: 10 }),
                    // Declared `integer`, so a decimal is refused - it used to pass,
                    // which made the declared type mean nothing.
                    fractional: await counted.validate({ pages: 1.5 }),
                    negativeBelowMin: await counted.validate({ pages: 0 }),
                    // `decimal` is unaffected: fractions are its whole purpose.
                    decimalStillFractional: await counted.validate({ pages: 1, weight: 1.25 }),
                    writeRefused: writeError !== null,
                };
            },
        });

        expect(result.whole).toBe(true);
        expect(result.fractional).toBe(false);
        expect(result.negativeBelowMin).toBe(false);
        expect(result.decimalStillFractional).toBe(true);
        expect(result.writeRefused).toBe(true);
    });
});
