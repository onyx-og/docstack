import { test as it, expect } from './fixtures';
import {
    TARGET_CLASS, TARGET_ID, classModels, modsAccepted, modsBase, modsDefaultsOnRead,
    modsTypeRejects, rowAccepted, rowRefinedOnly, rowTypeRejects,
} from './model-agreement/fixtures.js';

const describe = it.describe;

/**
 * `proposal.md` §11: *the Zod schema built at runtime from `toClassModel()` and the static
 * type agree on a shared fixture set for every attribute type and modifier combination.*
 *
 * The shared half is `./model-agreement/fixtures.ts`: one set of declarations and one set
 * of values, read from both sides. That module's `@ts-expect-error` directives are the
 * static assertions - an unused one fails the compile, so a type that quietly started
 * admitting a bad value is caught there - and `../types/model-inference.types.ts` asserts
 * the inferred shapes from the same declarations. This file is the other reader: it builds
 * the class from `toClassModel()` in a real stack and asks Zod the same questions.
 *
 * Why both: `attributeSpecToZod` lives in `@docstack/shared` precisely so one definition
 * answers the validator and the static inference (`proposal.md` §5). Nothing checked that
 * the two *conclusions* matched, only that they came from the same file.
 */
describe("the runtime validator and the static type", () => {
    it("agree on every attribute type and every modifier combination", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async (fixtures) => {
            const { DocStack, Class } = (window as any).docstack;
            const name = `model-agreement-${Date.now()}`;
            const instance = new DocStack({ name, documentKey: "0".repeat(64) });
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 20000);
                instance.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });
            const stack = instance.getStack(name)!;
            await stack.authenticate({ username: "system", password: "system" });

            // `foreign_key` is the one validator that needs a live stack: it resolves
            // every id through `stack.db.get`. So one target document really exists, and
            // `MISSING_TARGET_ID` really does not.
            await Class.create(stack, fixtures.TARGET_CLASS, "class", "Targets", {
                title: { name: "title", type: "string", config: { mandatory: true } },
            });
            const targetModel: any = await stack.getClassModel(fixtures.TARGET_CLASS);
            await stack.createDoc(fixtures.TARGET_ID, fixtures.TARGET_CLASS, targetModel.schema, {
                _id: fixtures.TARGET_ID, "~class": fixtures.TARGET_CLASS, title: "present", active: true,
            } as any);

            // The Zod under test: built by the engine from the very document
            // `toClassModel()` emitted, with nothing restated in between.
            const row = await Class.buildFromModel(stack, fixtures.classModels.Row, { subscribe: false });
            const mods = await Class.buildFromModel(stack, fixtures.classModels.Mods, { subscribe: false });

            const verdicts = async (built: any, cases: { name: string; value: unknown }[]) => {
                const out: { name: string; accepted: boolean }[] = [];
                for (const entry of cases) {
                    out.push({ name: entry.name, accepted: await built.validate(entry.value) });
                }
                return out;
            };

            // Collected before the stack is closed: the `foreign_key` refinement reads
            // through the open database, so a verdict taken after `destroy` fails for the
            // wrong reason.
            const collected = {
                rowAccepted: await verdicts(row, fixtures.rowAccepted),
                rowTypeRejects: await verdicts(row, fixtures.rowTypeRejects),
                rowRefinedOnly: await verdicts(row, fixtures.rowRefinedOnly),
                modsAccepted: await verdicts(mods, fixtures.modsAccepted),
                modsTypeRejects: await verdicts(mods, fixtures.modsTypeRejects),
            };

            // Default filling is a claim about a *read*, so it needs a real write rather
            // than a parse: the engine writes a declared default on create.
            const written = await mods.addCard(fixtures.modsBase);
            const stored: any = (await mods.getCards()).find((doc: any) => doc._id === written._id);

            stack.close();
            await (stack as any).db.destroy();

            return {
                ...collected,
                storedDefaults: {
                    withDefault: stored?.withDefault,
                    mandatoryWithDefault: stored?.mandatoryWithDefault,
                    absent: fixtures.modsDefaultsOnRead.absent.filter((key: string) => !(key in (stored ?? {}))),
                },
                // The attributes the declaration asked for, as the engine holds them.
                rowSchemaKeys: Object.keys(fixtures.classModels.Row.schema).sort(),
                modsSchemaKeys: Object.keys(fixtures.classModels.Mods.schema).sort(),
            };
        }, {
            TARGET_CLASS, TARGET_ID, classModels, modsBase, modsDefaultsOnRead,
            rowAccepted, rowTypeRejects, rowRefinedOnly, modsAccepted, modsTypeRejects,
        });

        // Every declared type and every modifier combination is in the fixture, so a new
        // one added to `a` without a fixture shows up here rather than nowhere.
        expect(result.rowSchemaKeys).toEqual([
            "blob", "day", "flag", "fraction", "link", "owner", "priority", "text", "when", "whole",
        ]);
        expect(result.modsSchemaKeys).toEqual([
            "arrayWithDefault", "loose", "mandatoryWithDefault", "maybeTags",
            "optionalArrayWithDefault", "required", "tags", "withDefault",
        ]);

        // Where the type admits a value, the validator accepts it.
        for (const verdict of [...result.rowAccepted, ...result.modsAccepted]) {
            expect(verdict.accepted, `accepted: ${verdict.name}`).toBe(true);
        }

        // Where the type refuses one - which `fixtures.ts` asserts with a
        // `@ts-expect-error` per case - the validator rejects it. This is the agreement:
        // the two sides reach the same verdict on the same values.
        for (const verdict of [...result.rowTypeRejects, ...result.modsTypeRejects]) {
            expect(verdict.accepted, `type rejects, so Zod must too: ${verdict.name}`).toBe(false);
        }

        // And the asymmetry, stated: these are values the type cannot refuse, because
        // TypeScript has no way to say "at most 8 characters", "a whole number", "two
        // decimal places", "an ISO-8601 instant" or "a document that exists". The
        // validator refuses them, which is why the constraint is worth declaring.
        for (const verdict of result.rowRefinedOnly) {
            expect(verdict.accepted, `a refinement the type cannot express: ${verdict.name}`).toBe(false);
        }
        // Not vacuous: there is something in that set for each kind of refinement.
        expect(result.rowRefinedOnly.length).toBe(9);

        // The read side of the modifier rows. A defaulted attribute is present on a read
        // because the engine writes the default on create...
        expect(result.storedDefaults.withDefault).toBe(modsDefaultsOnRead.withDefault);
        expect(result.storedDefaults.mandatoryWithDefault).toBe(modsDefaultsOnRead.mandatoryWithDefault);
        // ...and an optional array with a default is absent, because the default applies
        // to the members and nothing ever filled the array. Which is what
        // `_optionalArrayWithDefaultIsNotFilled` asserts of `InferDoc`.
        expect(result.storedDefaults.absent).toEqual([...modsDefaultsOnRead.absent]);
    });
});
