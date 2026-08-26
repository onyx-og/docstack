import { test as it, expect, TEST_DOCUMENT_KEY } from './fixtures';

const describe = it.describe;

/**
 * `exportContent` / `importContent` — moving application content between stacks without
 * the datamodel that describes it.
 *
 * `dump()` is the other kind of export: the database verbatim, encrypted attributes
 * included as unreadable payloads. These tests pin the four things that make this one
 * different — content only, decrypted on the way out, reconciled on the way in, and
 * re-encrypted under the *target* stack's key.
 */
describe("content export", () => {
    it("carries only application documents, and decrypts them", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "export-content",
            username: "export-user",
            password: "export-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "XferTask", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: { encrypted: true } },
                });
                await taskClass.addCard({ title: "alpha", notes: "confidential-alpha" });
                await taskClass.addCard({ title: "beta", notes: "confidential-beta" });

                // Soft-deleted: live content only, by default.
                const gone = await taskClass.addCard({ title: "gamma", notes: "confidential-gamma" });
                await stack.deleteDocument(gone._id);

                const payload = await stack.exportContent();
                const dumped = await stack.dump();

                const classesIn = (docs: any[]) =>
                    [...new Set(docs.map(d => d?.["~class"]).filter(Boolean))].sort();

                return {
                    format: payload.format,
                    classes: payload.classes,
                    exportedClasses: classesIn(payload.documents),
                    titles: payload.documents.map((d: any) => d.title).sort(),
                    notes: payload.documents.map((d: any) => d.notes).sort(),
                    // Nothing carries a source revision.
                    anyRev: payload.documents.some((d: any) => d._rev !== undefined),
                    // What `dump` sees, for contrast.
                    dumpedClasses: classesIn(dumped.rows.map((r: any) => r.doc)),
                    dumpedHasCiphertext: dumped.rows.some((r: any) => r.doc?.notes?.__enc === true),
                };
            },
        });

        expect(result.format).toBe("docstack/content-export@1");

        // Only the application's class - no schema, no patches, no users or sessions.
        expect(result.classes).toEqual(["XferTask"]);
        expect(result.exportedClasses).toEqual(["XferTask"]);

        // The soft-deleted one is absent.
        expect(result.titles).toEqual(["alpha", "beta"]);

        // Encryption is respected, not bypassed: plaintext out.
        expect(result.notes).toEqual(["confidential-alpha", "confidential-beta"]);
        expect(result.anyRev).toBe(false);

        // `dump` really does carry everything, ciphertext included - that is the contrast
        // this method exists for.
        expect(result.dumpedClasses.length).toBeGreaterThan(3);
        expect(result.dumpedClasses).toContain("class");
        expect(result.dumpedClasses).toContain("patch");
        expect(result.dumpedHasCiphertext).toBe(true);
    });

    it("refuses to export a locked stack rather than emitting nulls", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "export-locked",
            username: "export-user2",
            password: "export-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                const secretClass = await Class.create(stack, "XferSecret", "class", "Secrets", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    secret: { name: "secret", type: "string", config: { encrypted: true } },
                });
                await secretClass.addCard({ title: "one", secret: "classified" });

                // Clears the session *and* the document key, so the stack is both locked
                // and unauthenticated. The lock guard has to run before any read for its
                // message to be the one the caller sees.
                stack.clearAuthSession();

                let refusal: string | null = null;
                try {
                    await stack.exportContent();
                } catch (error: any) {
                    refusal = error?.message ?? String(error);
                }

                // The escape hatch gets past the lock guard. It cannot complete here -
                // reading still needs a session, and there is no way to hold one while
                // locked, since authenticating installs the key - so what is pinned is
                // that the refusal is no longer the *lock* refusal.
                let lossyOutcome: string | null = null;
                try {
                    await stack.exportContent({ allowLossyWhenLocked: true });
                    lossyOutcome = "completed";
                } catch (error: any) {
                    lossyOutcome = error?.message ?? String(error);
                }

                return {
                    locked: stack.isLocked(),
                    refusal,
                    lossyOutcome,
                };
            },
        });

        expect(result.locked).toBe(true);

        // The refusal names the problem, the class, and the way out.
        expect(result.refusal).toContain("locked");
        expect(result.refusal).toContain("XferSecret");
        expect(result.refusal).toContain("unlock");

        // Opting in gets past that guard - whatever happens next, it is not the lock.
        expect(result.lossyOutcome).not.toContain("the stack is locked");
    });
});

