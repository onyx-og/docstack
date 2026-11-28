import { test as it, expect } from './fixtures';

const describe = it.describe;

it.setTimeout(180_000);

/**
 * A patch declaring an attribute the engine cannot build is refused.
 *
 * It used to apply silently, and what that left behind is why this refuses rather than
 * warns. The class document is stored, so the class exists and cannot be built: reads,
 * writes and queries against it fail, and `getClasses` - the class list, for *every*
 * class - fails with it. A write that does not go through the class API, which is what
 * replication and jobs do, is refused as `Class '<name>' not found`, which is untrue.
 *
 * And then it is terminal. Propagation builds the *previous* class model to diff a schema
 * change against, so **any later patch touching the class fails to apply** - a patch
 * repairing the attribute as much as one dropping it. The application keeps running until
 * the fix ships, and the fix is what stops it opening. The only way out is removing the
 * class document and the ledger entry by hand.
 *
 * The checks themselves are not new, and neither are their messages: this runs the
 * engine's own `new Attribute(...)` at patch time instead of leaving it to whatever reads
 * the class first.
 */
describe("a patch declaring an unbuildable attribute", () => {
    /** A class document with one healthy attribute and one to vary. */
    const classWith = (x: unknown) => ({
        _id: "Varied", "~class": "class", active: true, name: "Varied", description: "d",
        schema: { title: { name: "title", type: "string", config: { mandatory: true } }, x },
    });

    it("is refused, naming the class, the attribute and the reason", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async (classes) => {
            const { DocStack } = (window as any).docstack;
            const docStack = new DocStack();
            const attempt = async (label: string, doc: any) => {
                const name = `attr-${label}-${Math.random().toString(16).slice(2)}`;
                try {
                    await docStack.addStack({
                        name, documentKey: "0".repeat(64),
                        patches: [{
                            _id: "p-1.0.0", "~class": "patch", target: "app", version: "1.0.0",
                            changelog: label, docs: [doc],
                        }],
                    });
                } catch (error: any) {
                    return { refused: true, message: String(error?.message ?? error) };
                }
                // It opened, which the healthy case expects and the rest do not. Report
                // whether the class is usable, so a pass here is still informative.
                const stack = docStack.getStack(name)!;
                await stack.authenticate({ username: "system", password: "system" });
                let buildable = true;
                try { await stack.getClass("Varied"); } catch { buildable = false; }
                let listOk = true;
                try { await stack.getClasses({}); } catch { listOk = false; }
                await docStack.removeStack(name, { destroy: true });
                return { refused: false, buildable, listOk };
            };

            const out: Record<string, any> = {};
            for (const [label, doc] of Object.entries(classes)) {
                out[label] = await attempt(label, doc);
            }
            return out;
        }, {
            unsupportedType: classWith({ name: "x", type: "nonsense", config: {} }),
            emptyEnum: classWith({ name: "x", type: "enum", config: { values: [] } }),
            enumNoValues: classWith({ name: "x", type: "enum", config: {} }),
            foreignKeyNoTarget: classWith({ name: "x", type: "foreign_key", config: {} }),
            // `date` is declared in the types but has no validator on this line, so any
            // `date` attribute is unbuildable. A patch carrying one used to install a
            // class nothing could read; now it is told. The type arrives in 2.0.
            unsupportedDate: classWith({ name: "x", type: "date", config: {} }),
            nameMismatch: classWith({ name: "wrong", type: "string", config: {} }),
            notAModel: classWith("string"),
            healthy: classWith({ name: "x", type: "integer", config: { min: 0 } }),
        });

        // Every malformed model is refused, and each message names where to look.
        for (const label of [
            "unsupportedType", "emptyEnum", "enumNoValues",
            "foreignKeyNoTarget", "unsupportedDate", "nameMismatch", "notAModel",
        ]) {
            expect(result[label]?.refused, label).toBe(true);
            expect(result[label]?.message, label).toContain("Varied.x");
            expect(result[label]?.message, label).toContain("1.0.0");
        }

        // The reason is the engine's own, not a restatement: these are the messages the
        // validator always gave, moved to the moment the patch is written. Which also
        // bounds what this catches: an `enum` whose values are numbers builds without
        // complaint here and then rejects every input, because the validator does not
        // check value types on this line. Nothing to move earlier until it does.
        expect(result.unsupportedType.message).toContain("Invalid attribute type: nonsense");
        expect(result.emptyEnum.message).toContain("non-empty 'values' array");
        expect(result.enumNoValues.message).toContain("non-empty 'values' array");
        expect(result.foreignKeyNoTarget.message).toContain("missing a 'targetClass'");
        expect(result.unsupportedDate.message).toContain("Unsupported schema type: 'date'");

        // The key and the model's own `name` must agree. A mismatch never failed - it
        // silently registered the attribute under the model's name and ignored the key,
        // so `schema.x` delivered an attribute called `wrong`.
        expect(result.nameMismatch.message).toContain("names itself 'wrong'");
        expect(result.nameMismatch.message).toContain("would be ignored");

        // A healthy class still applies, and is usable.
        expect(result.healthy.refused).toBe(false);
        expect(result.healthy.buildable).toBe(true);
        expect(result.healthy.listOk).toBe(true);
    });

    it("persists nothing when it refuses, and leaves a drop marker alone", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const docStack = new DocStack();
            const name = `attr-zero-${Date.now()}`;

            // Two patches, the second faulty: the chain is all-or-nothing, so the first
            // must not land either (ADR-0042).
            const good = {
                _id: "p-1.0.0", "~class": "patch", target: "app", version: "1.0.0",
                changelog: "a healthy class",
                docs: [{
                    _id: "First", "~class": "class", active: true, name: "First", description: "d",
                    schema: { title: { name: "title", type: "string", config: {} } },
                }],
            };
            const faulty = {
                _id: "p-1.1.0", "~class": "patch", target: "app", version: "1.1.0",
                changelog: "a broken class",
                docs: [{
                    _id: "Second", "~class": "class", active: true, name: "Second", description: "d",
                    schema: { x: { name: "x", type: "nonsense", config: {} } },
                }],
            };

            let refusedMessage: string | null = null;
            try {
                await docStack.addStack({ name, documentKey: "0".repeat(64), patches: [good, faulty] });
            } catch (error: any) {
                refusedMessage = String(error?.message ?? error);
            }

            // Reopened with *no* chain, to read what the refused attempt left behind.
            // Reopening with the healthy patch would apply it, which says nothing about
            // whether the refused attempt had.
            const reopened = await docStack.addStack({ name, documentKey: "0".repeat(64) });
            await reopened.authenticate({ username: "system", password: "system" });
            const first = await reopened.getClassModel("First").catch(() => null);
            // `getClassModel` resolves `undefined` for a class it does not find, so
            // "absent" is both of those and not just `null`.
            const second = await reopened.getClassModel("Second").catch(() => null);
            const ledger = (await (reopened as any).db.find({
                selector: { "~class": "patch", target: "app" }, limit: 20,
            })).docs.map((entry: any) => entry.version).sort();

            // And a `null` entry is ADR-0038's drop marker, not a malformed model: it has
            // to pass the check or no patch could ever remove an attribute. Applied here,
            // on a class this open creates first, so the drop has something to act on.
            await reopened.applyPatch({
                "~class": "patch", version: "1.0.0", target: "app", changelog: "a healthy class",
                docs: good.docs,
            } as any);
            await reopened.applyPatch({
                "~class": "patch", version: "1.2.0", target: "app", changelog: "drop title",
                docs: [{ _id: "First", "~class": "class", _rev: "auto", schema: { title: null } }],
            } as any);
            const afterDrop: any = await reopened.getClassModel("First");

            await docStack.removeStack(name, { destroy: true });
            return {
                refusedMessage,
                firstLanded: first !== null && first !== undefined,
                secondLanded: second !== null && second !== undefined,
                ledger,
                titleDropped: !("title" in (afterDrop?.schema ?? {})),
            };
        });

        expect(result.refusedMessage).toContain("Second.x");
        // Zero persisted: neither class, and no ledger entry for either patch.
        expect(result.secondLanded).toBe(false);
        expect(result.firstLanded).toBe(false);
        expect(result.ledger).toEqual([]);

        // The drop marker still works.
        expect(result.titleDropped).toBe(true);
    });

    it("refuses on the one-off applyPatch path too", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "attr-applypatch",
            username: "attr-user",
            password: "attr-pass",
            evaluate: async ({ stack }) => {
                let message: string | null = null;
                try {
                    await stack.applyPatch({
                        "~class": "patch", version: "9.0.0", target: "app", changelog: "broken",
                        docs: [{
                            _id: "Direct", "~class": "class", active: true, name: "Direct",
                            description: "d",
                            schema: { x: { name: "x", type: "enum", config: { values: [] } } },
                        }],
                    } as any);
                } catch (error: any) {
                    message = String(error?.message ?? error);
                }
                const landed = await stack.getClassModel("Direct").catch(() => null);
                return { message, landed: landed !== null && landed !== undefined };
            },
        });

        expect(result.message).toContain("Direct.x");
        expect(result.message).toContain("non-empty 'values' array");
        expect(result.landed).toBe(false);
    });
});
