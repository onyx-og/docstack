import assert from "node:assert/strict";
import { requestDocumentKey } from "../lib/index.js";
import { PouchDB, rig, fresh } from "./harness.js";

/**
 * ADR-0030 §8 / work item 4: key distribution rides the channel, gated by the channel.
 *
 * The grant model under test is Decision 6: the channel grant and the key grant are one
 * decision. There is no second entitlement surface to test, and that absence is the
 * design - a host offers the key on a channel it serves, or does not offer one at all.
 */

describe("document key distribution", () => {
    it("a static key crosses the channel", async () => {
        const { driverDb, server } = rig({ documentKey: "a".repeat(64) });
        assert.equal(await requestDocumentKey(driverDb), "a".repeat(64));
        server.close();
    });

    it("a provider function is resolved per request, so a late unlock is seen", async () => {
        // The hub pattern: the provider reads the serving realm's key state at call
        // time, the way `() => stack.cryptoEngine.getDocumentKey()` would.
        let currentKey = null;
        const { driverDb, server } = rig({ documentKey: async () => currentKey });

        // Locked hub: configured but keyless answers exactly like not-offered.
        await assert.rejects(requestDocumentKey(driverDb), error => {
            assert.equal(error.name, "no_key");
            assert.equal(error.status, 404);
            return true;
        });

        currentKey = "b".repeat(64);
        assert.equal(await requestDocumentKey(driverDb), "b".repeat(64));
        server.close();
    });

    it("a host with no key configured answers no_key, and replication still works", async () => {
        const { hostDb, driverDb, server } = rig();

        await assert.rejects(requestDocumentKey(driverDb), error => error.status === 404);

        // The unencrypted path is untouched: no key on offer is not an error state.
        const local = new PouchDB(fresh(), { adapter: "memory" });
        await hostDb.put({ _id: "plain-1" });
        await PouchDB.replicate(driverDb, local);
        assert.ok(await local.get("plain-1"));
        server.close();
    });

    it("the key grant dies with the channel grant", async () => {
        const { driverDb, server } = rig({ documentKey: "c".repeat(64) });
        assert.equal(await requestDocumentKey(driverDb), "c".repeat(64));

        // One decision (ADR-0030 Decision 6): closing the channel revokes both grants
        // at once - there is no residual key entitlement to leak.
        server.close();
        await driverDb.close();
        await assert.rejects(requestDocumentKey(driverDb), /closed/);
    });

    it("refuses databases that are not channel databases", async () => {
        const plain = new PouchDB(fresh(), { adapter: "memory" });
        await assert.rejects(requestDocumentKey(plain), /channel/);
        await plain.destroy();
    });
});
