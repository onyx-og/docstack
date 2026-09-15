import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { RemoteStack, StackLockedError } from "@docstack/client";
import { startServer, login, waitFor } from "./harness.mjs";

/**
 * Online mode (spec 03 §3.1, §4, §8): a thin RemoteStack against the node, every
 * request under an engine session decided by the authority's mathematics. Two
 * principals read different plaintext from the same document; a write into a scope
 * the session does not open refuses with the engine's own error; the pipeline runs on
 * the host with the session in its triggers; the feed is narrowed like a read; a
 * stack the grant does not name is 404; model writes are a grant.
 */
let node;
let alice;
let bob;

before(async () => {
    node = await startServer();
    // Seeded by the host itself, with no session: nobody is attributed.
    const host = node.server.registry.get("payroll").stack;
    const salary = await host.getClass("Salary");
    alice = await salary.addCard({ who: "alice", amount: "100000", "~scope": "hr" });
    bob = await salary.addCard({ who: "bob", amount: "200000", "~scope": "fin" });
});

after(async () => {
    await node.close();
});

const connectAs = async (username, password, stack = "payroll") => {
    const session = await login(node.url, username, password);
    assert.equal(session.status, 200, `login as ${username}`);
    const remote = await RemoteStack.connect({ name: stack, url: `${node.url}/s/${stack}`, token: session.body.token });
    return { remote, session: session.body };
};

test("two principals read different plaintext from the same documents", async () => {
    const carol = await connectAs("carol", "carol-pw");
    const dave = await connectAs("dave", "dave-pw");
    try {
        const carolRows = (await carol.remote.query("SELECT who, amount FROM Salary ORDER BY who")).rows;
        const daveRows = (await dave.remote.query("SELECT who, amount FROM Salary ORDER BY who")).rows;
        assert.deepEqual(carolRows, [{ who: "alice", amount: "100000" }, { who: "bob", amount: null }]);
        assert.deepEqual(daveRows, [{ who: "alice", amount: null }, { who: "bob", amount: "200000" }]);

        const sealedPredicate = (await carol.remote.query("SELECT who FROM Salary WHERE amount = ?", "200000")).rows;
        assert.equal(sealedPredicate.length, 0, "a predicate on a sealed attribute sees null");

        const found = await carol.remote.findDocuments({ "~class": { $eq: "Salary" } });
        const byWho = Object.fromEntries(found.docs.map((doc) => [doc.who, doc]));
        assert.equal(byWho.alice.amount, "100000");
        assert.equal(byWho.bob.amount, null);
        assert.equal(byWho.bob["~scope"], "fin", "unsealed fields read as written");
        assert.equal(byWho.alice.stampedBy, "nobody", "seeded by the host with no session");

        const one = await carol.remote.getDocument(bob._id);
        assert.equal(one?.amount, null);
        assert.equal(one?.who, "bob");
    } finally {
        carol.remote.close();
        dave.remote.close();
    }
});

test("writes run the host pipeline under the session: attribution, triggers, refusal outside the entitlement", async () => {
    const carol = await connectAs("carol", "carol-pw");
    const dave = await connectAs("dave", "dave-pw");
    try {
        const salary = await carol.remote.getClass("Salary");
        assert.ok(salary, "a Class built from the remote stack");
        const erin = await salary.addCard({ who: "erin", amount: "2", "~scope": "hr" });
        assert.equal(erin.who, "erin");
        assert.equal(erin.stampedBy, "carol", "the before-trigger saw the session");

        const host = node.server.registry.get("payroll").stack;
        const stored = (await host.findDocuments({ "~class": { $eq: "Salary" }, who: { $eq: "erin" } })).docs[0];
        assert.equal(stored["~createdBy"], "carol");
        assert.equal(stored["~updatedBy"], "carol");
        assert.equal(stored.amount, "2", "the host reads with the whole keyring");

        await assert.rejects(
            () => salary.addCard({ who: "frank", amount: "3", "~scope": "fin" }),
            (error) => error instanceof StackLockedError && error.scopeId === "fin",
            "a write into a scope the session does not open refuses with the engine's error",
        );

        const updated = await dave.remote.createDoc(bob._id, "Salary", salary, { ...(await dave.remote.getDocument(bob._id)), amount: "250000" });
        assert.equal(updated.amount, "250000");
        const bobStored = (await host.findDocuments({ "~class": { $eq: "Salary" }, who: { $eq: "bob" } })).docs[0];
        assert.equal(bobStored["~updatedBy"], "dave");
        assert.equal(bobStored["~createdBy"], undefined, "seeded with no session, so no creator");

        await assert.rejects(() => carol.remote.deleteDocument(bob._id), (error) => error instanceof StackLockedError);
        assert.equal(await carol.remote.deleteDocument(alice._id), true);
        assert.equal((await host.findDocuments({ "~class": { $eq: "Salary" }, who: { $eq: "alice" } })).docs.length, 0, "soft-deleted");
    } finally {
        carol.remote.close();
        dave.remote.close();
    }
});

