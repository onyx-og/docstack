import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * The hub picture (ADR-0029/0030) on the real platform: two full DocStack stacks in one
 * page, replicating over an actual `MessageChannel` - not the Node suite's loopback.
 * One stack plays the hub and only *hosts* (`serveChannel` over its replication
 * handle); the other drives `stack.sync` against a channel remote, exactly the
 * app-origin role. Covers what only a browser can: MessagePort delivery, structured
 * clone, the schema gate's `_local` round trip, and key distribution over the port.
 */
describe("channel hub", () => {
    it("ADR-0030: a stack syncs with a hub stack over a real MessageChannel", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "channel-app",
            username: "channel-user",
            password: "channel-pass",
            evaluate: async ({ docStack, stack }) => {
                const { Class } = (window as any).docstack;
                const channel = (window as any).docstackChannel;
                const PouchCtor = (window as any).PouchDB;

                // The hub realm: a full stack of its own, patches applied by itself -
                // which is what makes the seeded-documents rule hold across the port.
                const hub = await docStack.addStack({ name: "channel-hub" });

                PouchCtor.plugin(channel.ChannelPlugin());
                const mc = new MessageChannel();
                const server = channel.serveChannel(
                    hub.getReplicationHandle(),
                    channel.createMessagePortTransport(mc.port1),
                    { documentKey: "d".repeat(64) }
                );
                const remote = new PouchCtor("channel-hub-remote", {
                    adapter: "channel",
                    channel: channel.createMessagePortTransport(mc.port2),
                });

                // Key distribution over the real port, before any replication.
                const key = await channel.requestDocumentKey(remote);

                // Something to move: one content class, one card, authored app-side.
                const cls = await Class.create(stack, "HubNote", "class", "Notes", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const card = await cls.addCard({ title: "over-the-port" });

                const sync = await stack.sync({ remote: () => remote, live: false });
                const status = await sync.waitForConvergence(20000);

                const hubDocs = await hub.db.allDocs({ include_docs: true });
                const hubIds = hubDocs.rows.map((r: any) => r.id);
                const marker = await hub.db
                    .get("_local/docstack-sync")
                    .catch(() => null);

                sync.cancel();
                await remote.close();
                server.close();

                return {
                    key,
                    state: status.state,
                    pushed: status.pushed,
                    cardArrived: hubIds.includes(card._id),
                    classModelArrived: hubIds.includes("HubNote"),
                    // The schema gate wrote its marker through the channel's
                    // `_putLocal` forwarding - the `_local` round trip only a real
                    // port proves.
                    markerVersion: (marker as any)?.schemaVersion ?? null,
                    localVersion: stack.schemaVersion,
                    // The hub seeded itself by patching; the port must not have
                    // re-delivered what every client derives (ADR-0024).
                    seededSystemArrived: hubIds.includes("system"),
                };
            },
        });

        expect(result.key).toBe("d".repeat(64));
        expect(result.state).toBe("idle");
        expect(result.pushed).toBeGreaterThan(0);
        expect(result.cardArrived).toBe(true);
        expect(result.classModelArrived).toBe(true);
        expect(result.markerVersion).toBe(result.localVersion);
        // Seeded on both ends independently, so it must not travel - but it exists on
        // the hub because the hub patched itself.
        expect(result.seededSystemArrived).toBe(true);
    });

    it("ADR-0030: live changes follow the hub through the port", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "channel-live-app",
            username: "channel-user2",
            password: "channel-pass2",
            evaluate: async ({ docStack, stack }) => {
                const channel = (window as any).docstackChannel;
                const PouchCtor = (window as any).PouchDB;

                const hub = await docStack.addStack({ name: "channel-live-hub" });

                PouchCtor.plugin(channel.ChannelPlugin());
                const mc = new MessageChannel();
                const server = channel.serveChannel(
                    hub.getReplicationHandle(),
                    channel.createMessagePortTransport(mc.port1)
                );
                const remote = new PouchCtor("channel-live-remote", {
                    adapter: "channel",
                    channel: channel.createMessagePortTransport(mc.port2),
                });

                const sync = await stack.sync({ remote: () => remote, live: true, retry: false });
                await sync.waitForConvergence(20000);

                // A hub-side write after convergence reaches the app only through the
                // live subscription - the host→driver push half of ADR-0030 §4. An
                // untyped document on purpose: no class to author against, and the
                // replication filter abstains on classless docs.
                await hub.db.put({ _id: "hub-live-1", n: 1 });

                const deadline = Date.now() + 15000;
                let arrived = false;
                while (Date.now() < deadline) {
                    arrived = await stack.db.get("hub-live-1").then(() => true, () => false);
                    if (arrived) break;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                const openSubscriptions = server.subscriptionCount();
                sync.cancel();
                await remote.close();
                server.close();

                return { arrived, openSubscriptions };
            },
        });

        expect(result.arrived).toBe(true);
        expect(result.openSubscriptions).toBeGreaterThan(0);
    });
});
