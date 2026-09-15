import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { ClientStack } from "@docstack/client";
import { startServer, login, KEY } from "./harness.mjs";

/**
 * Sessions (spec 03 §6): the node issues from its own store, refuses what it does not
 * know, and hands a replica the attribute key it needs to open exactly the scopes
 * the principal satisfies, decided by the same mathematics the host uses online.
 */
let node;

before(async () => {
    node = await startServer();
});

after(async () => {
    await node.close();
});

test("a session is issued from the credential store and refused otherwise", async () => {
    const ok = await login(node.url, "carol", "carol-pw");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.principal.sub, "carol");
    assert.deepEqual(ok.body.principal.attributes, ["role:hr"]);
    assert.deepEqual(ok.body.stacks, ["payroll"]);
    assert.equal(typeof ok.body.token, "string");
    assert.equal(typeof ok.body.attributeKey, "string");
    assert.match(ok.cookie, /ds_session=/);

    const wrong = await login(node.url, "carol", "nope");
    assert.equal(wrong.status, 401);
    const unknown = await login(node.url, "nobody", "x");
    assert.equal(unknown.status, 401);

    const me = await fetch(`${node.url}/auth/me`, { headers: { Authorization: `Bearer ${ok.body.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).principal.sub, "carol");

    const viaCookie = await fetch(`${node.url}/auth/me`, { headers: { Cookie: ok.cookie.split(";")[0] } });
    assert.equal(viaCookie.status, 200);
    assert.equal((await viaCookie.json()).principal.via, "cookie");

    const basic = await fetch(`${node.url}/auth/me`, { headers: { Authorization: `Basic ${Buffer.from("dave:dave-pw").toString("base64")}` } });
    assert.equal(basic.status, 200);
    assert.deepEqual((await basic.json()).principal.attributes, ["role:fin"]);
});

test("a token signed by someone else is refused", async () => {
    const forged = await new SignJWT({ attributes: ["role:admin"] })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("mallory")
        .setIssuer("docstack-test")
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("a-different-secret-that-is-long-enough"));
    const response = await fetch(`${node.url}/auth/me`, { headers: { Authorization: `Bearer ${forged}` } });
    assert.equal(response.status, 401);
});

test("the attribute key a session returns opens, on a replica, exactly the scopes the principal satisfies", async () => {
    const carol = await login(node.url, "carol", "carol-pw");
    const device = await ClientStack.create(`db-replica-${Date.now()}`, {
        adapter: "memory",
        documentKey: KEY,
        patches: [node.fixture.patch],
        accessKeys: { attributeKey: carol.body.attributeKey },
        logLevel: "silent",
    });
    try {
        assert.equal(device.isScopeLocked("hr"), false, "role:hr opens hr");
        assert.equal(device.isScopeLocked("fin"), true, "and not fin");
    } finally {
        device.close();
        await device.db.destroy();
    }
});
