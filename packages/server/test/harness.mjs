import { setup } from "@docstack/abe";
import { ClientStack, setDefaultLogLevel } from "@docstack/client";
import { createServer } from "../lib/index.js";

setDefaultLogLevel("silent");

export const KEY = "0".repeat(64);
export const JWT_SECRET = "a-test-secret-that-is-long-enough-for-hs256";

/** A payroll stack: two scopes (hr, fin), an encrypted `Salary` class with a before-trigger that records the session's principal, and a plain `Task` class. */
export const buildPayrollFixture = async () => {
    const authority = await setup();
    const hrScope = await ClientStack.buildAccessScope({ scopeId: "hr", policyString: '"role:hr"', pk: authority.pk });
    const finScope = await ClientStack.buildAccessScope({ scopeId: "fin", policyString: '"role:fin"', pk: authority.pk });
    const patch = {
        "~class": "patch",
        _id: "payroll-0.1.0",
        version: "0.1.0",
        target: "payroll",
        changelog: "Scopes, Salary, Task.",
        active: true,
        docs: [
            hrScope,
            finScope,
            {
                _id: "Salary", "~class": "class", name: "Salary", description: "Salaries", active: true,
                schema: {
                    who: { name: "who", type: "string", config: { mandatory: true, primaryKey: true } },
                    amount: { name: "amount", type: "string", config: { mandatory: true, encrypted: true } },
                },
                triggers: [{ name: "stamp-by", order: "before", run: "document.stampedBy = session ? session.principal.sub : 'nobody'; return document;" }],
            },
            {
                _id: "Task", "~class": "class", name: "Task", description: "Tasks", active: true,
                schema: {
                    title: { name: "title", type: "string", config: { mandatory: true } },
                    done: { name: "done", type: "boolean", config: { defaultValue: false } },
                },
                triggers: [],
            },
        ],
    };
    return { authority, patch, hrScope, finScope };
};

/**
 * A node on the memory adapter with an in-memory credential store, the payroll stack
 * and a `secret` stack no grant reaches. Grants: `api` on payroll for everyone with a
 * principal, `documentKey` too; model writes only for `role:admin`.
 */
export const startServer = async (overrides = {}) => {
    const fixture = await buildPayrollFixture();
    const server = await createServer({
        host: "127.0.0.1",
        port: 0,
        storage: { adapter: "memory" },
        keys: { documentKey: KEY },
        authority: fixture.authority,
        stacks: {
            payroll: { patches: [fixture.patch], logLevel: "silent" },
            secret: { logLevel: "silent" },
        },
        auth: { jwt: { secret: JWT_SECRET, issuer: "docstack-test" }, users: true, store: "memory" },
        grant: (principal) => ({
            stacks: {
                payroll: {
                    api: true,
                    documentKey: true,
                    accept: () => principal.attributes.includes("role:admin"),
                },
            },
            attributes: principal.attributes,
            ui: principal.attributes.includes("role:admin"),
        }),
        feed: { heartbeatMs: 500, idleMs: 60_000 },
        logLevel: "silent",
        ...overrides,
    });
    await server.users.add({ username: "carol", password: "carol-pw", attributes: ["role:hr"] });
    await server.users.add({ username: "dave", password: "dave-pw", attributes: ["role:fin"] });
    await server.users.add({ username: "eve", password: "eve-pw", attributes: [] });
    await server.users.add({ username: "admin", password: "admin-pw", attributes: ["role:admin", "role:hr", "role:fin"] });
    const { url } = await server.listen({ port: 0 });
    return { server, url, fixture, close: () => server.close() };
};

/** Logs in through the node's own route and returns the session payload. */
export const login = async (url, username, password) => {
    const response = await fetch(`${url}/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    return { status: response.status, body, cookie: response.headers.get("set-cookie") };
};

export const waitFor = async (predicate, timeoutMs = 5000, stepMs = 25) => {
    const start = Date.now();
    while (!(await predicate())) {
        if (Date.now() - start > timeoutMs) throw new Error("condition not reached in time");
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
};
