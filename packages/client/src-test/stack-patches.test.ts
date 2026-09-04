import { ClientStack } from '../lib';
import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("DocStack patches", () => {
    it("applies patches provided through stack configuration", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const stackName = `config-patch-${Date.now()}`;
            const patchDocId = `patched-doc-${Date.now()}`;
            const patchTargetClassId = "~PatchTarget";

            const classPatch = {
                "~class": "patch",
                version: "9.9.8",
                changelog: "Patch for the class document",
                docs: [
                    {
                        _id: patchTargetClassId,
                        "~class": "class",
                        active: true,
                        name: "PatchTarget",
                        description: "A minimal class to validate config patch inserts for classes",
                        schema: {
                            description: {
                                name: "description",
                                type: "string",
                                config: { mandatory: true },
                            },
                        }
                    },
                ]
            };

            const docPatch = {
                "~class": "patch",
                version: "9.9.9",
                changelog: "Patch for the actual document",
                docs: [{
                    _id: patchDocId,
                    "~class": patchTargetClassId,
                    description: "created from stack configuration patch",
                }]
            };

            const docStack = new DocStack({ name: stackName, patches: [classPatch, docPatch] });

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });

            const stack = docStack.getStack(stackName) as ClientStack;
            if (!stack) throw new Error(`Failed to resolve stack '${stackName}'`);

            try {
                const patchedDoc = await stack.db.get<{ description: string; "~class": string }>(patchDocId);
                return {
                    description: patchedDoc.description,
                    classId: patchedDoc["~class"],
                    patchTargetClassId,
                };
            } finally {
                stack.close();
                await stack.db.destroy();
            }
        });

        expect(result.description).toBe("created from stack configuration patch");
        expect(result.classId).toBe(result.patchTargetClassId);
    });

    it("ADR-0040: reopening a stack does not re-apply consumer patches", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;
            const stackName = `patch-dedupe-${Date.now()}`;
            const patch = {
                "~class": "patch",
                version: "2.0.0",
                target: "app",
                changelog: "one class",
                docs: [{
                    _id: "DedupeTarget", "~class": "class", active: true, name: "DedupeTarget",
                    description: "dedupe pin",
                    schema: { title: { name: "title", type: "string", config: { mandatory: true } } },
                }],
            };
            const open = async () => {
                const docStack = new DocStack({ name: stackName, patches: [patch] });
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                    docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
                });
                return docStack.getStack(stackName)!;
            };

            // `active` carries the ledger's own meaning (ADR-0041): armed on
            // successful application. Read through the visibility filter the dedupe
            // saw nothing and re-applied every consumer patch on every open.
            const first = await open();
            const entriesFirst = (await (first as any).db.find({
                selector: { "~class": "patch", version: "2.0.0" }, limit: 100,
            })).docs;
            first.close();

            const second = await open();
            const entriesSecond = (await (second as any).db.find({
                selector: { "~class": "patch", version: "2.0.0" }, limit: 100,
            })).docs;
            second.close();
            await second.db.destroy();

            return {
                countAfterFirst: entriesFirst.length,
                armed: entriesFirst[0]?.active,
                countAfterSecond: entriesSecond.length,
            };
        });

        expect(result.countAfterFirst).toBe(1);
        // Recorded at the moment of successful application, armed.
        expect(result.armed).toBe(true);
        // One ledger entry, ever - a reopen recognizes it and applies nothing.
        expect(result.countAfterSecond).toBe(1);
    });

    it("ADR-0041: a failed application records nothing, so the patch retries", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "patch-fail-retry",
            username: "pfr-user",
            password: "pfr-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const taskClass = await Class.create(stack, "RetryTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    nick: { name: "nick", type: "string", config: {} },
                });
                await taskClass.addCard({ title: "one" }); // no nick

                // Tightening `nick` to mandatory over a valueless document refuses
                // (ADR-0038) - the whole application fails before anything persists.
                const badPatch = {
                    "~class": "patch", version: "3.0.0", target: "app", changelog: "tighten",
                    docs: [{
                        _id: taskClass.getId(), "~class": "class", _rev: "auto",
                        schema: { nick: { name: "nick", type: "string", config: { mandatory: true } } },
                    }],
                };
                let refused = false;
                try {
                    await stack.applyPatch(badPatch);
                } catch {
                    refused = true;
                }
                const ledgerAfterFailure = (await (stack as any).db.find({
                    selector: { "~class": "patch", version: "3.0.0" }, limit: 10,
                })).docs;

                // The corrected patch applies - nothing recorded the failure as done.
                const goodPatch = {
                    "~class": "patch", version: "3.0.0", target: "app", changelog: "widen instead",
                    docs: [{
                        _id: taskClass.getId(), "~class": "class", _rev: "auto",
                        schema: { badge: { name: "badge", type: "string", config: {} } },
                    }],
                };
                await stack.applyPatch(goodPatch);
                const ledgerAfterSuccess = (await (stack as any).db.find({
                    selector: { "~class": "patch", version: "3.0.0" }, limit: 10,
                })).docs;

                return {
                    refused,
                    recordedAfterFailure: ledgerAfterFailure.length,
                    recordedAfterSuccess: ledgerAfterSuccess.length,
                    armed: ledgerAfterSuccess[0]?.active,
                };
            },
        });

        expect(result.refused).toBe(true);
        // The old flow recorded the failed patch as applied and never retried it.
        expect(result.recordedAfterFailure).toBe(0);
        expect(result.recordedAfterSuccess).toBe(1);
        expect(result.armed).toBe(true);
    });

    it("ADR-0043: a patch introduces a class and seeds its first document in one batch", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "patch-batch-seed",
            username: "pbs-user",
            password: "pbs-pass",
            evaluate: async ({ stack }) => {
                // The class model and its first document travel in ONE docs array -
                // the composition applyPatch always produces, and the one that used
                // to fail with "Class not found" because class resolution read only
                // the store, never the batch being written.
                await stack.applyPatch({
                    "~class": "patch", version: "4.0.0", target: "app", changelog: "class + seed",
                    docs: [
                        {
                            _id: "SeededSeries", "~class": "class", active: true, name: "SeededSeries",
                            description: "series",
                            schema: {
                                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                            },
                        },
                        { _id: "SeededSeries-first", "~class": "SeededSeries", title: "seeded", active: true },
                    ],
                });
                const seeded: any = await stack.getDocument("SeededSeries-first");

                // The batch is judged as one: a seed document that fails validation
                // against the class born beside it refuses the whole patch, class
                // included, and records nothing (ADR-0041).
                let refused = false;
                try {
                    await stack.applyPatch({
                        "~class": "patch", version: "4.1.0", target: "app", changelog: "bad seed",
                        docs: [
                            {
                                _id: "BadSeed", "~class": "class", active: true, name: "BadSeed", description: "x",
                                schema: {
                                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                                },
                            },
                            { _id: "BadSeed-first", "~class": "BadSeed", active: true }, // no title
                        ],
                    });
                } catch {
                    refused = true;
                }
                const badClass = await stack.db.get("BadSeed").catch(() => null);
                const badLedger = (await (stack as any).db.find({
                    selector: { "~class": "patch", version: "4.1.0" }, limit: 10,
                })).docs;

                return {
                    seededTitle: seeded?.title,
                    refused,
                    badClassLanded: badClass !== null,
                    badRecorded: badLedger.length,
                };
            },
        });

        expect(result.seededTitle).toBe("seeded");
        expect(result.refused).toBe(true);
        expect(result.badClassLanded).toBe(false);
        expect(result.badRecorded).toBe(0);
    });

    it("ADR-0043: a drop-and-carry batch behaves the same whether the model change is in the batch or stored", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "patch-batch-drop",
            username: "pbd-user",
            password: "pbd-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // Two identical classes; both drop `tag` (ADR-0038 null); each then
                // receives a document still carrying it - one in the same batch as
                // the drop, one after the drop is stored.
                for (const name of ["DropInBatch", "DropStored"]) {
                    await Class.create(stack, name, "class", "x", {
                        title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                        tag: { name: "tag", type: "string", config: {} },
                    });
                }

                await stack.applyPatch({
                    "~class": "patch", version: "5.0.0", target: "app", changelog: "drop in batch",
                    docs: [
                        {
                            _id: (await stack.getClass("DropInBatch")).getId(), "~class": "class", _rev: "auto",
                            schema: { tag: null },
                        },
                        { _id: "DropInBatch-carrier", "~class": "DropInBatch", title: "one", tag: "stowaway", active: true },
                    ],
                });

                await stack.applyPatch({
                    "~class": "patch", version: "5.1.0", target: "app", changelog: "drop first",
                    docs: [{
                        _id: (await stack.getClass("DropStored")).getId(), "~class": "class", _rev: "auto",
                        schema: { tag: null },
                    }],
                });
                await stack.db.put({ _id: "DropStored-carrier", "~class": "DropStored", title: "one", tag: "stowaway", active: true } as any);

                const inBatch: any = await stack.db.get("DropInBatch-carrier");
                const stored: any = await stack.db.get("DropStored-carrier");
                return {
                    inBatchHasTag: "tag" in inBatch,
                    storedHasTag: "tag" in stored,
                    sameValue: inBatch.tag === stored.tag,
                };
            },
        });

        // The pin is equivalence, not a particular answer: the batch-resolved model
        // and the stored model must judge the carried attribute identically.
        expect(result.inBatchHasTag).toBe(result.storedHasTag);
        expect(result.sameValue).toBe(true);
    });

    it("seeds the system user with the admin group through system patches", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const stackName = `system-user-${Date.now()}`;
            const docStack = new DocStack({ name: stackName });

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });

            const stack = docStack.getStack(stackName) as ClientStack;
            if (!stack) throw new Error(`Failed to resolve stack '${stackName}'`);

            try {
                const systemUser = await stack.db.get<{ "~class": string; groupId: string[] }>("system");
                return {
                    classId: systemUser["~class"],
                    isGroupIdArray: Array.isArray(systemUser.groupId),
                    hasAdminGroup: systemUser.groupId.includes("Group-Admin"),
                };
            } finally {
                stack.close();
                await stack.db.destroy();
            }
        });

        expect(result.classId).toBe("~User");
        expect(result.isGroupIdArray).toBe(true);
        expect(result.hasAdminGroup).toBe(true);
    });
});