test("the feed is narrowed like a read, and catches up from a sequence", async () => {
    const carol = await connectAs("carol", "carol-pw");
    try {
        const target = new EventTarget();
        const events = [];
        target.addEventListener("doc", (event) => events.push(event.detail));
        const subscription = carol.remote.subscribeClassDocs("Salary", target);

        const host = node.server.registry.get("payroll").stack;
        const salary = await host.getClass("Salary");
        await waitFor(() => true, 10);
        await salary.addCard({ who: "gina", amount: "4", "~scope": "fin" });
        await salary.addCard({ who: "hank", amount: "5", "~scope": "hr" });
        await waitFor(() => events.filter((e) => ["gina", "hank"].includes(e.doc?.who)).length === 2, 8000);
        const byWho = Object.fromEntries(events.filter((e) => e.doc).map((e) => [e.doc.who, e]));
        assert.equal(byWho.gina.doc.amount, null, "sealed to carol on the feed too");
        assert.equal(byWho.hank.doc.amount, "5");
        assert.equal(byWho.hank.class, "Salary");
        assert.ok(byWho.hank.seq !== undefined);
        carol.remote.releaseListener(subscription);
    } finally {
        carol.remote.close();
    }
});

test("reachability: an ungranted stack is 404, a missing principal is 401, model writes are a grant", async () => {
    const carol = await connectAs("carol", "carol-pw");
    try {
        await assert.rejects(
            () => RemoteStack.connect({ name: "secret", url: `${node.url}/s/secret`, token: carol.session.token }),
            (error) => error.status === 404,
            "a configured stack the grant does not name is indistinguishable from a missing one",
        );
        await assert.rejects(
            () => RemoteStack.connect({ name: "payroll", url: `${node.url}/s/payroll` }),
            (error) => error.status === 401,
        );
        const noteModel = {
            _id: "Note", "~class": "class", name: "Note", description: "Notes", active: true,
            schema: { text: { name: "text", type: "string", config: { mandatory: true } } }, triggers: [],
        };
        const denied = await fetch(`${node.url}/s/payroll/_ds/classes`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${carol.session.token}` }, body: JSON.stringify({ model: noteModel }),
        });
        assert.equal(denied.status, 403, "carol is not an admin");

        const admin = await connectAs("admin", "admin-pw");
        try {
            const allowed = await fetch(`${node.url}/s/payroll/_ds/classes`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.session.token}` }, body: JSON.stringify({ model: noteModel }),
            });
            assert.equal(allowed.status, 200);
            const names = await admin.remote.getClassNames();
            assert.ok(names.includes("Note"));
            const note = await admin.remote.getClass("Note");
            const written = await note.addCard({ text: "hello" });
            assert.equal(written.text, "hello");
        } finally {
            admin.remote.close();
        }
    } finally {
        carol.remote.close();
    }
});

test("health reports the open stacks", async () => {
    const response = await fetch(`${node.url}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.ok(body.stacks.payroll);
    assert.equal(body.stacks.payroll.blind, false);
});
