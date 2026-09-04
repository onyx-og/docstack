import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Sync on a locked stack - the three junctions of ADR-0040.
 *
 * Replication itself is safe while locked (pristine handle, ciphertext in and out).
 * The hazards were where replication meets patches and propagation: a class-model
 * patch applying on a stack that cannot decrypt what its propagation must read
 * (junction 3), the deferred replay overwriting values on pulled documents
 * (junction 2), and a schema gate blind to consumer patches (junction 1).
 *
 * The shared shape everywhere: patch v1.0.0 seeds a class with an encrypted
 * attribute, v1.6.0 adds a plain attribute to it - exactly the patch that must
 * defer while locked, because its propagation decrypts and re-encrypts every
 * document of the class.
 */
describe("sync while locked", () => {
    it("junction 0: replication carries ciphertext to the remote - never plaintext", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sealed-push",
            username: "seal-user",
            password: "seal-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;
                const secretClass = await Class.create(stack, "SealedNote", "class", "Notes", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { encrypted: true } },
                });
                const card = await secretClass.addCard({ title: "t", secret: "room-code" });

                const remote = new (window as any).PouchDB(`sealed-remote-${Date.now()}`);
                const push = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await push.waitForConvergence();
                const onRemote: any = await remote.get(card._id);

                // The winning-revision read is unaffected: apps still see plaintext.
                const read: any = await stack.getDocument(card._id);

                await remote.destroy();
                return {
                    remoteCipher: onRemote.secret?.__enc === true,
                    // The whole serialized document, not one field: nothing may leak.
                    remoteLeak: JSON.stringify(onRemote).includes("room-code"),
                    readSecret: read.secret,
                };
            },
        });

        // The dispatch marked this "verified correct"; on the traced build it was not:
        // PouchDB hard-binds instance methods, so replication's bulkGet shim re-entered
        // the plugin's decrypting `get` per revision, and the remote received every
        // encrypted attribute in plaintext under the local revision id. The override
        // now serves the stored form for any revision-addressed read.
        expect(result.remoteCipher).toBe(true);
        expect(result.remoteLeak).toBe(false);
        expect(result.readSecret).toBe("room-code");
    });

    it("junctions 2+3: the patch defers while locked, and its replay fills without overwriting pulled values", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "locked-sync-a",
            username: "lsync-user1",
            password: "lsync-pass1",
            patches: [
                {
                    "~class": "patch", version: "1.0.0", target: "app", changelog: "class",
                    docs: [{
                        _id: "LockedCal", "~class": "class", active: true, name: "LockedCal", description: "occurrences",
                        schema: {
                            title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                            secret: { name: "secret", type: "string", config: { encrypted: true } },
                        },
                    }],
                },
                {
                    "~class": "patch", version: "1.6.0", target: "app", changelog: "series",
                    docs: [{
                        _id: "LockedCal", "~class": "class", _rev: "auto",
                        schema: { series: { name: "series", type: "string", config: {} } },
                    }],
                },
            ] as any,
            evaluate: async ({ stack, docStack }) => {
                const KEY = "0".repeat(64);
                const patches = [
                    {
                        "~class": "patch", version: "1.0.0", target: "app", changelog: "class",
                        docs: [{
                            _id: "LockedCal", "~class": "class", active: true, name: "LockedCal", description: "occurrences",
                            schema: {
                                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                                secret: { name: "secret", type: "string", config: { encrypted: true } },
                            },
                        }],
                    },
                    {
                        "~class": "patch", version: "1.6.0", target: "app", changelog: "series",
                        docs: [{
                            _id: "LockedCal", "~class": "class", _rev: "auto",
                            schema: { series: { name: "series", type: "string", config: {} } },
                        }],
                    },
                ];

                // Device A: unlocked, both patches applied, the new attribute populated.
                const calClass = await stack.getClass("LockedCal");
                const card = await calClass.addCard({ title: "standup", series: "s-1", secret: "room-code" });

                const remote = new (window as any).PouchDB(`locked-remote-${Date.now()}`);
                const push = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await push.waitForConvergence();

                // Device B: same build, no key - locked. Junction 3: opening must
                // succeed, with v1.6.0 deferred rather than applied into a
                // propagation that cannot decrypt.
                const b = await docStack.addStack({ name: `locked-sync-b-${Date.now()}`, patches } as any);
                const modelLocked: any = await b.getClassModel("LockedCal");
                // The deferral is persisted as a dormant ledger entry (ADR-0041).
                const ledgerLocked = (await (b as any).db.find({
                    selector: { "~class": "patch", version: "1.6.0" }, limit: 10,
                })).docs;

                // Junction 1 is gated by default; this test is about the replay, so
                // the pull opts out - a consumer's own prerogative.
                const pull = await b.sync({ remote: () => remote, direction: "pull", live: false, checkSchemaVersion: false });
                await pull.waitForConvergence();
                const pulled: any = await b.getReplicationHandle().get(card._id);

                // Unlock replays the deferred patch; its propagation runs over the
                // pulled document. Junction 2: `add` fills only documents lacking the
                // key - the pulled value must survive.
                await b.unlock(KEY);
                const modelUnlocked: any = await b.getClassModel("LockedCal");
                const after: any = await b.getReplicationHandle().get(card._id);
                const ledgerUnlocked = (await (b as any).db.find({
                    selector: { "~class": "patch", version: "1.6.0" }, limit: 10,
                })).docs;

                return {
                    deferredWhileLocked: !("series" in (modelLocked?.schema ?? {})),
                    dormantEntry: ledgerLocked.length === 1 && ledgerLocked[0].active === false,
                    pulledSeries: pulled?.series,
                    pulledCiphertext: pulled?.secret?.__enc === true,
                    replayedSeriesInModel: "series" in (modelUnlocked?.schema ?? {}),
                    seriesAfterReplay: after?.series,
                    stillCiphertext: after?.secret?.__enc === true,
                    armedEntry: ledgerUnlocked.length === 1 && ledgerUnlocked[0].active === true,
                };
            },
        });

        // Junction 3: the class-model patch deferred instead of failing the open.
        expect(result.deferredWhileLocked).toBe(true);
        // The deferral is a dormant ledger entry, not just instance memory (ADR-0041).
        expect(result.dormantEntry).toBe(true);
        // Locked replication carried the shaped document, ciphertext intact.
        expect(result.pulledSeries).toBe("s-1");
        expect(result.pulledCiphertext).toBe(true);
        // Junction 2: the replay landed the schema and propagation filled, never
        // overwrote - the pulled value survives, still encrypted at rest.
        expect(result.replayedSeriesInModel).toBe(true);
        expect(result.seriesAfterReplay).toBe("s-1");
        expect(result.stillCiphertext).toBe(true);
        // The replay armed the same entry in place - no duplicate record.
        expect(result.armedEntry).toBe(true);
    });

    it("junction 1: the schema gate sees consumer patches - a trailing device refuses, and passes after unlock", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "locked-gate-a",
            username: "lsync-user2",
            password: "lsync-pass2",
            patches: [
                {
                    "~class": "patch", version: "1.0.0", target: "app", changelog: "class",
                    docs: [{
                        _id: "GateCal", "~class": "class", active: true, name: "GateCal", description: "occurrences",
                        schema: {
                            title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                            secret: { name: "secret", type: "string", config: { encrypted: true } },
                        },
                    }],
                },
                {
                    "~class": "patch", version: "1.6.0", target: "app", changelog: "series",
                    docs: [{
                        _id: "GateCal", "~class": "class", _rev: "auto",
                        schema: { series: { name: "series", type: "string", config: {} } },
                    }],
                },
            ] as any,
            evaluate: async ({ stack, docStack }) => {
                const KEY = "0".repeat(64);
                const patches = [
                    {
                        "~class": "patch", version: "1.0.0", target: "app", changelog: "class",
                        docs: [{
                            _id: "GateCal", "~class": "class", active: true, name: "GateCal", description: "occurrences",
                            schema: {
                                title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                                secret: { name: "secret", type: "string", config: { encrypted: true } },
                            },
                        }],
                    },
                    {
                        "~class": "patch", version: "1.6.0", target: "app", changelog: "series",
                        docs: [{
                            _id: "GateCal", "~class": "class", _rev: "auto",
                            schema: { series: { name: "series", type: "string", config: {} } },
                        }],
                    },
                ];

                const calClass = await stack.getClass("GateCal");
                const card = await calClass.addCard({ title: "planning", series: "s-2", secret: "code" });

                const remote = new (window as any).PouchDB(`gate-remote-${Date.now()}`);
                const push = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await push.waitForConvergence();
                const meta: any = await remote.get("_local/docstack-sync").catch(() => null);

                const b = await docStack.addStack({ name: `locked-gate-b-${Date.now()}`, patches } as any);

                // The gate, on by default, must refuse: the remote's consumer version
                // is ahead of what this device has applied.
                let refusal: any = null;
                try {
                    await b.sync({ remote: () => remote, direction: "pull", live: false });
                } catch (error: any) {
                    refusal = { name: error?.name, scope: error?.scope, remoteVersion: error?.remoteVersion };
                }
                const pulledWhileRefused = await b.getReplicationHandle().get(card._id).catch(() => null);

                // Unlock replays the deferred patch; the ledger catches up; the same
                // sync now passes.
                await b.unlock(KEY);
                const retry = await b.sync({ remote: () => remote, direction: "pull", live: false });
                await retry.waitForConvergence();
                const pulledAfter: any = await b.getReplicationHandle().get(card._id).catch(() => null);

                return {
                    publishedConsumerVersion: meta?.consumerSchemaVersion,
                    refusal,
                    pulledWhileRefused: pulledWhileRefused !== null,
                    arrivedAfterUnlock: pulledAfter?.series,
                };
            },
        });

        // The pushing device published its consumer schema version...
        expect(result.publishedConsumerVersion).toBe("1.6.0");
        // ...and the trailing device refused at the gate, pulling nothing.
        expect(result.refusal?.name).toBe("SyncSchemaMismatchError");
        expect(result.refusal?.scope).toBe("consumer");
        expect(result.refusal?.remoteVersion).toBe("1.6.0");
        expect(result.pulledWhileRefused).toBe(false);
        // After unlock and replay, the same gate passes and the pull completes.
        expect(result.arrivedAfterUnlock).toBe("s-2");
    });
});
