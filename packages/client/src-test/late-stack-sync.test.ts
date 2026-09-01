import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0033.
 *
 * `DocStack.sync()` read `this.stacks` once and built the handle from that snapshot.
 * A stack added afterwards was outside replication for the lifetime of the handle,
 * and every signal said things were fine: the handle was healthy, `getStatus()` just
 * had no key for the missing stack, and a missing key reads as "nothing to say".
 * A consumer found it as a workspace database that had replicated nothing for two
 * days while the root database replicated normally over the same connection.
 *
 * The shape that triggers it is the one the library's own design encourages - a
 * workspace registry lives in one database and names the others, so whether the
 * workspace stack mounts before or after `sync()` is a boot-order coin toss.
 */
describe("late stacks join a running sync", () => {
    it("a stack added after sync() replicates like one that was there", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "late-sync-root",
            username: "late-user1",
            password: "late-pass1",
            evaluate: async ({ docStack }) => {
                const PouchDB = (window as any).PouchDB;
                const suffix = Date.now();
                const remotes: Record<string, any> = {};
                const remoteFor = (stack: any) => {
                    remotes[stack.name] = remotes[stack.name] || new PouchDB(`remote-${stack.name}-${suffix}`);
                    return remotes[stack.name];
                };

                // 1. Replication starts with only the root stack open - step 2 of the
                // boot sequence in the finding.
                const handle = await docStack.sync({ remote: remoteFor, direction: "push", live: false });
                const boundAtStart = handle.names;

                // 2. The workspace registry is read and its stack mounts - step 3,
                // losing the coin toss.
                const ws = await docStack.addStack({ name: `late-ws-${suffix}` });

                // 3. The late stack must already be part of the same handle by the
                // time addStack resolves.
                const boundAfterAdd = handle.names;
                const statusKeys = Object.keys(handle.getStatus());
                const coverage = docStack.getSyncCoverage();

                // 4. And it must actually carry data: a document written to the late
                // stack reaches the late stack's own remote.
                const wsHandle = handle.handles.get(ws.name);
                let docArrived = false;
                if (wsHandle) {
                    const { Class, Attribute } = (window as any).docstack;
                    await ws.authenticate({ username: "system", password: "system" });
                    const probe = await Class.create(ws, "Probe", "class", "late-bind probe");
                    await Attribute.create(probe, "value", "string", "Value", { mandatory: true });
                    const doc = await probe.addCard({ value: "made it" });
                    await wsHandle.restart(); // push, non-live: re-run to pick up the write
                    await wsHandle.waitForConvergence();
                    const all = await remotes[ws.name].allDocs();
                    docArrived = all.rows.some((row: any) => row.id === doc._id);
                }

                return {
                    wsName: ws.name,
                    boundAtStart,
                    boundAfterAdd,
                    statusKeys,
                    coverage,
                    docArrived,
                };
            },
        });

        expect(result.boundAtStart).not.toContain(result.wsName);
        expect(result.boundAfterAdd).toContain(result.wsName);
        expect(result.statusKeys).toContain(result.wsName);
        expect(result.coverage.unbound).toEqual([]);
        expect(result.coverage.bound).toContain(result.wsName);
        expect(result.docArrived).toBe(true);
    });

    it("an explicit stacks list keeps its meaning: named three, bound three", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "late-sync-scoped",
            username: "late-user2",
            password: "late-pass2",
            evaluate: async ({ docStack, stackName }) => {
                const PouchDB = (window as any).PouchDB;
                const suffix = Date.now();
                const remoteFor = (stack: any) => new PouchDB(`remote-${stack.name}-${suffix}`);

                // A caller who named the stacks asked for exactly those.
                const handle = await docStack.sync({
                    remote: remoteFor, direction: "push", live: false,
                    stacks: [stackName],
                });
                const late = await docStack.addStack({ name: `late-scoped-${suffix}` });

                return {
                    lateName: late.name,
                    bound: handle.names,
                    unbound: docStack.getSyncCoverage().unbound,
                };
            },
        });

        expect(result.bound).not.toContain(result.lateName);
        // ...and the gap is now visible instead of silent.
        expect(result.unbound).toContain(result.lateName);
    });

    it("a stack added after cancelSync() stays out", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "late-sync-cancelled",
            username: "late-user3",
            password: "late-pass3",
            evaluate: async ({ docStack }) => {
                const PouchDB = (window as any).PouchDB;
                const suffix = Date.now();
                const handle = await docStack.sync({
                    remote: (stack: any) => new PouchDB(`remote-${stack.name}-${suffix}`),
                    direction: "push", live: false,
                });
                docStack.cancelSync();

                const late = await docStack.addStack({ name: `late-cancelled-${suffix}` });
                return { lateName: late.name, bound: handle.names };
            },
        });

        // The rest of the handle was just stopped; a newcomer must not start
        // replicating into it alone.
        expect(result.bound).not.toContain(result.lateName);
    });

    it("removeStack drops the stack from the handle", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "late-sync-removed",
            username: "late-user4",
            password: "late-pass4",
            evaluate: async ({ docStack }) => {
                const PouchDB = (window as any).PouchDB;
                const suffix = Date.now();
                const handle = await docStack.sync({
                    remote: (stack: any) => new PouchDB(`remote-${stack.name}-${suffix}`),
                    direction: "push", live: false,
                });

                const ws = await docStack.addStack({ name: `late-removed-${suffix}` });
                const boundBefore = handle.names.includes(ws.name);
                await docStack.removeStack(ws.name);

                return {
                    boundBefore,
                    boundAfter: handle.names.includes(ws.name),
                    statusKeys: Object.keys(handle.getStatus()),
                    wsName: ws.name,
                };
            },
        });

        expect(result.boundBefore).toBe(true);
        expect(result.boundAfter).toBe(false);
        expect(result.statusKeys).not.toContain(result.wsName);
    });
});
