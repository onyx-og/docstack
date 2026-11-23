import { test as it, expect } from './fixtures';
import baseline from './equivalence/baseline.js';
import generated from './equivalence/generated.js';
import handWritten from './equivalence/hand-written.js';
import handWrittenNoId from './equivalence/hand-written-no-id.js';

const describe = it.describe;

// Four stacks per test, each opened twice with a real patch chain and a propagation
// sweep in between.
it.setTimeout(180_000);

/**
 * `proposal.md` §11: *a generated patch adding an attribute behaves identically to a
 * hand-written ADR-0038 delta patch, including on a locked stack with deferral and
 * replay.*
 *
 * The claim the generator rests on, and the one acceptance criterion that had no test
 * behind it: `revision --autogenerate` output had never been run through a stack at all.
 * What the CLI's own suite checks is about the *file* - the merge marker is in it, only
 * the changed attribute is in it, it is deterministic. Whether the engine then does the
 * same thing with it as with a patch a person wrote was assumed.
 *
 * The patches under test are `./equivalence/generated.ts`, verbatim generator output, and
 * two hand-written forms of the same change: `./equivalence/hand-written.ts` in the shape
 * the patch guide documents, and `./equivalence/hand-written-no-id.ts` with the patch's
 * own `_id` left off, which is how the patches in this suite are written. They differ in
 * what they restate, in key order and in whether they name their own ledger document, and
 * the point is that none of it reaches behaviour. See `./equivalence/README.md` for how
 * the committed generator output is kept from going stale.
 *
 * Both chains are driven through the real upgrade path rather than a single open: the
 * baseline applies, a document is written under it, and the database is *reopened* with
 * the delta on top. That is what makes the propagation sweep run over existing data,
 * which is where a patch either does its job or does not.
 */
