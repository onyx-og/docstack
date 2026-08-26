import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * Cover for ADR-0023 findings 2 and 3.
 *
 * `StackSyncOptions.internalDocs` is documented as keeping DocStack's own documents on the
 * device, and defaults to on. It did not: of 47 documents in a stack with no application
 * data at all, 23 replicated — every one of them DocStack's own — plus a log record for
 * roughly every operation the client had performed.
 */
describe("replication filter", () => {
    it("ADR-0023: a stack with no application data replicates nothing", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "filter-empty",
            username: "filter-user",
            password: "filter-pass",
            evaluate: async ({ stack }) => {
                const { createReplicationFilter } = (window as any).docstack;
                const filter = createReplicationFilter();

                const all = await stack.db.allDocs({ include_docs: true });
                const docs = all.rows.map((r: any) => r.doc).filter(Boolean);
                const replicated = docs.filter((d: any) => filter(d));

                const { SYSTEM_SEEDED_DOC_IDS } = (window as any).docstack;

                return {
                    total: docs.length,
                    // Anything patch-seeded here is leaking to a remote for no gain.
                    leakedSeeded: replicated
                        .filter((d: any) => SYSTEM_SEEDED_DOC_IDS.includes(d._id))
                        .map((d: any) => `${d._id} [${d["~class"] ?? "-"}]`).sort(),
                    // Job runs and sessions are this device's own history.
                    leakedDeviceLocal: replicated
                        .filter((d: any) => ["~JobRun", "~UserSession", "~lock"].includes(d["~class"]))
                        .map((d: any) => d._id).sort(),
                    logRecordsHeld: replicated.filter((d: any) => String(d._id).startsWith("~log-")).length,
                    // There is always some logging by this point.
                    logRecords: docs.filter((d: any) => String(d._id).startsWith("~log-")).length,
                };
            },
        });

        expect(result.total).toBeGreaterThan(20);
        expect(result.logRecords).toBeGreaterThan(0);

        // Was 23 documents plus every log record.
        expect(result.leakedSeeded).toEqual([]);
        expect(result.leakedDeviceLocal).toEqual([]);
        expect(result.logRecordsHeld).toBe(0);
    });

    it("ADR-0023: what binds the instances travels; what every client seeds does not", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "filter-binding",
            username: "filter-binder",
            password: "filter-pass4",
            evaluate: async ({ stack }) => {
                const { createReplicationFilter } = (window as any).docstack;
                const filter = createReplicationFilter();

                const all = await stack.db.allDocs({ include_docs: true });
                const docs = all.rows.map((r: any) => r.doc).filter(Boolean);
                const byId = (id: string) => docs.find((d: any) => d._id === id);

                const check = (id: string) => {
                    const doc = byId(id);
                    return doc ? filter(doc) : null;
                };

                return {
                    // Created at runtime by the fixture: a peer cannot derive it, and a
                    // synchronised group needs it to agree on who its members are.
                    runtimeUser: check("user-filter-binder"),
                    runtimeGroup: check("Group-Tester"),
                    // Seeded by the system patches on every client.
                    seededUser: check("system"),
                    seededGroup: check("Group-Admin"),
                    seededPolicy: check("Policy-Admin"),
                    seededAuthModule: check("AuthMod-Classic"),
                    seededClassModel: check("~User"),
                    seededBootstrap: check("class"),
                };
            },
        });

        // The documents that bind two instances together.
        expect(result.runtimeUser).toBe(true);
        expect(result.runtimeGroup).toBe(true);

        // The documents every client already built for itself by patching.
        expect(result.seededUser).toBe(false);
        expect(result.seededGroup).toBe(false);
        expect(result.seededPolicy).toBe(false);
        expect(result.seededAuthModule).toBe(false);
        expect(result.seededClassModel).toBe(false);
        expect(result.seededBootstrap).toBe(false);
    });

    it("ADR-0023: application documents still replicate", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "filter-app",
            username: "filter-user2",
            password: "filter-pass2",
            evaluate: async ({ stack }) => {
                const { Class, createReplicationFilter } = (window as any).docstack;
                const filter = createReplicationFilter();

                const cls = await Class.create(stack, "FilterTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });
                const card = await cls.addCard({ title: "real-work" });

                const all = await stack.db.allDocs({ include_docs: true });
                const docs = all.rows.map((r: any) => r.doc).filter(Boolean);
                const replicated = docs.filter((d: any) => filter(d));

                return {
                    cardId: card?._id,
                    cardReplicates: replicated.some((d: any) => d._id === card?._id),
                    // The application's own class model travels too - a peer needs the
                    // schema for the documents it is being sent.
                    classModelReplicates: replicated.some((d: any) => d["~class"] === "class" && d.name === "FilterTask"),
                    replicatedClasses: [...new Set(replicated.map((d: any) => d["~class"]))].sort(),
                };
            },
        });

        expect(result.cardReplicates).toBe(true);
        expect(result.classModelReplicates).toBe(true);
        // Runtime-created identity and authorisation travel too - they bind the two
        // instances, and `~Policy` here is the default policy created *for this class*,
        // not a patch-seeded one. Nothing patch-seeded or device-local rides along.
        expect(result.replicatedClasses).toEqual(["FilterTask", "class", "~Group", "~Policy", "~User"]);
    });

    it("ADR-0023: sessions can still be opted back in", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "filter-optin",
            username: "filter-user3",
            password: "filter-pass3",
            evaluate: async ({ stack }) => {
                const { createReplicationFilter } = (window as any).docstack;

                const all = await stack.db.allDocs({ include_docs: true });
                const docs = all.rows.map((r: any) => r.doc).filter(Boolean);
                const sessions = docs.filter((d: any) => d["~class"] === "~UserSession");

                const byDefault = createReplicationFilter();
                const optedIn = createReplicationFilter({ replicateSessions: true });
                const seededToo = createReplicationFilter({ replicateSystemDocuments: true });

                return {
                    sessionCount: sessions.length,
                    defaultHolds: sessions.every((d: any) => !byDefault(d)),
                    optInReplicates: sessions.every((d: any) => optedIn(d)),
                    // The two opt-ins are independent: `replicateSystemDocuments` releases
                    // the patch-seeded documents, and says nothing about sessions, which
                    // are device-local by class rather than by being seeded.
                    seededOptInReleasesSeeded: seededToo({ _id: "Policy-Admin", "~class": "~Policy" }),
                    seededOptInStillHoldsSessions: sessions.every((d: any) => !seededToo(d)),
                    // Never released by anything: this database's own identity.
                    stillHoldsSystemDoc: !seededToo({ _id: "~system" }),
                };
            },
        });

        expect(result.sessionCount).toBeGreaterThan(0);
        expect(result.defaultHolds).toBe(true);
        expect(result.optInReplicates).toBe(true);
        expect(result.seededOptInReleasesSeeded).toBe(true);
        expect(result.seededOptInStillHoldsSessions).toBe(true);
        expect(result.stillHoldsSystemDoc).toBe(true);
    });
});
