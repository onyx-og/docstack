import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * One-shot jobs in patches - ADR-0044.
 *
 * `preApply` massages data through the chain transaction's facade (staged: massage
 * and model land in one commit, or nothing does); `postApply` backfills in a second
 * staged transaction after the models land; the ledger arms only after both. Run
 * receipts write directly, win or lose. Undeclared jobs defer while locked;
 * `requiresKey: false` opts into locked execution behind two runtime nets.
 */
describe("patch jobs", () => {
    it("preApply massages the data so the tightened model can land - in one commit", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `pj-tighten-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "JobTight", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                nick: { name: "nick", type: "string", config: {} },
            });
            await cls.addCard({ title: "one" });
            await cls.addCard({ title: "two" });
            const classId = cls.getId();
            first.close();

            const patch = {
                "~class": "patch", version: "8.0.0", target: "app", changelog: "tighten nick",
                preApply: {
                    name: "backfill-nick",
                    params: { suffix: "-n" },
                    content: `function execute(stack, params, job) {
                        return (async () => {
                            const found = await stack.findDocuments({ "~class": { $eq: "JobTight" } });
                            for (const doc of found.docs) {
                                if (!doc.nick) await stack.db.put({ ...doc, nick: doc.title + params.suffix });
                            }
                        })();
                    }`,
                },
                docs: [{
                    _id: classId, "~class": "class", _rev: "auto",
                    schema: { nick: { name: "nick", type: "string", config: { mandatory: true } } },
                }],
            };
            const second = await ClientStack.create(conn, { name, documentKey: KEY, patches: [patch], credentials });

            const model: any = await second.db.get(classId);
            const docs = (await second.findDocuments({ "~class": { $eq: "JobTight" } })).docs;
            const ledger = (await (second as any).db.find({
                selector: { "~class": "patch", version: "8.0.0" }, limit: 10,
            })).docs;
            const receipts = (await (second as any).db.find({
                selector: { "~class": "~JobRun", "runtimeArgs.patchVersion": "8.0.0", "runtimeArgs.phase": "pre" }, limit: 10,
            })).docs;
            second.close();
            await second.db.destroy();

            return {
                mandatory: model.schema?.nick?.config?.mandatory === true,
                nicks: docs.map((d: any) => d.nick).sort(),
                armed: ledger.length === 1 && ledger[0].active === true,
                receipt: receipts.map((r: any) => r.status),
            };
        });

        // The ADR-0042 dead end, made actionable: the same patch that was refused
        // without the massage now lands, model and massaged data in one commit.
        expect(result.mandatory).toBe(true);
        expect(result.nicks).toEqual(["one-n", "two-n"]);
        expect(result.armed).toBe(true);
        expect(result.receipt).toEqual(["SUCCESS"]);
    });

    it("postApply backfills after the model lands, and the ledger arms only after", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `pj-backfill-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "JobSlug", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
            });
            await cls.addCard({ title: "Hello World" });
            const classId = cls.getId();
            first.close();

            const patch = {
                "~class": "patch", version: "8.1.0", target: "app", changelog: "slug arrives, backfilled",
                postApply: {
                    name: "fill-slug",
                    content: `function execute(stack, params, job) {
                        return (async () => {
                            const found = await stack.findDocuments({ "~class": { $eq: "JobSlug" } });
                            for (const doc of found.docs) {
                                await stack.db.put({ ...doc, slug: doc.title.toLowerCase().replace(/\\s+/g, "-") });
                            }
                        })();
                    }`,
                },
                docs: [{
                    _id: classId, "~class": "class", _rev: "auto",
                    schema: { slug: { name: "slug", type: "string", config: {} } },
                }],
            };
            const second = await ClientStack.create(conn, { name, documentKey: KEY, patches: [patch], credentials });

            const docs = (await second.findDocuments({ "~class": { $eq: "JobSlug" } })).docs;
            const ledger = (await (second as any).db.find({
                selector: { "~class": "patch", version: "8.1.0" }, limit: 10,
            })).docs;
            const receipts = (await (second as any).db.find({
                selector: { "~class": "~JobRun", "runtimeArgs.patchVersion": "8.1.0", "runtimeArgs.phase": "post" }, limit: 10,
            })).docs;
            second.close();
            await second.db.destroy();

            return {
                slugs: docs.map((d: any) => d.slug),
                armed: ledger.length === 1 && ledger[0].active === true,
                receipt: receipts.map((r: any) => r.status),
            };
        });

        expect(result.slugs).toEqual(["hello-world"]);
        expect(result.armed).toBe(true);
        expect(result.receipt).toEqual(["SUCCESS"]);
    });

    it("a failing preApply persists nothing but its receipt", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `pj-fail-${Date.now()}`;
            const conn = `db-${name}`;
            const KEY = "0".repeat(64);
            const credentials = { username: "system", password: "system" };

            const first = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const cls = await Class.create(first, "JobBoom", "class", "x", {
                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
            });
            await cls.addCard({ title: "survivor" });
            const classId = cls.getId();
            first.close();

            const patch = {
                "~class": "patch", version: "9.0.0", target: "app", changelog: "doomed",
                preApply: {
                    name: "boom",
                    content: `function execute(stack, params, job) { throw new Error("massage boom"); }`,
                },
                docs: [{
                    _id: classId, "~class": "class", _rev: "auto",
                    schema: { extra: { name: "extra", type: "string", config: {} } },
                }],
            };
            let failure: string | null = null;
            try {
                await ClientStack.create(conn, { name, documentKey: KEY, patches: [patch], credentials });
            } catch (error: any) {
                failure = error?.message ?? String(error);
            }

            const third = await ClientStack.create(conn, { name, documentKey: KEY, credentials });
            const model: any = await third.db.get(classId);
            const ledger = (await (third as any).db.find({
                selector: { "~class": "patch", version: "9.0.0" }, limit: 10,
            })).docs;
            const receipts = (await (third as any).db.find({
                selector: { "~class": "~JobRun", "runtimeArgs.patchVersion": "9.0.0", "runtimeArgs.phase": "pre" }, limit: 10,
            })).docs;
            third.close();
            await third.db.destroy();

            return {
                failure,
                modelUntouched: !("extra" in (model.schema ?? {})),
                recorded: ledger.length,
                receipt: receipts.map((r: any) => `${r.status}:${r.errorMessage}`),
            };
        });

        // Patch fault, named; zero persisted; nothing recorded - and the failure
        // trail survives the discard that protected everything else.
        expect(result.failure).toContain("9.0.0");
        expect(result.failure).toContain("massage boom");
        expect(result.modelUntouched).toBe(true);
        expect(result.recorded).toBe(0);
        expect(result.receipt).toEqual(["FAILURE:massage boom"]);
    });

    it("locked: undeclared jobs defer, requiresKey:false runs - and unlock arms the rest", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const stackName = `pj-locked-${Date.now()}`;
            const KEY = "0".repeat(64);
            const patches = [
                {
                    "~class": "patch", version: "1.0.0", target: "app", changelog: "plain class",
                    docs: [{
                        _id: "PlainJob", "~class": "class", active: true, name: "PlainJob", description: "x",
                        schema: { title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } } },
                    }],
                },
                {
                    "~class": "patch", version: "1.1.0", target: "app", changelog: "locked-capable seed",
                    preApply: {
                        name: "seed-plain",
                        requiresKey: false,
                        content: `function execute(stack, params, job) {
                            return (async () => {
                                const cls = await stack.getClass("PlainJob");
                                await cls.addCard({ title: "made-while-locked" });
                            })();
                        }`,
                    },
                    docs: [],
                },
                {
                    "~class": "patch", version: "1.2.0", target: "app", changelog: "undeclared job",
                    preApply: {
                        name: "needs-key-by-default",
                        content: `function execute(stack, params, job) { return Promise.resolve(); }`,
                    },
                    docs: [],
                },
            ];

            const docStack = new DocStack({ name: stackName, patches });
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });
            const stack = docStack.getStack(stackName)!;

            const ledgerState = async () => Object.fromEntries(
                ((await (stack as any).db.find({ selector: { "~class": "patch", target: "app" }, limit: 100 })).docs)
                    .map((entry: any) => [entry.version, entry.active])
            );
            const lockedLedger = await ledgerState();
            const seeded = (await (stack as any).db.find({
                selector: { "~class": "PlainJob" }, limit: 10,
            })).docs;

            await stack.unlock(KEY);
            const unlockedLedger = await ledgerState();

            stack.close();
            await stack.db.destroy();
            return {
                locked: { ledger: lockedLedger, seededTitles: seeded.map((d: any) => d.title) },
                unlockedLedger,
            };
        });

        // While locked: the plain patch and the opted-in job applied; the
        // undeclared job deferred - forgetting the flag costs latency, never
        // correctness.
        expect(result.locked.ledger).toEqual({ "1.0.0": true, "1.1.0": true, "1.2.0": false });
        expect(result.locked.seededTitles).toEqual(["made-while-locked"]);
        // Unlock replays the deferral and arms it.
        expect(result.unlockedLedger).toEqual({ "1.0.0": true, "1.1.0": true, "1.2.0": true });
    });

    it("locked: a wrong requiresKey:false degrades to deferral instead of failing the open", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const stackName = `pj-wrongfalse-${Date.now()}`;
            const KEY = "0".repeat(64);
            const classPatch = {
                "~class": "patch", version: "2.0.0", target: "app", changelog: "encrypting class",
                docs: [{
                    _id: "EncJob", "~class": "class", active: true, name: "EncJob", description: "x",
                    schema: {
                        title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                        secret: { name: "secret", type: "string", config: { encrypted: true } },
                    },
                }],
            };
            const wrongFalse = {
                "~class": "patch", version: "2.1.0", target: "app", changelog: "declared key-free, is not",
                preApply: {
                    name: "reads-encrypted",
                    requiresKey: false,
                    content: `function execute(stack, params, job) {
                        return stack.findDocuments({ "~class": { $eq: "EncJob" } });
                    }`,
                },
                docs: [],
            };

            const open = async (patches: any[]) => {
                const docStack = new DocStack({ name: stackName, patches });
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                    docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
                });
                return docStack.getStack(stackName)!;
            };

            // Open 1 commits the encrypting class (a new class applies locked).
            const first = await open([classPatch]);
            first.close();

            // Open 2: the mis-declared job reads a COMMITTED encrypting class while
            // locked - the facade throws, the chain converts to deferral, the open
            // succeeds.
            const second = await open([classPatch, wrongFalse]);
            const ledgerLocked = (await (second as any).db.find({
                selector: { "~class": "patch", version: "2.1.0" }, limit: 10,
            })).docs;
            const receipts = (await (second as any).db.find({
                selector: { "~class": "~JobRun", "runtimeArgs.patchVersion": "2.1.0", "runtimeArgs.phase": "pre" }, limit: 10,
            })).docs;

            await second.unlock(KEY);
            const ledgerUnlocked = (await (second as any).db.find({
                selector: { "~class": "patch", version: "2.1.0" }, limit: 10,
            })).docs;
            second.close();
            await second.db.destroy();

            return {
                openSucceeded: true,
                dormant: ledgerLocked.length === 1 && ledgerLocked[0].active === false,
                lockedAttempt: receipts.map((r: any) => r.status),
                armedAfterUnlock: ledgerUnlocked.length === 1 && ledgerUnlocked[0].active === true,
            };
        });

        expect(result.openSucceeded).toBe(true);
        // Degraded to exactly what a correct declaration would have done...
        expect(result.dormant).toBe(true);
        // ...with the locked attempt on record.
        expect(result.lockedAttempt).toEqual(["FAILURE"]);
        expect(result.armedAfterUnlock).toBe(true);
    });

    it("mixed: a job-carrying patch seeds data docs beside its class - and applyPatch still refuses jobs", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "pj-mixed",
            username: "pjm-user",
            password: "pjm-pass",
            evaluate: async ({ stack, docStack }) => {
                // The ADR-0044 scope guard refused this exact composition "until the
                // mixed extension lands". It landed by deletion - the chain carries
                // data docs natively - so the same patch now pins the whole shape:
                // class model, seeded document, and a post-apply job in one patch.
                const name = `pj-mixed-chain-${Date.now()}`;
                await docStack.addStack({
                    name,
                    // Keyed: an added stack inherits nothing, and a keyless stack is
                    // locked - the undeclared postApply would (correctly) defer.
                    documentKey: "0".repeat(64),
                    patches: [{
                        "~class": "patch", version: "1.0.0", target: "app", changelog: "mixed + job",
                        postApply: {
                            name: "second-seed",
                            content: `function execute(stack, params, job) {
                                return stack.db.put({ _id: "MixedC-2", "~class": "MixedC", title: "from the job", active: true });
                            }`,
                        },
                        docs: [
                            {
                                _id: "MixedC", "~class": "class", active: true, name: "MixedC", description: "x",
                                schema: { title: { name: "title", type: "string", config: { mandatory: true } } },
                            },
                            { _id: "MixedC-1", "~class": "MixedC", title: "seeded beside the class", active: true },
                        ],
                    }],
                } as any);
                const mixed = docStack.getStack(name)!;
                const seeded: any = await mixed.db.get("MixedC-1").catch(() => null);
                const fromJob: any = await mixed.db.get("MixedC-2").catch(() => null);
                const ledger = (await (mixed as any).db.find({
                    selector: { "~class": "patch", version: "1.0.0" }, limit: 10,
                })).docs;
                mixed.close();
                await mixed.db.destroy();

                let directRefusal: string | null = null;
                try {
                    await stack.applyPatch({
                        "~class": "patch", version: "1.0.1", target: "app", changelog: "direct",
                        preApply: { name: "noop", content: "function execute(stack, params, job) { return Promise.resolve(); }" },
                        docs: [],
                    } as any);
                } catch (error: any) {
                    directRefusal = error?.message ?? String(error);
                }

                return {
                    seededTitle: seeded?.title,
                    jobTitle: fromJob?.title,
                    armed: ledger.length === 1 && ledger[0].active === true,
                    directRefusal,
                };
            },
        });

        expect(result.seededTitle).toBe("seeded beside the class");
        expect(result.jobTitle).toBe("from the job");
        expect(result.armed).toBe(true);
        // The direct path still has no transaction to stage a job through.
        expect(result.directRefusal).toContain("ADR-0044");
    });
});
