import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PouchDB from "pouchdb";
import memoryAdapter from "pouchdb-adapter-memory";
// Under Node the package's `node` export condition resolves to lib/node.js, which
// registers `pouchdb` as the engine's constructor. No shim, no browser bundle.
import { ClientStack, Class, setDefaultLogLevel } from "@docstack/client";

/**
 * The engine on a host (spec 03 §7): `@docstack/client` unchanged, under Node 22, on
 * the memory adapter and on LevelDB, replicating between two in-process stacks. This is
 * the premise every later phase builds on, pinned before any HTTP exists.
 */

PouchDB.plugin(memoryAdapter);
setDefaultLogLevel("silent");

const KEY = "0".repeat(64);
const NOTE_SCHEMA = { title: { name: "title", type: "string", config: { mandatory: true } } };
const fresh = (prefix) => `db-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test("a ClientStack opens on the memory adapter, applies the system patches, writes and queries", async () => {
    const stack = await ClientStack.create(fresh("mem"), { adapter: "memory", documentKey: KEY });
    assert.ok(stack.schemaVersion, "the system patch chain applied on open");
    const note = await Class.create(stack, "Note", "class", "Notes", NOTE_SCHEMA);
    const doc = await note.addCard({ title: "hello" });
    assert.equal(doc.title, "hello");
    const { rows } = await stack.query("SELECT title FROM Note");
    assert.deepEqual(rows, [{ title: "hello" }]);
    stack.close();
    await stack.db.destroy();
});

test("a ClientStack persists on LevelDB in a temporary directory across a reopen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docstack-engine-"));
    const name = fresh("level");
    try {
        const first = await ClientStack.create(name, { prefix: `${dir}/`, documentKey: KEY });
        const note = await Class.create(first, "Note", "class", "Notes", NOTE_SCHEMA);
        const written = await note.addCard({ title: "durable" });
        first.close();

        const second = await ClientStack.create(name, { prefix: `${dir}/`, documentKey: KEY });
        const found = await second.findDocuments({ "~class": { $eq: "Note" } });
        assert.equal(found.docs.length, 1);
        assert.equal(found.docs[0]._id, written._id);
        assert.equal(found.docs[0].title, "durable");
        second.close();
        await second.db.destroy();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("two Node stacks replicate in-process, and the device-local documents stay home", async () => {
    const a = await ClientStack.create(fresh("peer-a"), { adapter: "memory", documentKey: KEY });
    const b = await ClientStack.create(fresh("peer-b"), { adapter: "memory", documentKey: KEY });
    const note = await Class.create(a, "Note", "class", "Notes", NOTE_SCHEMA);
    await note.addCard({ title: "travels" });

    const handle = await a.sync({ remote: () => b.getReplicationHandle(), live: false, retry: false });
    const status = await handle.waitForConvergence(15000);
    assert.equal(status.state, "idle");

    const onB = await b.findDocuments({ "~class": { $eq: "Note" } });
    assert.equal(onB.docs.length, 1);
    assert.equal(onB.docs[0].title, "travels");
    const systemOnB = await b.db.get("~system");
    assert.notEqual(systemOnB.startupTime, (await a.db.get("~system")).startupTime, "~system is device-local");

    a.close(); b.close();
    await a.db.destroy(); await b.db.destroy();
});
