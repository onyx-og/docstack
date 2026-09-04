import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The patch chain protocol - ADR-0042.
 *
 * Every consumer patch chain - class models, data documents, mixed - stages
 * through one internal transaction: patch N+1 hydrates against the classes patch
 * N staged, data docs are judged by staged models, propagation is validated dry
 * with nothing kept, and a single commit lands every staged doc as one batch
 * through the unchanged pipeline. The ledger (ADR-0041) arms only after that
 * commit.
 */
describe("patch chain", () => {
    it("a chain composes through the overlay and lands in one commit", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const stackName = `chain-compose-${Date.now()}`;
            const patches = [
                {
                    "~class": "patch", version: "1.0.0", target: "app", changelog: "class arrives",
                    docs: [{
                        _id: "ChainTask", "~class": "class", active: true, name: "ChainTask", description: "tasks",
                        schema: {
                            title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                            note: { name: "note", type: "string", config: {} },
                        },
                    }],
                },
                {
                    "~class": "patch", version: "1.1.0", target: "app", changelog: "extra arrives",
                    docs: [{
                        _id: "ChainTask", "~class": "class", _rev: "auto",
                        schema: { extra: { name: "extra", type: "string", config: {} } },
                    }],
                },
            ];

            const docStack = new DocStack({ name: stackName, patches });
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });
            const stack = docStack.getStack(stackName)!;

            const classDoc: any = await stack.db.get("ChainTask");
            const ledger = (await (stack as any).db.find({
                selector: { "~class": "patch", target: "app" }, limit: 100,
            })).docs;

            stack.close();
            await stack.db.destroy();
            return {
                attributes: Object.keys(classDoc.schema ?? {}).sort(),
                // The chain's signature: two patches, ONE write - the merge composed
                // in the overlay, so the class doc's first stored revision carries
                // the full chain.
                revGeneration: String(classDoc._rev).split("-")[0],
                ledger: ledger.map((entry: any) => `${entry.version}:${entry.active}`).sort(),
            };
        });

        expect(result.attributes).toEqual(["extra", "note", "title"]);
        expect(result.revGeneration).toBe("1");
        // Both entries armed, only after the one commit.
        expect(result.ledger).toEqual(["1.0.0:true", "1.1.0:true"]);
    });

    it("a dry-run refusal names the patch, persists nothing, records nothing", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `chain-refuse-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            // Committed world: a class and a document that lacks the optional `nick`.
            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "ChainTight", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                nick: { name: "nick", type: "string", config: {} },
            });
            const card = await cls.addCard({ title: "one" });
            const classId = cls.getId();
            const cardRevBefore = (await first.db.get(card._id))._rev;
            first.close();

            // The chain carries a patch the committed data cannot satisfy.
            const tighten = {
                "~class": "patch", version: "7.0.0", target: "app", changelog: "tighten nick",
                docs: [{
                    _id: classId, "~class": "class", _rev: "auto",
                    schema: { nick: { name: "nick", type: "string", config: { mandatory: true } } },
                }],
            };
            let failure: string | null = null;
            try {
                await ClientStack.create(conn, { name, documentKey: KEY, patches: [tighten], credentials });
            } catch (error: any) {
                failure = error?.message ?? String(error);
            }

            // A clean reopen shows what the refusal left behind: everything.
            const third = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const model: any = await third.db.get(classId);
            const cardAfter: any = await third.db.get(card._id);
            const ledger = (await (third as any).db.find({
                selector: { "~class": "patch", version: "7.0.0" }, limit: 10,
            })).docs;
            third.close();
            await third.db.destroy();

            return {
                failure,
                stillOptional: model.schema?.nick?.config?.mandatory !== true,
                cardUntouched: cardAfter._rev === cardRevBefore,
                recorded: ledger.length,
            };
        });

        // The fault taxonomy's staging/dry-run class: named patch, named class.
        expect(result.failure).toContain("7.0.0");
        expect(result.failure).toContain("ChainTight");
        // Zero persisted, nothing recorded - the chain retries on the next open.
        expect(result.stillOptional).toBe(true);
        expect(result.cardUntouched).toBe(true);
        expect(result.recorded).toBe(0);
    });

    it("mixed: a later patch's bad seed refuses the whole chain, earlier patches included", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack } = (window as any).docstack;
            const name = `chain-mixed-refuse-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            first.close();

            // Patch 1 is entirely valid; patch 2's seed misses a mandatory
            // attribute of the class patch 1 staged. Under the retired sequential
            // path patch 1 would have committed and armed on its own - the chain
            // answers "what if a patch requires things applied by a prior patch
            // that failed?" with: neither of them is real.
            const patches = [
                {
                    "~class": "patch", version: "6.0.0", target: "app", changelog: "class + good seed",
                    docs: [
                        {
                            _id: "MixedRef", "~class": "class", active: true, name: "MixedRef", description: "x",
                            schema: { title: { name: "title", type: "string", config: { mandatory: true } } },
                        },
                        { _id: "MixedRef-good", "~class": "MixedRef", title: "fine", active: true },
                    ],
                },
                {
                    "~class": "patch", version: "6.1.0", target: "app", changelog: "bad seed",
                    docs: [{ _id: "MixedRef-bad", "~class": "MixedRef", active: true }], // no title
                },
            ];
            let failure: string | null = null;
            try {
                await ClientStack.create(conn, { name, documentKey: KEY, patches, credentials });
            } catch (error: any) {
                failure = error?.message ?? String(error);
            }

            const third = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const classDoc = await third.db.get("MixedRef").catch(() => null);
            const goodSeed = await third.db.get("MixedRef-good").catch(() => null);
            const ledger = (await (third as any).db.find({
                selector: { "~class": "patch", target: "app" }, limit: 100,
            })).docs;
            third.close();
            await third.db.destroy();

            return {
                failure,
                classLanded: classDoc !== null,
                goodSeedLanded: goodSeed !== null,
                recorded: ledger.length,
            };
        });

        expect(result.failure).toContain("6.1.0");
        // Patch 1's class and seed do not outlive patch 2's refusal: one chain,
        // one commit, or nothing - and nothing armed, so the whole chain retries.
        expect(result.classLanded).toBe(false);
        expect(result.goodSeedLanded).toBe(false);
        expect(result.recorded).toBe(0);
    });

    it("mixed: the staged model judges the chain's own docs, and a batch-mate update supersedes propagation", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `chain-mixed-tighten-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            // Committed world: one document lacking the soon-mandatory `nick`.
            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "MixedTight", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                nick: { name: "nick", type: "string", config: {} },
            });
            const card = await cls.addCard({ title: "one" });
            const classId = cls.getId();
            first.close();

            // The manual massage a data doc can now carry: the tighten and the
            // `_rev: "auto"` update that satisfies it ride one patch. The dry-run
            // must judge the committed card as its staged version (else it refuses
            // the tighten), commit-time propagation must delegate to the batch-mate
            // (else it re-judges the pre-massage card), and the fresh seed must be
            // judged by the STAGED tightened model.
            const patch = {
                "~class": "patch", version: "6.2.0", target: "app", changelog: "tighten + massage + seed",
                docs: [
                    {
                        _id: classId, "~class": "class", _rev: "auto",
                        schema: { nick: { name: "nick", type: "string", config: { mandatory: true } } },
                    },
                    { _id: card._id, "~class": "MixedTight", _rev: "auto", nick: "massaged" },
                    { _id: "MixedTight-new", "~class": "MixedTight", title: "two", nick: "born-valid", active: true },
                ],
            };
            const second = await ClientStack.create(conn, { name, documentKey: KEY, patches: [patch], credentials });

            const model: any = await second.db.get(classId);
            const massaged: any = await second.db.get(card._id);
            const seeded: any = await second.db.get("MixedTight-new");
            const ledger = (await (second as any).db.find({
                selector: { "~class": "patch", version: "6.2.0" }, limit: 10,
            })).docs;
            second.close();
            await second.db.destroy();

            return {
                mandatory: model.schema?.nick?.config?.mandatory === true,
                massagedNick: massaged?.nick,
                massagedTitle: massaged?.title,
                massagedRevGeneration: String(massaged?._rev).split("-")[0],
                seededNick: seeded?.nick,
                armed: ledger.length === 1 && ledger[0].active === true,
            };
        });

        expect(result.mandatory).toBe(true);
        expect(result.massagedNick).toBe("massaged");
        // The `_rev: "auto"` hydration merges onto the stored document - the
        // update patch states only what changes, `title` survives.
        expect(result.massagedTitle).toBe("one");
        // One write over the committed revision: propagation did not double-stamp
        // the massaged card after the batch already carried it.
        expect(result.massagedRevGeneration).toBe("2");
        expect(result.seededNick).toBe("born-valid");
        expect(result.armed).toBe(true);
    });
});
