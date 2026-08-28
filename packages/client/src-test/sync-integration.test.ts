import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The sync layer end to end, on the real platform - ported from the jest suite
 * `core/sync/__tests__/sync.integration.test.ts`, which could never run: it booted a
 * full stack under Node, where `pouchdb-browser` has no valid adapter. Here the browser
 * provides IndexedDB and a remote is simply a second in-page PouchDB - a remote is just
 * a database, and DocStack never learns what is behind it (ADR-0001).
 */
describe("stack.sync", () => {
    it("push: stack data and the data model cross; the device's own documents stay", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-push",
            username: "sync-user1",
            password: "sync-pass1",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const remote = new (window as any).PouchDB(`remote-push-${Date.now()}`);

                const classObj = await Class.create(stack, "SyncTask", "class", "sync test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                const doc = await classObj.addCard({ title: "Replicate me" });

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                const all = await remote.allDocs({ include_docs: true });
                const ids = all.rows.map((row: any) => row.id);
                const classes = all.rows.map((row: any) => row.doc?.["~class"]);

                return {
                    docArrived: ids.includes(doc._id),
                    classModelArrived: ids.includes("SyncTask"),
                    modelClassPresent: classes.includes("class"),
                    system: ids.includes("~system"),
                    cryptoConfig: ids.includes("~crypto-engine-config"),
                    designDocs: ids.filter((id: string) => id.startsWith("_design/")).length,
                    locks: ids.filter((id: string) => id.startsWith("~lock-")).length,
                    sessions: classes.includes("~UserSession"),
                    patches: classes.includes("patch"),
                };
            },
        });

        expect(result.docArrived).toBe(true);
        expect(result.classModelArrived).toBe(true);
        expect(result.modelClassPresent).toBe(true);

        // The device's own record of itself never leaves it; sessions belong to the
        // device that logged in, and the patch ledger records what this device applied.
        expect(result.system).toBe(false);
        expect(result.cryptoConfig).toBe(false);
        expect(result.designDocs).toBe(0);
        expect(result.locks).toBe(0);
        expect(result.sessions).toBe(false);
        expect(result.patches).toBe(false);
    });

    it("ANDs a caller's filter with the internal one", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-extra-filter",
            username: "sync-user2",
            password: "sync-pass2",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const remote = new (window as any).PouchDB(`remote-filter-${Date.now()}`);

                const classObj = await Class.create(stack, "Filtered", "class", "filter test");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await Attribute.create(classObj, "secret", "boolean", "Secret", { mandatory: false });
                const shared = await classObj.addCard({ title: "Shared", secret: false });
                const withheld = await classObj.addCard({ title: "Withheld", secret: true });

                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    filter: (doc: any) => doc.secret !== true,
                });
                await handle.waitForConvergence();

                const ids = (await remote.allDocs()).rows.map((row: any) => row.id);
                return {
                    shared: ids.includes(shared._id),
                    withheld: ids.includes(withheld._id),
                    system: ids.includes("~system"),
                };
            },
        });

        expect(result.shared).toBe(true);
        expect(result.withheld).toBe(false);
        // The internal filter is still in force alongside the caller's.
        expect(result.system).toBe(false);
    });

    it("class rules: exclude drops documents but ships the model; include keeps only what it names", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-class-rules",
            username: "sync-user3",
            password: "sync-pass3",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const PouchCtor = (window as any).PouchDB;

                const taskClass = await Class.create(stack, "ClsTask", "class", "kept");
                const draftClass = await Class.create(stack, "ClsDraft", "class", "dropped");
                await Attribute.create(taskClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(draftClass, "title", "string", "Title", { mandatory: true });
                const kept = await taskClass.addCard({ title: "Kept" });
                const dropped = await draftClass.addCard({ title: "Dropped" });

                const excludeRemote = new PouchCtor(`remote-exclude-${Date.now()}`);
                const excluded = await stack.sync({
                    remote: () => excludeRemote,
                    direction: "push",
                    live: false,
                    classes: { exclude: ["ClsDraft"] },
                });
                await excluded.waitForConvergence();
                const excludeIds = (await excludeRemote.allDocs()).rows.map((row: any) => row.id);

                const includeRemote = new PouchCtor(`remote-include-${Date.now()}`);
                const included = await stack.sync({
                    remote: () => includeRemote,
                    direction: "push",
                    live: false,
                    classes: { include: ["ClsTask"] },
                });
                await included.waitForConvergence();
                const includeAll = await includeRemote.allDocs({ include_docs: true });
                const includeIds = includeAll.rows.map((row: any) => row.id);
                const includeClasses = includeAll.rows.map((row: any) => row.doc?.["~class"]);

                return {
                    exclude: {
                        kept: excludeIds.includes(kept._id),
                        dropped: excludeIds.includes(dropped._id),
                        // The excluded class's *model* still crosses: a remote without it
                        // would not be a readable replica.
                        droppedModel: excludeIds.includes("ClsDraft"),
                    },
                    include: {
                        kept: includeIds.includes(kept._id),
                        dropped: includeIds.includes(dropped._id),
                        dataModelRode: includeClasses.includes("class"),
                    },
                };
            },
        });

        expect(result.exclude.kept).toBe(true);
        expect(result.exclude.dropped).toBe(false);
        expect(result.exclude.droppedModel).toBe(true);

        expect(result.include.kept).toBe(true);
        expect(result.include.dropped).toBe(false);
        expect(result.include.dataModelRode).toBe(true);
    });

    it("gives a different replication checkpoint to a different class filter", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-filter-checkpoint",
            username: "sync-user4",
            password: "sync-pass4",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const remote = new (window as any).PouchDB(`remote-ck-${Date.now()}`);

                const taskClass = await Class.create(stack, "CkTask", "class", "task");
                const draftClass = await Class.create(stack, "CkDraft", "class", "draft");
                await Attribute.create(taskClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(draftClass, "title", "string", "Title", { mandatory: true });
                await taskClass.addCard({ title: "Task" });
                const draftDoc = await draftClass.addCard({ title: "Draft" });

                const first = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { exclude: ["CkDraft"] },
                });
                await first.waitForConvergence();
                const afterNarrow = (await remote.allDocs()).rows.map((row: any) => row.id);

                // Widening the filter has to re-scan history, not resume past it -
                // PouchDB hashes the filter's identity into the checkpoint id (ADR-0001).
                const second = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { exclude: [] },
                });
                await second.waitForConvergence();
                const afterWide = (await remote.allDocs()).rows.map((row: any) => row.id);

                stack.cancelSync();
                return {
                    draftHeldFirst: afterNarrow.includes(draftDoc._id),
                    draftBackfilled: afterWide.includes(draftDoc._id),
                };
            },
        });

        expect(result.draftHeldFirst).toBe(false);
        expect(result.draftBackfilled).toBe(true);
    });

    it("replicates everything, internal documents included, when asked to", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-no-filter",
            username: "sync-user5",
            password: "sync-pass5",
            evaluate: async ({ stack }) => {
                const remote = new (window as any).PouchDB(`remote-all-${Date.now()}`);
                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    internalDocs: false,
                    checkSchemaVersion: false,
                });
                await handle.waitForConvergence();

                const ids = (await remote.allDocs()).rows.map((row: any) => row.id);
                return { system: ids.includes("~system") };
            },
        });

        expect(result.system).toBe(true);
    });

    it("pull stores what authoring would reject; 'both' round-trips", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-directions",
            username: "sync-user6",
            password: "sync-pass6",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const PouchCtor = (window as any).PouchDB;

                // The peer that wrote this is a build ahead: its class is not in this
                // device's data model. Replication must land it regardless (ADR-0001).
                const pullRemote = new PouchCtor(`remote-pull-${Date.now()}`);
                await pullRemote.put({
                    _id: "PeerAuthored-1",
                    "~class": "ClassOnlyOnTheOtherDevice",
                    title: "From the other device",
                    active: true,
                });
                const pull = await stack.sync({ remote: () => pullRemote, direction: "pull", live: false });
                await pull.waitForConvergence();
                const stored = await stack.db.get("PeerAuthored-1").catch(() => null);
                const pullStatus = pull.getStatus();

                const classObj = await Class.create(stack, "BothTask", "class", "round trip");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                const mine = await classObj.addCard({ title: "Mine" });
                const bothRemote = new PouchCtor(`remote-both-${Date.now()}`);
                await bothRemote.put({ _id: "Peer-1", "~class": "PeerClass", active: true });
                const both = await stack.sync({ remote: () => bothRemote, direction: "both", live: false });
                await both.waitForConvergence();

                return {
                    storedTitle: (stored as any)?.title ?? null,
                    pulled: pullStatus.pulled,
                    pushed: pullStatus.pushed,
                    minePushed: (await bothRemote.allDocs()).rows.some((row: any) => row.id === mine._id),
                    peerPulled: Boolean(await stack.db.get("Peer-1").catch(() => null)),
                };
            },
        });

        expect(result.storedTitle).toBe("From the other device");
        expect(result.pulled).toBeGreaterThan(0);
        expect(result.pushed).toBe(0);
        expect(result.minePushed).toBe(true);
        expect(result.peerPulled).toBe(true);
    });

    it("schema gate: publishes on fresh, refuses newer, accepts older, can be off", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-schema-gate",
            username: "sync-user7",
            password: "sync-pass7",
            evaluate: async ({ stack }) => {
                const { publishSchemaVersion, readRemoteSchemaVersion, SYNC_META_DOC_ID } = (window as any).docstack;
                const PouchCtor = (window as any).PouchDB;

                // Fresh remote: this device's version gets recorded, in a `_local/`
                // document every device on that remote shares but never replicates.
                const fresh = new PouchCtor(`remote-fresh-${Date.now()}`);
                const beforePush = await readRemoteSchemaVersion(fresh);
                const pushHandle = await stack.sync({ remote: () => fresh, direction: "push", live: false });
                await pushHandle.waitForConvergence();
                const published = await readRemoteSchemaVersion(fresh);
                const meta = await fresh.get(SYNC_META_DOC_ID);

                // A remote written by a newer schema refuses this device.
                const newer = new PouchCtor(`remote-newer-${Date.now()}`);
                await publishSchemaVersion(newer, "99.0.0", "99.0.0");
                let refusal: string | null = null;
                await stack.sync({ remote: () => newer, direction: "pull", live: false })
                    .catch((error: any) => { refusal = error?.name; });
                const refusedStatus = stack.getSyncStatus();

                // A remote written by an older schema is served, and the marker bumps.
                const older = new PouchCtor(`remote-older-${Date.now()}`);
                await publishSchemaVersion(older, "0.0.1", "0.0.1");
                const olderHandle = await stack.sync({ remote: () => older, direction: "push", live: false });
                await olderHandle.waitForConvergence();
                const bumped = await readRemoteSchemaVersion(older);

                // The gate is optional.
                const gateOff = new PouchCtor(`remote-gate-off-${Date.now()}`);
                await publishSchemaVersion(gateOff, "99.0.0", "99.0.0");
                const offHandle = await stack.sync({
                    remote: () => gateOff, direction: "push", live: false, checkSchemaVersion: false,
                });
                await offHandle.waitForConvergence();

                return {
                    beforePush,
                    published,
                    metaVersion: meta.schemaVersion,
                    metaUpdatedAt: typeof meta.updatedAt,
                    localVersion: stack.schemaVersion,
                    refusal,
                    refusedState: refusedStatus?.state,
                    refusedErrorName: refusedStatus?.lastError?.name,
                    bumped,
                    gateOffConverged: typeof offHandle.getStatus().lastConvergedAt,
                };
            },
        });

        expect(result.beforePush).toBeNull();
        expect(result.published).toBe(result.localVersion);
        expect(result.metaVersion).toBe(result.localVersion);
        expect(result.metaUpdatedAt).toBe("number");

        expect(result.refusal).toBe("SyncSchemaMismatchError");
        expect(result.refusedState).toBe("error");
        expect(result.refusedErrorName).toBe("SyncSchemaMismatchError");

        expect(result.bumped).toBe(result.localVersion);
        expect(result.gateOffConverged).toBe("number");
    });

    it("reports convergence rather than mere activity, on the handle and on the stack", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-status",
            username: "sync-user8",
            password: "sync-pass8",
            evaluate: async ({ stack }) => {
                const { Class, Attribute } = (window as any).docstack;
                const remote = new (window as any).PouchDB(`remote-status-${Date.now()}`);

                const classObj = await Class.create(stack, "StatusTask", "class", "status");
                await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
                await classObj.addCard({ title: "Move me" });

                const seenOnStack: any[] = [];
                stack.addEventListener("sync-status", (event: any) => seenOnStack.push(event.detail));

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                const statuses: string[] = [];
                handle.addEventListener("status", (event: any) => statuses.push(event.detail.state));
                const converged = await handle.waitForConvergence();

                return {
                    state: converged.state,
                    convergedAt: typeof converged.lastConvergedAt,
                    pushed: converged.pushed,
                    stackName: converged.stack,
                    expectedStack: stack.name,
                    statuses,
                    stackEventCount: seenOnStack.length,
                    lastStackEventStack: seenOnStack[seenOnStack.length - 1]?.stack,
                };
            },
        });

        expect(result.state).toBe("idle");
        expect(result.convergedAt).toBe("number");
        expect(result.pushed).toBeGreaterThan(0);
        expect(result.stackName).toBe(result.expectedStack);
        expect(result.statuses).toContain("idle");
        // A consumer need not hold the handle: the stack re-announces.
        expect(result.stackEventCount).toBeGreaterThan(0);
        expect(result.lastStackEventStack).toBe(result.expectedStack);
    });

    it("handle lifecycle: replaces a predecessor, re-resolves on restart, accepts an instance", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-lifecycle",
            username: "sync-user9",
            password: "sync-pass9",
            evaluate: async ({ stack }) => {
                const PouchCtor = (window as any).PouchDB;
                const remote = new PouchCtor(`remote-lifecycle-${Date.now()}`);

                // Two syncs: the second replaces the first rather than running beside it.
                const first = await stack.sync({ remote: () => remote, direction: "push", live: true });
                const second = await stack.sync({ remote: () => remote, direction: "push", live: true });
                const firstState = first.getStatus().state;
                const secondIsCurrent = stack.getSyncHandle() === second;
                stack.cancelSync();

                // Restart runs the resolver again - how a refreshed token gets in - and
                // keeps the counters and convergence timestamps.
                let resolutions = 0;
                const restartable = await stack.sync({
                    remote: () => { resolutions += 1; return remote; },
                    direction: "push",
                    live: false,
                });
                await restartable.waitForConvergence();
                const convergedBefore = restartable.getStatus().lastConvergedAt;
                await restartable.restart();
                await restartable.waitForConvergence();
                const convergedAfter = restartable.getStatus().lastConvergedAt;

                // A database instance works as well as a resolver.
                const instanceHandle = await stack.sync({ remote, direction: "push", live: false });
                await instanceHandle.waitForConvergence();
                const sameInstance = instanceHandle.getRemote() === remote;

                stack.cancelSync();
                return { firstState, secondIsCurrent, resolutions, convergedBefore, convergedAfter, sameInstance };
            },
        });

        expect(result.firstState).toBe("stopped");
        expect(result.secondIsCurrent).toBe(true);
        expect(result.resolutions).toBe(2);
        expect(result.convergedAfter).toBeGreaterThanOrEqual(result.convergedBefore);
        expect(result.sameInstance).toBe(true);
    });

    it("stops when the stack closes", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-close",
            username: "sync-user10",
            password: "sync-pass10",
            evaluate: async ({ stack }) => {
                const remote = new (window as any).PouchDB(`remote-close-${Date.now()}`);
                const handle = await stack.sync({ remote: () => remote, direction: "push", live: true });
                const before = handle.getStatus().state;

                stack.close();

                return { before, after: handle.getStatus().state };
            },
        });

        expect(result.before).not.toBe("stopped");
        expect(result.after).toBe("stopped");
    });
});

