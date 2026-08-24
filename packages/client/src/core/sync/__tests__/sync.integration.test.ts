import PouchDB from "pouchdb-browser";
import { Attribute, Class } from "../../index.js";
import { SyncSchemaMismatchError, SYNC_META_DOC_ID, publishSchemaVersion, readRemoteSchemaVersion } from "../index.js";
import type { Document } from "@docstack/shared";
import { createTestDocStack } from "../../test-utils/docstack";

jest.setTimeout(60000);

/**
 * A remote is just a PouchDB database - DocStack never learns what is behind it.
 * These tests use a second local database for exactly that reason: what the sync layer
 * owns (the filter, the gate, the lifecycle, the convergence state) is transport-
 * independent, so it can be pinned down without a network.
 */
const createRemote = () => {
    const name = `sync-remote-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new PouchDB(name);
};

const destroyRemote = async (remote: PouchDB.Database) => {
    try {
        await remote.destroy();
    } catch {
        // Already gone.
    }
};

const seedTask = async (stack: any, suffix: string | number) => {
    const className = `SyncTask-${suffix}`;
    const classObj = await Class.create(stack, className, "class", "sync test");
    await Attribute.create(classObj, "title", "string", "Title", { mandatory: true });
    const doc = await classObj.addCard({ title: "Replicate me" });
    return { className, docId: (doc as Document)._id as string };
};

describe("stack.sync", () => {
    describe("what crosses the wire", () => {
        it("pushes stack data and keeps DocStack's own documents on the device", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-push");
            const remote = createRemote();
            try {
                const { docId } = await seedTask(stack, Date.now());

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                const all = await remote.allDocs({ include_docs: true });
                const ids = all.rows.map(row => row.id);
                const classes = all.rows.map(row => (row.doc as any)?.["~class"]);

                expect(ids).toContain(docId);

                // The device's own record of itself never leaves it.
                expect(ids).not.toContain("~system");
                expect(ids).not.toContain("~crypto-engine-config");
                expect(ids.filter(id => id.startsWith("_design/"))).toHaveLength(0);
                expect(ids.filter(id => id.startsWith("~lock-"))).toHaveLength(0);

                // Sessions belong to the device that logged in; the patch ledger records
                // what this device applied.
                expect(classes).not.toContain("~UserSession");
                expect(classes).not.toContain("patch");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("still pushes the data model - classes, domains, policies", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-push-model");
            const remote = createRemote();
            try {
                const { className } = await seedTask(stack, Date.now());

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                const all = await remote.allDocs({ include_docs: true });
                const classes = all.rows.map(row => (row.doc as any)?.["~class"]);

                expect(all.rows.map(row => row.id)).toContain(className);
                expect(classes).toContain("class");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("ANDs a caller's filter with the internal one", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-extra-filter");
            const remote = createRemote();
            try {
                const suffix = Date.now();
                const className = `Filtered-${suffix}`;
                const classObj = await Class.create(stack, className, "class", "filter test");
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

                const ids = (await remote.allDocs()).rows.map(row => row.id);
                expect(ids).toContain((shared as Document)._id);
                expect(ids).not.toContain((withheld as Document)._id);
                // The internal filter is still in force alongside it.
                expect(ids).not.toContain("~system");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("filters by class, keeping the data model that makes the replica readable", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-classes-exclude");
            const remote = createRemote();
            try {
                const suffix = Date.now();
                const taskClass = await Class.create(stack, `ClsTask-${suffix}`, "class", "kept");
                const draftClass = await Class.create(stack, `ClsDraft-${suffix}`, "class", "dropped");
                await Attribute.create(taskClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(draftClass, "title", "string", "Title", { mandatory: true });

                const kept = await taskClass.addCard({ title: "Kept" });
                const dropped = await draftClass.addCard({ title: "Dropped" });

                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { exclude: [draftClass.getName()] },
                });
                await handle.waitForConvergence();

                const ids = (await remote.allDocs()).rows.map(row => row.id);
                expect(ids).toContain((kept as Document)._id);
                expect(ids).not.toContain((dropped as Document)._id);

                // The excluded class's *model* still crosses: it is `~class: "class"`, and
                // a remote missing it would not be a readable replica.
                expect(ids).toContain(draftClass.getName());
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("keeps only the named classes when given an allow-list", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-classes-include");
            const remote = createRemote();
            try {
                const suffix = Date.now();
                const taskClass = await Class.create(stack, `OnlyTask-${suffix}`, "class", "kept");
                const otherClass = await Class.create(stack, `OnlyOther-${suffix}`, "class", "dropped");
                await Attribute.create(taskClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(otherClass, "title", "string", "Title", { mandatory: true });

                const kept = await taskClass.addCard({ title: "Kept" });
                const dropped = await otherClass.addCard({ title: "Dropped" });

                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { include: [taskClass.getName()] },
                });
                await handle.waitForConvergence();

                const all = await remote.allDocs({ include_docs: true });
                const ids = all.rows.map(row => row.id);
                const classes = all.rows.map(row => (row.doc as any)?.["~class"]);

                expect(ids).toContain((kept as Document)._id);
                expect(ids).not.toContain((dropped as Document)._id);
                // The data model rides along regardless of the allow-list.
                expect(classes).toContain("class");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("gives a different replication checkpoint to a different class filter", async () => {
            // PouchDB hashes filter.toString() into the checkpoint id. Two configurations
            // sharing one checkpoint would mean changing what you replicate silently
            // resumes from the old position and never backfills.
            const { stack, cleanup } = await createTestDocStack("sync-filter-checkpoint");
            const remote = createRemote();
            try {
                const suffix = Date.now();
                const taskClass = await Class.create(stack, `CkTask-${suffix}`, "class", "task");
                const draftClass = await Class.create(stack, `CkDraft-${suffix}`, "class", "draft");
                await Attribute.create(taskClass, "title", "string", "Title", { mandatory: true });
                await Attribute.create(draftClass, "title", "string", "Title", { mandatory: true });

                await taskClass.addCard({ title: "Task" });
                const draftDoc = await draftClass.addCard({ title: "Draft" });

                const first = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { exclude: [draftClass.getName()] },
                });
                await first.waitForConvergence();

                expect((await remote.allDocs()).rows.map(row => row.id))
                    .not.toContain((draftDoc as Document)._id);

                // Widening the filter has to re-scan history, not resume past it.
                const second = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    classes: { exclude: [] },
                });
                await second.waitForConvergence();

                expect((await remote.allDocs()).rows.map(row => row.id))
                    .toContain((draftDoc as Document)._id);
            } finally {
                stack.cancelSync();
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("replicates everything, internal documents included, when asked to", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-no-filter");
            const remote = createRemote();
            try {
                await seedTask(stack, Date.now());

                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    internalDocs: false,
                    checkSchemaVersion: false,
                });
                await handle.waitForConvergence();

                const ids = (await remote.allDocs()).rows.map(row => row.id);
                expect(ids).toContain("~system");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });
    });

    describe("pulling", () => {
        it("stores documents the authoring path would have rejected", async () => {
            // The peer that wrote these is a build ahead: its classes are not in this
            // device's data model yet. Replication has to land them regardless.
            const { stack, cleanup } = await createTestDocStack("sync-pull");
            const remote = createRemote();
            try {
                const peerDocId = `PeerAuthored-${Date.now()}`;
                await remote.put({
                    _id: peerDocId,
                    "~class": "ClassOnlyOnTheOtherDevice",
                    title: "From the other device",
                    active: true,
                });

                const handle = await stack.sync({ remote: () => remote, direction: "pull", live: false });
                await handle.waitForConvergence();

                const stored = await stack.db.get<any>(peerDocId);
                expect(stored.title).toBe("From the other device");
                expect(handle.getStatus().pulled).toBeGreaterThan(0);
                expect(handle.getStatus().pushed).toBe(0);
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("round-trips a document both ways", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-both");
            const remote = createRemote();
            try {
                const { docId } = await seedTask(stack, Date.now());
                const peerDocId = `Peer-${Date.now()}`;
                await remote.put({ _id: peerDocId, "~class": "PeerClass", active: true });

                const handle = await stack.sync({ remote: () => remote, direction: "both", live: false });
                await handle.waitForConvergence();

                expect((await remote.allDocs()).rows.map(row => row.id)).toContain(docId);
                await expect(stack.db.get(peerDocId)).resolves.toBeTruthy();
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });
    });

    describe("the schema gate", () => {
        it("records this device's schema version on a fresh remote", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-schema-publish");
            const remote = createRemote();
            try {
                expect(await readRemoteSchemaVersion(remote)).toBeNull();

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                expect(await readRemoteSchemaVersion(remote)).toBe(stack.schemaVersion);

                // It is a `_local/` document: shared by every device on that remote, and
                // never replicated into anybody's stack.
                const meta = await remote.get<any>(SYNC_META_DOC_ID);
                expect(meta.schemaVersion).toBe(stack.schemaVersion);
                expect(meta.updatedAt).toEqual(expect.any(Number));
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("refuses to start against a remote written by a newer schema", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-schema-ahead");
            const remote = createRemote();
            try {
                await publishSchemaVersion(remote, "99.0.0", "99.0.0");

                await expect(stack.sync({ remote: () => remote, direction: "pull", live: false }))
                    .rejects.toBeInstanceOf(SyncSchemaMismatchError);

                const status = stack.getSyncStatus();
                expect(status?.state).toBe("error");
                expect(status?.lastError?.name).toBe("SyncSchemaMismatchError");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("starts against a remote written by an older schema", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-schema-behind");
            const remote = createRemote();
            try {
                await publishSchemaVersion(remote, "0.0.1", "0.0.1");

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                // Pushing newer data bumps the marker so the next device sees it.
                expect(await readRemoteSchemaVersion(remote)).toBe(stack.schemaVersion);
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("can be turned off", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-schema-off");
            const remote = createRemote();
            try {
                await publishSchemaVersion(remote, "99.0.0", "99.0.0");

                const handle = await stack.sync({
                    remote: () => remote,
                    direction: "push",
                    live: false,
                    checkSchemaVersion: false,
                });
                await handle.waitForConvergence();

                expect(handle.getStatus().lastConvergedAt).toEqual(expect.any(Number));
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });
    });

    describe("lifecycle and status", () => {
        it("reports convergence rather than mere activity", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-status");
            const remote = createRemote();
            try {
                await seedTask(stack, Date.now());

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });

                const statuses: string[] = [];
                handle.addEventListener("status", (event) => {
                    statuses.push((event as CustomEvent).detail.state);
                });

                const converged = await handle.waitForConvergence();

                expect(converged.state).toBe("idle");
                expect(converged.lastConvergedAt).toEqual(expect.any(Number));
                expect(converged.pushed).toBeGreaterThan(0);
                expect(converged.stack).toBe(stack.name);
                expect(statuses).toContain("idle");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("re-announces status on the stack, so a consumer need not hold the handle", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-status-on-stack");
            const remote = createRemote();
            try {
                const seen: any[] = [];
                stack.addEventListener("sync-status", (event) => {
                    seen.push((event as CustomEvent).detail);
                });

                const handle = await stack.sync({ remote: () => remote, direction: "push", live: false });
                await handle.waitForConvergence();

                expect(seen.length).toBeGreaterThan(0);
                expect(seen[seen.length - 1].stack).toBe(stack.name);
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("stops when the stack closes", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-close");
            const remote = createRemote();
            try {
                const handle = await stack.sync({ remote: () => remote, direction: "push", live: true });
                expect(handle.getStatus().state).not.toBe("stopped");

                stack.close();

                expect(handle.getStatus().state).toBe("stopped");
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("replaces a previous replication rather than running two", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-replace");
            const remote = createRemote();
            try {
                const first = await stack.sync({ remote: () => remote, direction: "push", live: true });
                const second = await stack.sync({ remote: () => remote, direction: "push", live: true });

                expect(first.getStatus().state).toBe("stopped");
                expect(stack.getSyncHandle()).toBe(second);
            } finally {
                stack.cancelSync();
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("re-resolves the remote on restart, which is how a refreshed token gets in", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-restart");
            const remote = createRemote();
            try {
                let resolutions = 0;
                const handle = await stack.sync({
                    remote: () => {
                        resolutions += 1;
                        return remote;
                    },
                    direction: "push",
                    live: false,
                });
                await handle.waitForConvergence();
                const convergedAt = handle.getStatus().lastConvergedAt;

                await handle.restart();
                await handle.waitForConvergence();

                expect(resolutions).toBe(2);
                // Counters and timestamps survive the restart.
                expect(handle.getStatus().lastConvergedAt).toBeGreaterThanOrEqual(convergedAt as number);
            } finally {
                stack.cancelSync();
                await destroyRemote(remote);
                await cleanup();
            }
        });

        it("accepts a database instance as well as a resolver", async () => {
            const { stack, cleanup } = await createTestDocStack("sync-remote-instance");
            const remote = createRemote();
            try {
                const handle = await stack.sync({ remote, direction: "push", live: false });
                await handle.waitForConvergence();
                expect(handle.getRemote()).toBe(remote);
            } finally {
                await destroyRemote(remote);
                await cleanup();
            }
        });
    });
});

describe("docstack.sync", () => {
    it("starts one replication per stack from a single call", async () => {
        const { docStack, stack, stackName, cleanup } = await createTestDocStack("sync-fleet");
        const remotes = new Map<string, PouchDB.Database>();
        const secondName = `${stackName}-second`;

        try {
            await docStack.addStack({ name: secondName });

            const handle = await docStack.sync({
                remote: (target) => {
                    const remote = createRemote();
                    remotes.set(target.name, remote);
                    return remote;
                },
                direction: "push",
                live: false,
            });

            expect(handle.handles.size).toBe(2);
            expect([...handle.handles.keys()]).toEqual(expect.arrayContaining([stackName, secondName]));

            await Promise.all([...handle.handles.values()].map(h => h.waitForConvergence()));

            const status = handle.getStatus();
            expect(Object.keys(status)).toHaveLength(2);
            expect(handle.getLastConvergedAt()).toEqual(expect.any(Number));

            handle.cancel();
            for (const stackHandle of handle.handles.values()) {
                expect(stackHandle.getStatus().state).toBe("stopped");
            }
        } finally {
            for (const remote of remotes.values()) await destroyRemote(remote);
            await docStack.removeStack(secondName, { destroy: true });
            await cleanup();
        }
    });

    it("narrows to named stacks", async () => {
        const { docStack, stackName, cleanup } = await createTestDocStack("sync-fleet-subset");
        const remote = createRemote();
        const secondName = `${stackName}-second`;

        try {
            await docStack.addStack({ name: secondName });

            const handle = await docStack.sync({
                remote: () => remote,
                direction: "push",
                live: false,
                stacks: [secondName],
            });

            expect([...handle.handles.keys()]).toEqual([secondName]);
            handle.cancel();
        } finally {
            await destroyRemote(remote);
            await docStack.removeStack(secondName, { destroy: true });
            await cleanup();
        }
    });
});

describe("docstack.addStack / removeStack", () => {
    it("opens a stack after startup and hands back the same instance on a repeat call", async () => {
        const { docStack, stackName, cleanup } = await createTestDocStack("add-stack");
        const secondName = `${stackName}-late`;
        try {
            const added = await docStack.addStack({ name: secondName });
            expect(added.name).toBe(secondName);
            expect(docStack.getStack(secondName)).toBe(added);

            expect(await docStack.addStack({ name: secondName })).toBe(added);
            expect(docStack.getStacks().filter(s => s.name === secondName)).toHaveLength(1);
        } finally {
            await docStack.removeStack(secondName, { destroy: true });
            await cleanup();
        }
    });

    it("announces additions and removals", async () => {
        const { docStack, stackName, cleanup } = await createTestDocStack("stack-events");
        const secondName = `${stackName}-announced`;
        const events: string[] = [];

        docStack.addEventListener("stack-added", () => events.push("added"));
        docStack.addEventListener("stack-removed", () => events.push("removed"));

        try {
            await docStack.addStack({ name: secondName });
            expect(events).toContain("added");

            expect(await docStack.removeStack(secondName, { destroy: true })).toBe(true);
            expect(events).toContain("removed");
            expect(docStack.getStack(secondName)).toBeUndefined();

            expect(await docStack.removeStack(secondName)).toBe(false);
        } finally {
            await cleanup();
        }
    });
});
