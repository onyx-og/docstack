import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * A failed write rejects, rather than hanging forever.
 *
 * Four methods were written as `new Promise(async (resolve, reject) => ...)`. A rejection
 * from an awaited call inside an async executor is not forwarded to `reject`, so the
 * promise never settled: the caller's `await` hung, and the error escaped as an unhandled
 * rejection that took the page down with it. `Class.updateCard`, `Class.addOrUpdateCard`,
 * `Class.build` and `Domain.build` all had it.
 *
 * Every test here is written against the hang, not against the message: each call is
 * raced with a timeout, so a regression fails as "hung" instead of hanging the suite. A
 * test that only asserted the error text would pass on a promise that never settles only
 * because the runner gave up - which is exactly how this survived.
 */
describe("a failed write rejects rather than hanging", () => {
    it("two concurrent updates to one document: one lands, one is refused", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "reject-conflict",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const noteClass = await Class.create(stack, "RejectNote", "class", "Notes", {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                });
                const created = await noteClass.addCard({ title: "first" });

                // Both read the same revision before either writes, so the second write
                // conflicts. `createDoc` refuses it (ADR-0023) and the refusal has to
                // reach the caller.
                const settled = await Promise.race([
                    Promise.allSettled([
                        noteClass.updateCard(created._id, { title: "A" }),
                        noteClass.updateCard(created._id, { title: "B" }),
                    ]),
                    new Promise(resolve => setTimeout(() => resolve("hung"), 4000)),
                ]);
                if (settled === "hung") return { outcome: "hung" };

                const outcomes = (settled as PromiseSettledResult<any>[]).map(entry =>
                    entry.status === "rejected"
                        ? `rejected:${String((entry.reason as any)?.name ?? (entry.reason as any)?.message)}`
                        : `fulfilled:${(entry.value as any)?.title}`);
                const stored = await noteClass.get(created._id);
                return { outcome: "settled", outcomes: outcomes.sort(), storedTitle: stored.title };
            },
        });

        expect(result.outcome).toBe("settled");
        // One write landed and one was refused by name. Which one wins is the database's
        // business; that the loser hears about it is not.
        expect(result.outcomes).toHaveLength(2);
        expect(result.outcomes!.filter(o => o.startsWith("rejected:conflict"))).toHaveLength(1);
        expect(result.outcomes!.filter(o => o.startsWith("fulfilled:"))).toHaveLength(1);
        expect(["A", "B"]).toContain(result.storedTitle);
    });

    it("addOrUpdateCard passes a conflict on, and still refuses a duplicate key", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "reject-addorupdate",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const noteClass = await Class.create(stack, "RejectUpsert", "class", "Notes", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const created = await noteClass.addCard({ title: "first" });

                const race = async <T>(work: Promise<T>) => {
                    const outcome = await Promise.race([
                        work.then(value => ({ kind: "resolved", value })).catch(
                            (error: any) => ({ kind: "rejected", value: String(error?.message ?? error) })),
                        new Promise(resolve => setTimeout(() => resolve({ kind: "hung" }), 4000)),
                    ]);
                    return outcome as { kind: string; value?: any };
                };

                // A conflict reached through the upsert path, which awaited `updateCard`
                // and therefore inherited the same hang.
                const conflicting = await race(Promise.all([
                    noteClass.addOrUpdateCard({ title: "A" }, created._id),
                    noteClass.addOrUpdateCard({ title: "B" }, created._id),
                ]));

                // And the branch that always did reject correctly, which must still. On a
                // key of its own: the conflicting writes above renamed `first`, so a
                // duplicate check against that title would find nothing and pass for the
                // wrong reason.
                await noteClass.addCard({ title: "taken" });
                const duplicate = await race(noteClass.addOrUpdateCard({ title: "taken" }));

                return {
                    conflicting: conflicting.kind,
                    conflictingMessage: conflicting.kind === "rejected" ? conflicting.value : null,
                    duplicate: duplicate.kind,
                    duplicateMessage: duplicate.kind === "rejected" ? duplicate.value : null,
                };
            },
        });

        expect(result.conflicting).toBe("rejected");
        expect(String(result.conflictingMessage).toLowerCase()).toContain("conflict");
        expect(result.duplicate).toBe("rejected");
        expect(result.duplicateMessage).toContain("Duplicate card by keys");
    });

    it("Class.build and Domain.build reject when the stack refuses what they write", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "reject-build",
            evaluate: async ({ stack }) => {
                const { Class, Domain } = (window as any).docstack;

                const race = async (work: Promise<unknown>) => {
                    const outcome = await Promise.race([
                        work.then(() => "resolved").catch((error: any) =>
                            `rejected:${String(error?.message ?? error)}`),
                        new Promise(resolve => setTimeout(() => resolve("hung"), 4000)),
                    ]);
                    return String(outcome);
                };

                // `addClass` throws when the class's own originator is not in the stack,
                // which is the reachable failure on this path.
                const orphan = new Class();
                orphan.init(stack, null, "RejectOrphan", "no-such-originator", "Orphan", {});
                const classOutcome = await race(orphan.build());

                // `addDomain` ignores the domain's own originator - it writes with a
                // hardcoded one - so the refusal has to come from the model itself. Its
                // `relation` is an enum, and a value outside it fails validation inside
                // the write, which is what `build` has to pass on. The two endpoint
                // classes have to be real, because `Domain.init` reads their ids.
                const left = await Class.create(stack, "RejectLeft", "class", "Left", {
                    name: { name: "name", type: "string", config: { mandatory: true } },
                });
                const right = await Class.create(stack, "RejectRight", "class", "Right", {
                    name: { name: "name", type: "string", config: { mandatory: true } },
                });
                const domain = new Domain();
                domain.init(stack, null, "RejectDomain", "domain", "7:X" as any, left, right, "Orphan");
                const domainOutcome = await race(domain.build());

                return { classOutcome, domainOutcome };
            },
        });

        // The point is the prefix, not the text: neither may be "hung".
        expect(result.classOutcome).not.toBe("hung");
        expect(result.classOutcome.startsWith("rejected:")).toBe(true);
        expect(result.domainOutcome).not.toBe("hung");
        expect(result.domainOutcome.startsWith("rejected:")).toBe(true);
    });
});