describe("a generated patch and a hand-written delta", () => {
    it("produce the same model, the same documents and the same ledger", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async ({ baseline, deltas }) => {
            const { DocStack, foldPatchChain, diffModel, defineClass, defineModel, a } = (window as any).docstack;
            const KEY = "0".repeat(64);

            /**
             * Opens a stack by name, with a chain.
             *
             * A new `DocStack` per open rather than `addStack`: `addStack` is idempotent
             * on the name and would hand back the instance already holding the shorter
             * chain, so the reopen - the whole point - would never happen.
             */
            const open = async (name: string, patches: any[], documentKey?: string) => {
                const instance = new DocStack({ name, patches, documentKey });
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 20000);
                    instance.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
                });
                const stack = instance.getStack(name);
                if (!stack) throw new Error(`Failed to resolve stack '${name}'`);
                return stack;
            };

            const run = async (label: string, delta: any) => {
                const name = `equiv-${label}-${Date.now()}`;

                // Open 1: the baseline chain, and one document written under it - a
                // `Vault` with a title and no body, because the baseline has no body.
                const first = await open(name, [baseline], KEY);
                await first.authenticate({ username: "system", password: "system" });
                const seeded: any = await (await first.getClass("Vault"))!.addCard({ title: "alpha" });
                first.close();

                // Open 2: the same database, with the delta on top. The already-applied
                // baseline is filtered out by the ledger, so the only thing that runs is
                // the patch under test - over the document open 1 left behind.
                const second = await open(name, [baseline, delta], KEY);
                await second.authenticate({ username: "system", password: "system" });

                const stored: any = await second.getClassModel("Vault");
                const vault = (await second.getClass("Vault"))!;
                const propagated: any = (await vault.getCards()).find((doc: any) => doc.title === "alpha");
                // The replication handle reads verbatim; `db.get` decrypts (ADR-0032).
                const atRest: any = await second.getReplicationHandle().get(seeded._id);

                // A write under the new schema, and one the new schema must refuse.
                const written: any = await vault.addCard({ title: "beta", body: "classified" });
                const readBack: any = (await vault.getCards()).find((doc: any) => doc.title === "beta");
                let refusal: string | null = null;
                try {
                    await vault.addCard({ title: "gamma", body: 42 });
                } catch (error: any) {
                    // The message quotes the document it rejected, so it carries that
                    // write's allocated id and timestamps. Those are per-write by
                    // definition; the schema it quotes beside them is the part the two
                    // chains have to agree on, so only the per-write parts are masked.
                    refusal = String(error?.message ?? error)
                        .replace(/Vault-[0-9a-f]+/g, "Vault-<id>")
                        .replace(/\b\d{13}\b/g, "<timestamp>");
                }

                const ledger = (await (second as any).db.find({
                    selector: { "~class": "patch", version: "1.1.0" }, limit: 10,
                })).docs;

                // What `revision --check` believes this chain produces, computed by the
                // same fold the CLI uses - here against the model the engine really
                // stored. If these disagree, `--check` passes on a lie.
                const folded: any = foldPatchChain([baseline, delta]).classes.Vault;

                second.close();
                await (second as any).db.destroy();

                return {
                    schema: stored?.schema,
                    className: stored?.name,
                    description: stored?.description,
                    active: stored?.active,
                    // The propagated value, as read and as stored.
                    propagatedBody: propagated?.body,
                    propagatedAtRestSealed: atRest?.body?.__enc === true,
                    propagatedAtRestLeak: JSON.stringify(atRest).includes("redacted"),
                    // The fresh write, as returned and as read back. The returned shape
                    // is flattened to a word, because what matters here is that the two
                    // chains return the *same* shape, not which one it is.
                    writtenBodyShape: typeof written?.body,
                    readBackBody: readBack?.body,
                    refusal,
                    ledger: ledger.map((doc: any) => ({
                        version: doc.version, target: doc.target, active: doc.active,
                    })),
                    ledgerIds: ledger.map((doc: any) => doc._id),
                    foldedSchema: folded?.schema,
                };
            };

            // The declaration in `./equivalence/model.ts`, restated: `defineClass` has to
            // run against the bundle under test, which this side cannot import from. The
            // restatement is self-checking - the diff it feeds is compared with the
            // committed generator output below, so a drifted copy fails here.
            const Vault = defineClass("Vault", {
                description: "Notes",
                attributes: {
                    title: a.string({ mandatory: true, primaryKey: true, maxLength: 120 }),
                    body: a.string({ encrypted: true, defaultValue: "redacted" }),
                },
            });
            const rederived = diffModel(foldPatchChain([baseline]), defineModel({ classes: [Vault] }));

            const runs: Record<string, any> = {};
            // Sequentially, not in parallel: each run opens its own database twice, and a
            // failure should name one chain rather than a race between three.
            for (const [label, delta] of Object.entries(deltas)) runs[label] = await run(label, delta);

            return { runs, rederivedDocs: rederived.docs, rederivedWarnings: rederived.warnings };
        }, { baseline, deltas: { generated, handWritten, handWrittenNoId } });

        const gen = result.runs.generated;

        // The committed generator output is still what this client's own `diffModel`
        // computes from the model and the baseline. Only the framing - `_id`, `target`,
        // `version`, `changelog` - is the CLI's; the documents are shared code.
        expect(result.rederivedWarnings).toEqual([]);
        expect(result.rederivedDocs).toEqual(generated.docs);

        // The schema the engine stored: the baseline's attribute survived the merge and
        // the delta's arrived. A patch that replaced instead of merging would have lost
        // `title` - the ADR-0037 failure the merge marker exists to prevent.
        expect(Object.keys(gen.schema ?? {}).sort()).toEqual(["body", "title"]);
        expect(gen.schema?.title?.config?.maxLength).toBe(120);
        expect(gen.schema?.body?.config?.encrypted).toBe(true);
        expect(gen.schema?.body?.config?.defaultValue).toBe("redacted");
        // And the class document itself is intact: a delta restating `name` must not
        // differ from one that omits it.
        expect(gen.className).toBe("Vault");
        expect(gen.description).toBe("Notes");
        expect(gen.active).toBe(true);

        // Propagation filled the document written before the attribute existed, with the
        // declared default, sealed at rest.
        expect(gen.propagatedBody).toBe("redacted");
        expect(gen.propagatedAtRestSealed).toBe(true);
        expect(gen.propagatedAtRestLeak).toBe(false);

        // The new schema is live for ordinary writes, and refuses what it should.
        expect(gen.readBackBody).toBe("classified");
        expect(gen.refusal).toBeTruthy();

        // The ledger armed one entry for the patch.
        expect(gen.ledger).toEqual([{ version: "1.1.0", target: "equivalence-app", active: true }]);

        // What `revision --check` compares against is what the engine actually holds.
        expect(gen.foldedSchema).toEqual(gen.schema);

        // And every one of those outcomes is the same for both hand-written forms. This
        // is the criterion itself: one assertion per observable, so a difference says
        // *which* observable differs rather than "the objects are not equal".
        for (const label of ["handWritten", "handWrittenNoId"]) {
            const other = result.runs[label];
            expect(other.schema, label).toEqual(gen.schema);
            expect(other.className, label).toBe(gen.className);
            expect(other.description, label).toBe(gen.description);
            expect(other.active, label).toBe(gen.active);
            expect(other.propagatedBody, label).toBe(gen.propagatedBody);
            expect(other.propagatedAtRestSealed, label).toBe(gen.propagatedAtRestSealed);
            expect(other.propagatedAtRestLeak, label).toBe(gen.propagatedAtRestLeak);
            expect(other.writtenBodyShape, label).toBe(gen.writtenBodyShape);
            expect(other.readBackBody, label).toBe(gen.readBackBody);
            expect(other.refusal, label).toBe(gen.refusal);
            expect(other.ledger, label).toEqual(gen.ledger);
            expect(other.foldedSchema, label).toEqual(gen.foldedSchema);
        }

        // The one thing that does differ, and only because the patch said so: a patch
        // carrying an `_id` names its own ledger document, one without is named by
        // PouchDB. The ledger is found by `~class`, `target` and `version`, so the
        // difference stays a naming one - which the row above has just proved.
        expect(gen.ledgerIds).toEqual(["equivalence-app-1.1.0"]);
        expect(result.runs.handWritten.ledgerIds).toEqual(["equivalence-app-1.1.0"]);
        expect(result.runs.handWrittenNoId.ledgerIds[0]).not.toBe("equivalence-app-1.1.0");
    });

    it("defer and replay the same way on a locked stack", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async ({ baseline, deltas }) => {
            const { DocStack } = (window as any).docstack;
            const KEY = "0".repeat(64);

            const open = async (name: string, patches: any[], documentKey?: string) => {
                const instance = new DocStack({ name, patches, documentKey });
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 20000);
                    instance.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
                });
                const stack = instance.getStack(name);
                if (!stack) throw new Error(`Failed to resolve stack '${name}'`);
                return stack;
            };

            const run = async (label: string, delta: any) => {
                const name = `equiv-locked-${label}-${Date.now()}`;

                // Open 1, keyed: the baseline and one document under it.
                const first = await open(name, [baseline], KEY);
                await first.authenticate({ username: "system", password: "system" });
                const seeded: any = await (await first.getClass("Vault"))!.addCard({ title: "alpha" });
                first.close();

                // Open 2, with no document key. The delta adds an `encrypted` attribute
                // to a class that already has documents, so its propagation would have
                // to seal a value this device cannot seal. ADR-0041: the patch defers and
                // the open succeeds, rather than the application failing to start.
                const second = await open(name, [baseline, delta], undefined);
                const lockedModel: any = await second.getClassModel("Vault");
                const lockedLedger = (await (second as any).db.find({
                    selector: { "~class": "patch", version: "1.1.0" }, limit: 10,
                })).docs;
                const lockedAtRest: any = await second.getReplicationHandle().get(seeded._id);

                // The key arrives: the deferred patch replays, its propagation runs, and
                // the ledger entry arms in place.
                await second.unlock(KEY);
                await second.authenticate({ username: "system", password: "system" });
                const unlockedModel: any = await second.getClassModel("Vault");
                const unlockedLedger = (await (second as any).db.find({
                    selector: { "~class": "patch", version: "1.1.0" }, limit: 10,
                })).docs;
                const replayedAtRest: any = await second.getReplicationHandle().get(seeded._id);
                const replayed: any = (await (await second.getClass("Vault"))!.getCards())
                    .find((doc: any) => doc.title === "alpha");

                second.close();
                await (second as any).db.destroy();

                return {
                    lockedSchemaKeys: Object.keys(lockedModel?.schema ?? {}).sort(),
                    dormantEntry: lockedLedger.length === 1 && lockedLedger[0].active === false,
                    lockedBodyAbsent: !("body" in (lockedAtRest ?? {})),
                    unlockedSchemaKeys: Object.keys(unlockedModel?.schema ?? {}).sort(),
                    armedEntries: unlockedLedger.map((doc: any) => doc.active),
                    replayedBody: replayed?.body,
                    replayedAtRestSealed: replayedAtRest?.body?.__enc === true,
                    replayedAtRestLeak: JSON.stringify(replayedAtRest).includes("redacted"),
                };
            };

            const runs: Record<string, any> = {};
            for (const [label, delta] of Object.entries(deltas)) runs[label] = await run(label, delta);
            return { runs };
        }, { baseline, deltas: { generated, handWritten, handWrittenNoId } });

        const gen = result.runs.generated;

        // While locked: the schema change is held back, not applied, and the document is
        // untouched - no half-propagated attribute.
        expect(gen.lockedSchemaKeys).toEqual(["title"]);
        expect(gen.lockedBodyAbsent).toBe(true);
        // The deferral is persisted as a dormant ledger entry, which is what keeps the
        // device honest at the sync gate (ADR-0041, ADR-0040).
        expect(gen.dormantEntry).toBe(true);

        // After unlock: the patch replayed, the attribute propagated with its default,
        // sealed at rest, and the same entry armed rather than a second being written.
        expect(gen.unlockedSchemaKeys).toEqual(["body", "title"]);
        expect(gen.armedEntries).toEqual([true]);
        expect(gen.replayedBody).toBe("redacted");
        expect(gen.replayedAtRestSealed).toBe(true);
        expect(gen.replayedAtRestLeak).toBe(false);

        // And a hand-written delta does all of it identically, in either form. This is
        // `proposal.md` §6.3's requirement: one generated patch with an encrypted
        // attribute, through the locked -> unlock -> replay path.
        for (const label of ["handWritten", "handWrittenNoId"]) {
            const other = result.runs[label];
            expect(other.lockedSchemaKeys, label).toEqual(gen.lockedSchemaKeys);
            expect(other.lockedBodyAbsent, label).toBe(gen.lockedBodyAbsent);
            expect(other.dormantEntry, label).toBe(gen.dormantEntry);
            expect(other.unlockedSchemaKeys, label).toEqual(gen.unlockedSchemaKeys);
            expect(other.armedEntries, label).toEqual(gen.armedEntries);
            expect(other.replayedBody, label).toBe(gen.replayedBody);
            expect(other.replayedAtRestSealed, label).toBe(gen.replayedAtRestSealed);
            expect(other.replayedAtRestLeak, label).toBe(gen.replayedAtRestLeak);
        }
    });
});
