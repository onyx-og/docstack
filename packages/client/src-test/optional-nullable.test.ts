import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("optional attributes accept null", () => {
    it("validates null, undefined and a value for an optional attribute", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "optional-null-validate",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const classObj = await Class.create(stack, "OptionalDoc", "class", "Optional doc", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                    note: { name: "note", type: "string", config: {} },
                });

                return {
                    withValue: await classObj.validate({ title: "t", note: "hello" }),
                    withUndefined: await classObj.validate({ title: "t", note: undefined }),
                    // `undefined` does not survive JSON serialization, so `null` is the only
                    // way a client can express "clear this field" on a stored document.
                    withNull: await classObj.validate({ title: "t", note: null }),
                    withWrongType: await classObj.validate({ title: "t", note: 42 }),
                };
            },
        });

        expect(result.withValue).toBe(true);
        expect(result.withUndefined).toBe(true);
        expect(result.withNull).toBe(true);
        expect(result.withWrongType).toBe(false);
    });

    it("still rejects null for mandatory attributes", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "mandatory-null-reject",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const classObj = await Class.create(stack, "MandatoryDoc", "class", "Mandatory doc", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                });

                return {
                    withValue: await classObj.validate({ title: "t" }),
                    withNull: await classObj.validate({ title: null }),
                    withMissing: await classObj.validate({}),
                };
            },
        });

        expect(result.withValue).toBe(true);
        expect(result.withNull).toBe(false);
        expect(result.withMissing).toBe(false);
    });

    it("clears a previously set optional attribute by writing null", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "optional-null-clear",
            username: "clear-test-user",
            password: "clear-test-pass",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Note-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Notes");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await Attribute.create(classObj, "note", "string", "Note");

                const created = await classObj.addCard({ title: "Doc 1", note: "to be cleared" });
                const docId = created._id;
                const before = await stack.getDocument(docId);

                let threw = false;
                let errorMessage = "";
                try {
                    await classObj.updateCard(docId, { title: "Doc 1", note: null });
                } catch (e: any) {
                    threw = true;
                    errorMessage = e.message || "";
                }

                const after = await stack.getDocument(docId);
                return { before: before?.note, after: after?.note, threw, errorMessage };
            },
        });

        expect(result.before).toBe("to be cleared");
        expect(result.threw).toBe(false);
        expect(result.after).toBeNull();
    });
});

describe("schema evolution stamps existing documents", () => {
    it("adds an optional attribute to a class that already has documents", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "optional-null-evolve",
            username: "evolve-test-user",
            password: "evolve-test-pass",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const className = `Evolving-${Math.random().toString(16).slice(2)}`;
                const classObj = await Class.create(stack, className, "class", "Evolving docs");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });

                const created = await classObj.addCard({ title: "Already stored" });
                const docId = created._id;

                // Adding the attribute propagates through the plugin, stamping every existing
                // document and re-validating it on the way back in.
                let threw = false;
                let errorMessage = "";
                try {
                    await Attribute.create(classObj, "note", "string", "Note");
                } catch (e: any) {
                    threw = true;
                    errorMessage = e.message || "";
                }

                const stamped = await stack.getDocument(docId);
                return {
                    threw,
                    errorMessage,
                    hasNote: stamped ? Object.prototype.hasOwnProperty.call(stamped, "note") : false,
                    note: stamped?.note,
                    stillValid: await classObj.validate(stamped),
                };
            },
        });

        expect(result.threw).toBe(false);
        expect(result.hasNote).toBe(true);
        expect(result.note).toBeNull();
        expect(result.stillValid).toBe(true);
    });
});

describe("falsy default values", () => {
    it("keeps falsy defaults instead of collapsing them to null", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "falsy-defaults",
            evaluate: async () => {
                const { Attribute } = (window as any).docstack;
                return {
                    bool: new Attribute(null, "flag", "boolean", "Flag", { defaultValue: false }).getEmpty(),
                    num: new Attribute(null, "count", "integer", "Count", { defaultValue: 0 }).getEmpty(),
                    str: new Attribute(null, "label", "string", "Label", { defaultValue: "" }).getEmpty(),
                };
            },
        });

        expect(result.bool).toEqual({ flag: false });
        expect(result.num).toEqual({ count: 0 });
        expect(result.str).toEqual({ label: "" });
    });

    it("returns null for an optional attribute with no default, and that null validates", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "empty-null-roundtrip",
            evaluate: async () => {
                const { Attribute } = (window as any).docstack;
                const attr = new Attribute(null, "note", "string", "Note", {});
                const empty = attr.getEmpty();
                const parsed = await attr.validate(empty.note);
                return { empty, success: parsed.success };
            },
        });

        // getEmpty stamps this value into existing documents, so the attribute's own
        // schema has to accept it.
        expect(result.empty).toEqual({ note: null });
        expect(result.success).toBe(true);
    });
});

describe("attribute validation guard", () => {
    it("distinguishes a rejected value from an accepted one", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "attribute-guard",
            evaluate: async () => {
                const { Attribute } = (window as any).docstack;
                const attr = new Attribute(null, "count", "integer", "Count", {});
                // This is the result object the guard in attributeEffect reads: it is truthy
                // either way, so only `success` distinguishes a rejection from a pass.
                const bad = await attr.validate("not-a-number");
                const good = await attr.validate(7);
                return {
                    badTruthy: !!bad,
                    badSuccess: bad.success,
                    goodSuccess: good.success,
                    issueCount: bad.success ? 0 : bad.error.issues.length,
                };
            },
        });

        expect(result.badTruthy).toBe(true);
        expect(result.badSuccess).toBe(false);
        expect(result.goodSuccess).toBe(true);
        expect(result.issueCount).toBeGreaterThan(0);
    });
});