describe("content import", () => {
    it("round-trips into a second stack, re-encrypting under its own key", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "xfer-source",
            username: "xfer-user",
            password: "xfer-pass",
            evaluate: async ({ stack, docStack }) => {
                const { Class } = (window as any).docstack;

                const taskClass = await Class.create(stack, "XferRound", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: { encrypted: true } },
                });
                await taskClass.addCard({ title: "alpha", notes: "secret-alpha" });
                await taskClass.addCard({ title: "beta", notes: "secret-beta" });

                const payload = await stack.exportContent();

                // A second stack, with a *different* document key.
                const targetKey = "1".repeat(64);
                const target = await docStack.addStack({ name: "xfer-target", documentKey: targetKey });
                await target.authenticate({ username: "system", password: "system" });

                // The datamodel is the target's own business - the export carries none.
                await Class.create(target, "XferRound", "class", "Tasks", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                    notes: { name: "notes", type: "string", config: { encrypted: true } },
                });

                const report = await target.importContent(payload);

                const imported = await (await target.getClass("XferRound"))!.getCards();
                // Read past the decrypting path to prove it really was re-encrypted.
                const raw = await target.db.get(imported[0]._id);

                return {
                    report,
                    titles: imported.map((d: any) => d.title).sort(),
                    notes: imported.map((d: any) => d.notes).sort(),
                    storedUnderTargetKey: raw.notes?.__enc === true,
                    storedKid: raw.notes?.kid,
                    sourceKid: (await stack.db.get(payload.documents[0]._id)).notes?.kid,
                };
            },
        });

        expect(result.report.documents.written).toBe(2);
        expect(result.report.issues).toEqual([]);

        // The data survived the trip.
        expect(result.titles).toEqual(["alpha", "beta"]);
        expect(result.notes).toEqual(["secret-alpha", "secret-beta"]);

        // Encryption ran on the way in, under the target's key rather than the source's.
        expect(result.storedUnderTargetKey).toBe(true);
        expect(result.storedKid).toBeTruthy();
        expect(result.storedKid).not.toBe(result.sourceKid);
    });

    it("reconciles against the datamodel instead of inventing one", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "xfer-reconcile",
            username: "xfer-user2",
            password: "xfer-pass2",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await Class.create(stack, "XferKnown", "class", "Known", {
                    title: { name: "title", type: "string", config: { mandatory: true, primaryKey: true } },
                });

                const payload = {
                    format: "docstack/content-export@1",
                    exportedAt: new Date().toISOString(),
                    source: { stack: "elsewhere", appVersion: "0.0.1" },
                    classes: ["XferKnown", "XferAbsent"],
                    domains: [],
                    documents: [
                        // Fine.
                        { _id: "XferKnown-100", "~class": "XferKnown", title: "kept", active: true },
                        // Carries an attribute this stack's class does not define.
                        { _id: "XferKnown-101", "~class": "XferKnown", title: "trimmed", stowaway: "x", active: true },
                        // Class does not exist here.
                        { _id: "XferAbsent-1", "~class": "XferAbsent", title: "orphan", active: true },
                        // Not content at all - a class model smuggled into the payload.
                        { _id: "SmuggledClass", "~class": "class", name: "Smuggled", schema: {}, active: true },
                    ],
                    relations: [],
                };

                const report = await stack.importContent(payload as any);

                const kept = await (await stack.getClass("XferKnown"))!.getCards();
                const smuggled = await stack.db.get("SmuggledClass").catch(() => null);
                const trimmed = kept.find((d: any) => d._id === "XferKnown-101");

                return {
                    report,
                    titles: kept.map((d: any) => d.title).sort(),
                    smuggledLanded: smuggled !== null,
                    stowawayLanded: trimmed?.stowaway !== undefined,
                    kinds: report.issues.map((i: any) => i.kind).sort(),
                };
            },
        });

        // Two application documents in; the orphan and the class model refused.
        expect(result.report.documents.written).toBe(2);
        expect(result.report.documents.skipped).toBe(2);
        expect(result.titles).toEqual(["kept", "trimmed"]);

        // No schema was invented for the class this stack does not have...
        expect(result.kinds).toContain("missing-class");
        // ...the undefined attribute was dropped rather than stored...
        expect(result.kinds).toContain("unknown-attribute");
        expect(result.stowawayLanded).toBe(false);
        // ...and a datamodel document cannot ride in through the content door.
        expect(result.smuggledLanded).toBe(false);
    });
});
