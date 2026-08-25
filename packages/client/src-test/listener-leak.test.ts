import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for the `MaxListenersExceededWarning: 11 destroyed listeners added` a consumer
 * sees in the console.
 *
 * PouchDB registers a `destroyed` listener on the database for every
 * `db.changes({ live: true })` and holds it until that feed is cancelled, so the count of
 * those listeners is the count of live feeds. Node warns at eleven.
 *
 * Two things drove it past that: `findDocuments` rebuilt a `Class` per returned document
 * with the cache bypassed, and building a Class subscribes it - so reading five rows
 * opened five feeds that nothing ever closed. Underneath, a feed per watched class meant
 * even a leak-free app crossed the limit once it had ten classes on screen.
 */
describe("changes-feed listener accounting", () => {
    it("reading documents does not open live feeds", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "leak-reads",
            username: "leak-user",
            password: "leak-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const count = () => ({
                    tracked: stack.listeners.length,
                    // The number PouchDB is counting when it warns.
                    destroyed: (stack.db as any).listenerCount?.("destroyed") ?? -1,
                });

                const secretClass = await Class.create(stack, "LeakSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { mandatory: true, encrypted: true } },
                });
                for (let i = 0; i < 5; i++) {
                    await secretClass.addCard({ title: `row-${i}`, secret: `s-${i}` });
                }

                const before = count();

                // Creating a class opens short-lived feeds of its own - propagation locks
                // and model watches - that settle on their own schedule. Waiting for that
                // to finish keeps the reads below as the only thing the measurement can
                // attribute a change to.
                await new Promise(resolve => setTimeout(resolve, 2000));
                const settled = count();

                // The read a live view repeats on every query change.
                for (let i = 0; i < 3; i++) {
                    await stack.findDocuments({ "~class": { $eq: "LeakSecret" } });
                }
                const afterReads = count();

                // `getClass` is the live, cached lookup, so the first call is a cache
                // miss that legitimately builds and subscribes one instance - the stack
                // then holds it. What must not happen is a subscription per call.
                await stack.getClass("LeakSecret");
                const warmed = count();

                for (let i = 0; i < 5; i++) {
                    await stack.getClass("LeakSecret");
                }
                const afterGetClass = count();

                // Decryption still has to work - the cached class is what supplies the
                // attribute config, so a cache that returned the wrong thing would show
                // up here rather than as a listener count.
                const cards = await secretClass.getCards();

                return {
                    before,
                    settled,
                    afterReads,
                    warmed,
                    afterGetClass,
                    secrets: cards.map((c: any) => c.secret).sort(),
                };
            },
        });

        // Was 15 before the fix: 3 reads x 5 documents, one feed each.
        expect(result.afterReads.tracked - result.before.tracked).toBe(0);
        // One instance for the cache to hold...
        expect(result.warmed.tracked - result.afterReads.tracked).toBe(1);
        // ...and every lookup after it is free.
        expect(result.afterGetClass.tracked - result.warmed.tracked).toBe(0);

        // And the count PouchDB warns on does not move across the reads.
        expect(result.settled.destroyed).toBeGreaterThanOrEqual(0);
        expect(result.afterReads.destroyed).toBe(result.settled.destroyed);

        expect(result.secrets).toEqual(["s-0", "s-1", "s-2", "s-3", "s-4"]);
    });

    it("watching many classes still costs the database one feed", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "leak-many-classes",
            username: "leak-user2",
            password: "leak-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const destroyed = () => (stack.db as any).listenerCount?.("destroyed") ?? -1;

                for (let i = 0; i < 15; i++) {
                    await Class.create(stack, `LeakMany${i}`, "class", "Many", {
                        title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    });
                }
                // Let the feeds class creation opens for itself settle, so what follows
                // measures subscribing and nothing else.
                await new Promise(resolve => setTimeout(resolve, 2000));

                const before = { destroyed: destroyed(), tracked: stack.listeners.length };

                // Fifteen separate watchers, comfortably past Node's limit of ten.
                const classes: any[] = [];
                for (let i = 0; i < 15; i++) {
                    classes.push(await stack.getClass(`LeakMany${i}`, true));
                }
                const afterWatch = { destroyed: destroyed(), tracked: stack.listeners.length };

                // Each still receives its own documents' changes, and only its own.
                const seen: string[] = [];
                const first = classes[0];
                const last = classes[14];
                const record = (name: string) => (e: Event) =>
                    seen.push(`${name}:${(e as CustomEvent).detail.doc?.title}`);
                first.addEventListener("doc", record("first") as EventListener);
                last.addEventListener("doc", record("last") as EventListener);

                await first.addCard({ title: "a" });
                await last.addCard({ title: "b" });
                await new Promise(resolve => setTimeout(resolve, 1500));

                for (const classObj of classes) classObj.close();
                const afterClose = { destroyed: destroyed(), tracked: stack.listeners.length };

                return { before, afterWatch, afterClose, seen: seen.sort() };
            },
        });

        // Guards the assertions below: `-1` is the fixture's "no listenerCount here"
        // sentinel, and every difference would then be a vacuous zero.
        expect(result.before.destroyed).toBeGreaterThanOrEqual(0);

        // Fifteen new watchers...
        expect(result.afterWatch.tracked - result.before.tracked).toBe(15);
        // ...and not one more feed on the database. This is the whole point: the count
        // Node warns about no longer scales with the number of classes being watched.
        expect(result.afterWatch.destroyed).toBe(result.before.destroyed);

        // Routing is per class, not a broadcast.
        expect(result.seen).toEqual(["first:a", "last:b"]);

        // Releasing them costs nothing either way.
        expect(result.afterClose.tracked).toBe(result.before.tracked);
        expect(result.afterClose.destroyed).toBe(result.before.destroyed);
    });

    it("a class built fresh releases its subscription when closed", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "leak-close",
            username: "leak-user3",
            password: "leak-pass3",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "LeakClosable", "class", "Closable", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const before = stack.listeners.length;
                const instances: any[] = [];
                for (let i = 0; i < 12; i++) {
                    instances.push(await stack.getClass("LeakClosable", true));
                }
                const afterBuilds = stack.listeners.length;

                for (const instance of instances) instance.close();
                // Closing twice must be harmless.
                instances[0].close();

                return { before, afterBuilds, afterCloses: stack.listeners.length };
            },
        });

        // A deliberately fresh build subscribes...
        expect(result.afterBuilds - result.before).toBe(12);
        // ...and closing returns every one of them, rather than growing `listeners`
        // for the lifetime of the stack.
        expect(result.afterCloses).toBe(result.before);
    });
});
