import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0022 finding 1.
 *
 * `DocStack.addStack` guards against opening the same database twice by checking
 * `getStack(name)` — and then awaits `ClientStack.create`. The check is not atomic across
 * that await: a second call for the same name lands while the first is still in flight,
 * sees nothing, and opens a second handle. Both then run `initdb` → `checkSystem` →
 * `applyPatches` against one database and collide writing `~sys-0.0.1`:
 *
 * ```
 * Error: {"status":409,"name":"conflict","message":"Document update conflict"}
 * ```
 *
 * React StrictMode guarantees the second call in development, but nothing about this is
 * React-specific — any two concurrent callers do it.
 */
describe("concurrent addStack", () => {
    it("ADR-0022: opening the same stack twice at once yields one stack, not a conflict", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "concurrent-host",
            evaluate: async ({ docStack }) => {
                const name = "concurrent-target";

                // Deliberately not awaited in sequence: this is the StrictMode shape.
                const settled = await Promise.allSettled([
                    docStack.addStack({ name }),
                    docStack.addStack({ name }),
                ]);

                const rejections = settled
                    .filter(r => r.status === "rejected")
                    .map((r: any) => {
                        const e = r.reason;
                        return e?.message ?? e?.name ?? String(e);
                    });

                const opened = settled
                    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
                    .map(r => r.value);

                return {
                    rejections,
                    // Both calls must answer with the same live stack...
                    sameInstance: opened.length === 2 ? opened[0] === opened[1] : false,
                    // ...and the instance must hold exactly one entry for that name.
                    registered: docStack.getStacks().filter((s: any) => s.name === name).length,
                    resolvable: docStack.getStack(name)?.name ?? null,
                };
            },
        });

        // The finding: today one of these rejects with a 409 on `~sys-0.0.1`.
        expect(result.rejections).toEqual([]);
        expect(result.sameInstance).toBe(true);
        expect(result.registered).toBe(1);
        expect(result.resolvable).toBe("concurrent-target");
    });
});
