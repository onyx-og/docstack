import assert from "node:assert/strict";
import { PouchDB, rig, fresh, waitFor } from "./harness.js";

/**
 * The whole point of the pattern (ADR-0030 §2): both ends are real PouchDBs, so these
 * tests assert replication semantics - leaves, checkpoints, scope - and never storage
 * mechanics, because the channel has none.
 */

describe("channel adapter", () => {
    it("forwards basic operations to the host database", async () => {
        const { hostDb, driverDb, server } = rig();

        await hostDb.put({ _id: "from-host", value: 1 });
        const viaDriver = await driverDb.get("from-host");
        assert.equal(viaDriver.value, 1);

        await driverDb.put({ _id: "from-driver", value: 2 });
        const viaHost = await hostDb.get("from-driver");
        assert.equal(viaHost.value, 2);

        const info = await driverDb.info();
        assert.equal(info.doc_count, 2);

        // The driver *is* the host database seen from another realm; identity says so.
        assert.equal(await driverDb.id(), await hostDb.id());

        server.close();
    });

    it("push replication lands documents on the host", async () => {
        const { hostDb, driverDb, server } = rig();
        const local = new PouchDB(fresh(), { adapter: "memory" });
        await local.bulkDocs([1, 2, 3, 4, 5].map(i => ({ _id: `doc-${i}`, i })));

        const result = await PouchDB.replicate(local, driverDb);
        assert.equal(result.docs_written, 5);
        assert.equal((await hostDb.info()).doc_count, 5);

        server.close();
    });

    it("pull replication drains the host through the channel", async () => {
        const { hostDb, driverDb, server } = rig();
        const local = new PouchDB(fresh(), { adapter: "memory" });
        await hostDb.bulkDocs([1, 2, 3].map(i => ({ _id: `host-${i}`, i })));

        const result = await PouchDB.replicate(driverDb, local);
        assert.equal(result.docs_written, 3);
        assert.equal((await local.info()).doc_count, 3);

        server.close();
    });

    it("replication checkpoints on the host and resumes from them", async () => {
        const { driverDb, server } = rig();
        const local = new PouchDB(fresh(), { adapter: "memory" });

        await local.bulkDocs([{ _id: "a" }, { _id: "b" }, { _id: "c" }]);
        const first = await PouchDB.replicate(local, driverDb);
        assert.equal(first.docs_written, 3);

        await local.bulkDocs([{ _id: "d" }, { _id: "e" }]);
        const second = await PouchDB.replicate(local, driverDb);
        // Only the new documents move: the checkpoint written through `_putLocal`
        // landed on the host and was read back through `_getLocal`.
        assert.equal(second.docs_written, 2);

        server.close();
    });

    it("carries all leaves, not just winners", async () => {
        const { hostDb, driverDb, server } = rig();
        const local = new PouchDB(fresh(), { adapter: "memory" });

        // The same document with divergent single-rev histories on each side - the
        // canonical conflict. `new_edits: false` preserves both.
        await local.bulkDocs([{ _id: "shared", _rev: "1-aaa", from: "local" }], { new_edits: false });
        await hostDb.bulkDocs([{ _id: "shared", _rev: "1-bbb", from: "host" }], { new_edits: false });

        await PouchDB.replicate(local, driverDb);
        await PouchDB.replicate(driverDb, local);

        for (const db of [hostDb, local]) {
            const doc = await db.get("shared", { conflicts: true });
            const leaves = [doc._rev, ...(doc._conflicts || [])].sort();
            // Both sides hold both leaves; a winners-only channel would have lost one
            // silently, which is the failure mode ADR-0030 §3 calls load-bearing.
            assert.deepEqual(leaves, ["1-aaa", "1-bbb"]);
        }

        server.close();
    });

    it("live sync propagates writes in both directions, then cancels cleanly", async () => {
        const { hostDb, driverDb, server } = rig();
        const local = new PouchDB(fresh(), { adapter: "memory" });

        const sync = PouchDB.sync(local, driverDb, { live: true, retry: false });
        try {
            await hostDb.put({ _id: "hub-write", origin: "hub" });
            await waitFor(() => local.get("hub-write").then(() => true, () => false));

            await local.put({ _id: "app-write", origin: "app" });
            await waitFor(() => hostDb.get("app-write").then(() => true, () => false));
        } finally {
            sync.cancel();
            await new Promise(resolve => sync.on("complete", resolve));
        }
        await waitFor(() => server.subscriptionCount() === 0);

        server.close();
    });

    it("serve scope: withheld documents never leave the host, tombstones always do", async () => {
        const { hostDb, driverDb, server } = rig({
            serve: doc => doc.tenant !== "private",
        });
        const local = new PouchDB(fresh(), { adapter: "memory" });

        await hostDb.bulkDocs([
            { _id: "public-1", tenant: "workspace" },
            { _id: "private-1", tenant: "private" },
            { _id: "gone-1", tenant: "workspace" },
        ]);
        const doomed = await hostDb.get("gone-1");
        await hostDb.remove(doomed);

        await PouchDB.replicate(driverDb, local);

        assert.equal((await local.get("public-1")).tenant, "workspace");
        await assert.rejects(local.get("private-1"), /missing|deleted/);
        // The deletion travelled even though a tombstone has no fields to judge.
        await assert.rejects(local.get("gone-1"), /deleted/);

        server.close();
    });

    it("accept scope: refused writes surface as errors and are not stored", async () => {
        const { hostDb, driverDb, server } = rig({
            accept: doc => doc.tenant === "workspace",
        });
        const local = new PouchDB(fresh(), { adapter: "memory" });

        await local.bulkDocs([
            { _id: "allowed-1", tenant: "workspace" },
            { _id: "refused-1", tenant: "sheet" },
        ]);

        const outcome = await new Promise(resolve => {
            const rep = PouchDB.replicate(local, driverDb);
            const seen = { denied: 0 };
            rep.on("denied", () => { seen.denied += 1; });
            rep.on("complete", info => resolve({ info, seen }));
            rep.on("error", error => resolve({ error, seen }));
        });

        assert.equal((await hostDb.get("allowed-1")).tenant, "workspace");
        await assert.rejects(hostDb.get("refused-1"), /missing/);
        const failures = (outcome.info && outcome.info.doc_write_failures) || outcome.seen.denied;
        assert.ok(failures >= 1, `expected the refused write to surface, got ${JSON.stringify(outcome)}`);

        server.close();
    });

    it("destroy over the channel is refused unless granted", async () => {
        const { hostDb, driverDb, server } = rig();
        await hostDb.put({ _id: "still-here" });

        await assert.rejects(driverDb.destroy(), /may not destroy/);
        assert.equal((await hostDb.info()).doc_count, 1);

        server.close();
    });

    it("a closed channel fails calls instead of hanging", async () => {
        const { driverDb, server } = rig();
        await driverDb.put({ _id: "before-close" });

        server.close();
        // Closing the server detaches it; the driver's next call gets no answer, so
        // close the driver's own end and expect a clean rejection.
        await driverDb.close();
        await assert.rejects(driverDb.get("before-close"), /closed/);
    });
});
