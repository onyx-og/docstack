import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("date attribute validation", () => {
    it("accepts an ISO-8601 instant and round-trips it through a document", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "date-roundtrip",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const dateClass = await Class.create(stack, "Appointment", "class", "Appointment", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                    startsAt: { name: "startsAt", type: "date", config: { mandatory: true } },
                    day: { name: "day", type: "date", config: { format: "date" } },
                });

                const instant = new Date("2026-11-15T14:10:03.567Z").toISOString();
                const written = await dateClass.addCard({ title: "Review", startsAt: instant, day: "2026-11-15" });
                const read = await stack.getDocument(written._id);

                return {
                    // A Date object is not the stored shape: a body round-trips through
                    // JSON, so the engine validates and stores the ISO string.
                    acceptsInstant: await dateClass.validate({ title: "x", startsAt: instant }),
                    rejectsLooseText: await dateClass.validate({ title: "x", startsAt: "15/11/2026" }),
                    rejectsOffset: await dateClass.validate({ title: "x", startsAt: "2026-11-15T14:10:03+02:00" }),
                    acceptsDateOnly: await dateClass.validate({ title: "x", startsAt: instant, day: "2026-11-15" }),
                    rejectsInstantAsDateOnly: await dateClass.validate({ title: "x", startsAt: instant, day: instant }),
                    storedStartsAt: (read as any)?.startsAt,
                    // What a read gives back is the string, which is why `z.date()` could
                    // not be the validator: it would reject the document's own value.
                    storedType: typeof (read as any)?.startsAt,
                };
            },
        });

        expect(result.acceptsInstant).toBe(true);
        expect(result.rejectsLooseText).toBe(false);
        expect(result.rejectsOffset).toBe(false);
        expect(result.acceptsDateOnly).toBe(true);
        expect(result.rejectsInstantAsDateOnly).toBe(false);
        expect(result.storedStartsAt).toBe("2026-11-15T14:10:03.567Z");
        expect(result.storedType).toBe("string");
    });

    it("compares min and max as instants, not as text", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "date-bounds",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const bounded = await Class.create(stack, "Window", "class", "Window", {
                    at: {
                        name: "at",
                        type: "date",
                        config: {
                            mandatory: true,
                            min: "2026-01-01T00:00:00.000Z",
                            max: "2026-12-31T23:59:59.999Z",
                        },
                    },
                });
                return {
                    inside: await bounded.validate({ at: "2026-06-01T12:00:00.000Z" }),
                    beforeMin: await bounded.validate({ at: "2025-12-31T23:59:59.999Z" }),
                    afterMax: await bounded.validate({ at: "2027-01-01T00:00:00.000Z" }),
                };
            },
        });

        expect(result.inside).toBe(true);
        expect(result.beforeMin).toBe(false);
        expect(result.afterMax).toBe(false);
    });
});
