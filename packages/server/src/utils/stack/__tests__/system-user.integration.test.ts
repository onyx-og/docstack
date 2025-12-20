import memoryAdapter from "pouchdb-adapter-memory";

class FakePouchDB {
    docs = new Map<string, any>();

    static plugin = jest.fn();

    constructor() {
        return this;
    }

    info = jest.fn(async () => ({}));

    changes = jest.fn(() => ({ on: () => ({ cancel: jest.fn() }) }));

    bulkDocs = jest.fn(async (docs: any[]) => {
        docs.forEach((doc) => {
            const stored = { ...doc };
            if (!stored._rev) {
                stored._rev = "1";
            }
            this.docs.set(stored._id, stored);
        });
        return { ok: true };
    });

    get = jest.fn(async (id: string) => {
        const doc = this.docs.get(id);
        if (!doc) {
            const err: any = new Error("not_found");
            err.name = "not_found";
            throw err;
        }
        return doc;
    });

    put = jest.fn(async (doc: any) => {
        const stored = { ...doc };
        if (!stored._rev) {
            stored._rev = "1";
        }
        this.docs.set(stored._id, stored);
        return { ok: true, id: stored._id, rev: stored._rev };
    });

    allDocs = jest.fn(async () => ({ rows: Array.from(this.docs.values()).map((doc) => ({ doc })) }));

    destroy = jest.fn(async () => { this.docs.clear(); });
}

(global as any).Worker = class {
    terminate = jest.fn();
    postMessage = jest.fn();
};

jest.mock("pouchdb-node", () => {
    const MockClass: any = function () {
        return new FakePouchDB();
    };
    MockClass.plugin = jest.fn();
    return { __esModule: true, default: MockClass };
});

jest.mock("pouchdb-find", () => ({ __esModule: true, default: jest.fn() }));

const loggerStub: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
loggerStub.child = jest.fn(() => loggerStub);

jest.mock("../../logger/", () => ({
    __esModule: true,
    default: () => loggerStub,
    serverLogger: loggerStub,
}));

jest.mock("../../crypto", () => ({
    __esModule: true,
    decryptString: jest.fn(),
}));

jest.mock("@docstack/client/src/core/datamodel/index.js", () => ({
    __esModule: true,
    getSystemPatches: () => [{
        _id: "~sys-test",
        "~class": "patch",
        version: "0.0.1",
        target: "system",
        changelog: "Test patch",
        docs: [
            {
                _id: "system",
                "~class": "~User",
                groupId: ["Group-Admin"],
            },
        ],
    }],
}));

jest.mock("../../../plugins/pouchdb", () => ({
    StackPlugin: () => () => ({}),
}));

import Stack from "../index.js";

const originalPatchCount = process.env.PATCH_COUNT;

describe("Server stack system patches", () => {
    afterEach(async () => {
        process.env.PATCH_COUNT = originalPatchCount;
    });

    it("seeds the system user with the admin group when PATCH_COUNT is absent", async () => {
        delete process.env.PATCH_COUNT;
        const stackName = `server-system-${Date.now()}`;

        const stack = await Stack.create(`db-${stackName}`, {
            plugins: [memoryAdapter],
        });

        try {
            const systemUser = await (stack as any).db.get("system") as { "~class": string; groupId: string[] };
            expect(systemUser["~class"]).toBe("~User");
            expect(Array.isArray(systemUser.groupId)).toBe(true);
            expect(systemUser.groupId).toContain("Group-Admin");
        } finally {
            stack.close();
            await (stack as any).db.destroy();
        }
    });
});