describe("docstack.sync and stack management", () => {
    it("starts one replication per stack, narrows to named ones, and cancels them all", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "sync-fleet",
            username: "sync-user11",
            password: "sync-pass11",
            evaluate: async ({ docStack, stackName }) => {
                const PouchCtor = (window as any).PouchDB;
                const secondName = `${stackName}-second`;
                await docStack.addStack({ name: secondName });

                const remotes: string[] = [];
                const handle = await docStack.sync({
                    remote: (target: any) => {
                        remotes.push(target.name);
                        return new PouchCtor(`remote-fleet-${target.name}`);
                    },
                    direction: "push",
                    live: false,
                });
                const keys = [...handle.handles.keys()].sort();
                await Promise.all([...handle.handles.values()].map((h: any) => h.waitForConvergence()));
                const statusCount = Object.keys(handle.getStatus()).length;
                const fleetConvergedAt = typeof handle.getLastConvergedAt();

                handle.cancel();
                const statesAfterCancel = [...handle.handles.values()].map((h: any) => h.getStatus().state);

                const narrowed = await docStack.sync({
                    remote: () => new PouchCtor(`remote-narrow-${Date.now()}`),
                    direction: "push",
                    live: false,
                    stacks: [secondName],
                });
                const narrowedKeys = [...narrowed.handles.keys()];
                narrowed.cancel();

                return {
                    keys,
                    expected: [stackName, secondName].sort(),
                    resolverCalls: remotes.length,
                    statusCount,
                    fleetConvergedAt,
                    statesAfterCancel,
                    narrowedKeys,
                    secondName,
                };
            },
        });

        expect(result.keys).toEqual(result.expected);
        expect(result.resolverCalls).toBe(2);
        expect(result.statusCount).toBe(2);
        expect(result.fleetConvergedAt).toBe("number");
        expect(result.statesAfterCancel).toEqual(["stopped", "stopped"]);
        expect(result.narrowedKeys).toEqual([result.secondName]);
    });

    it("addStack is idempotent and additions/removals are announced", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "stack-events",
            username: "sync-user12",
            password: "sync-pass12",
            evaluate: async ({ docStack, stackName }) => {
                const secondName = `${stackName}-late`;
                const events: string[] = [];
                docStack.addEventListener("stack-added", () => events.push("added"));
                docStack.addEventListener("stack-removed", () => events.push("removed"));

                const added = await docStack.addStack({ name: secondName });
                const again = await docStack.addStack({ name: secondName });
                const sameInstance = added === again && docStack.getStack(secondName) === added;
                const openCount = docStack.getStacks().filter((s: any) => s.name === secondName).length;

                const removed = await docStack.removeStack(secondName, { destroy: true });
                const gone = docStack.getStack(secondName) === undefined;
                const removedTwice = await docStack.removeStack(secondName);

                return { events, sameInstance, openCount, removed, gone, removedTwice };
            },
        });

        expect(result.sameInstance).toBe(true);
        expect(result.openCount).toBe(1);
        expect(result.events).toContain("added");
        expect(result.events).toContain("removed");
        expect(result.removed).toBe(true);
        expect(result.gone).toBe(true);
        expect(result.removedTwice).toBe(false);
    });
});
