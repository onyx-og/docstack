import {
    createReplicationFilter,
    isInternalDoc,
    resolveInternalClasses,
    INTERNAL_DOC_IDS,
} from "../internal-docs";

describe("internal document taxonomy", () => {
    const filter = createReplicationFilter();

    describe("documents that describe this device", () => {
        it.each(INTERNAL_DOC_IDS)("keeps '%s' local", (id) => {
            expect(isInternalDoc({ _id: id })).toBe(true);
            expect(filter({ _id: id })).toBe(false);
        });

        it("keeps the system document local even though its id looks ordinary", () => {
            // '~system' carries the schemaVersion checkSystem reads on every mount;
            // pulling a peer's copy would hand this device a version its patches have
            // not reached.
            expect(filter({ _id: "~system", schemaVersion: "1.4.0" })).toBe(false);
        });

        it.each([
            ["_design/Task-group", "a Mango index built on demand"],
            ["_design/Task-group-temp", "the temporary variant of one"],
            ["_local/some-checkpoint", "a PouchDB local document"],
            ["~lock-propagation-Task", "a class-model propagation lock"],
        ])("keeps '%s' local (%s)", (id) => {
            expect(isInternalDoc({ _id: id })).toBe(true);
            expect(filter({ _id: id })).toBe(false);
        });

        it("keeps propagation locks local by class as well as by id", () => {
            expect(filter({ _id: "~lock-propagation-Task", "~class": "~lock" })).toBe(false);
        });
    });

    describe("documents that carry stack data", () => {
        it.each([
            [{ _id: "Task-1", "~class": "Task" }, "an ordinary document"],
            [{ _id: "Task", "~class": "class", schema: {} }, "a class model"],
            [{ _id: "Task-Project", "~class": "domain" }, "a domain model"],
            [{ _id: "rel-1", "~class": "Task-Project", sourceId: "a", targetId: "b" }, "a relation"],
            [{ _id: "Policy-Task", "~class": "~Policy" }, "a policy"],
            [{ _id: "user-alice", "~class": "~User" }, "a user"],
            [{ _id: "Group-Tester", "~class": "~Group" }, "a group"],
        ])("replicates %o (%s)", (doc) => {
            expect(isInternalDoc(doc)).toBe(false);
            expect(filter(doc)).toBe(true);
        });
    });

    describe("categories the caller can opt into", () => {
        const session = { _id: "sess-alice", "~class": "~UserSession", sessionStatus: "active" };
        const patchLedgerEntry = { _id: "a3f1", "~class": "patch", version: "1.2.0", target: "system" };

        it("keeps sessions local by default - they belong to the device that logged in", () => {
            expect(filter(session)).toBe(false);
        });

        it("replicates sessions when asked", () => {
            expect(createReplicationFilter({ replicateSessions: true })(session)).toBe(true);
            expect(isInternalDoc(session, { replicateSessions: true })).toBe(false);
        });

        it("keeps the patch ledger local by default - each device applies its own patches", () => {
            expect(filter(patchLedgerEntry)).toBe(false);
        });

        it("replicates the patch ledger when asked", () => {
            expect(createReplicationFilter({ replicatePatchLedger: true })(patchLedgerEntry)).toBe(true);
        });
    });

    describe("caller-supplied additions", () => {
        it("honours extra ids", () => {
            const withExtras = createReplicationFilter({ extraDocIds: ["app-device-settings"] });
            expect(withExtras({ _id: "app-device-settings" })).toBe(false);
            expect(filter({ _id: "app-device-settings" })).toBe(true);
        });

        it("honours extra prefixes", () => {
            const withExtras = createReplicationFilter({ extraIdPrefixes: ["draft/"] });
            expect(withExtras({ _id: "draft/Task-1" })).toBe(false);
            expect(withExtras({ _id: "Task-1" })).toBe(true);
        });

        it("honours extra classes", () => {
            const withExtras = createReplicationFilter({ extraClasses: ["Scratch"] });
            expect(withExtras({ _id: "Scratch-1", "~class": "Scratch" })).toBe(false);
            expect(withExtras({ _id: "Task-1", "~class": "Task" })).toBe(true);
        });

        it("reports the resolved class list", () => {
            expect(resolveInternalClasses()).toEqual(expect.arrayContaining(["~lock", "~UserSession", "patch"]));
            expect(resolveInternalClasses({ replicateSessions: true })).not.toContain("~UserSession");
            expect(resolveInternalClasses({ replicatePatchLedger: true })).not.toContain("patch");
        });
    });

    describe("malformed changes", () => {
        // PouchDB hands the filter `change.doc`, and substitutes `{}` for changes that
        // carry no document at all. Nothing without an id can be classified, so nothing
        // without an id leaves the device.
        it.each([
            [{}, "an empty object"],
            [{ "~class": "Task" }, "a document with no id"],
            [null, "null"],
            [undefined, "undefined"],
        ])("keeps %o local (%s)", (doc) => {
            expect(isInternalDoc(doc as any)).toBe(true);
            expect(filter((doc || {}) as any)).toBe(false);
        });
    });

    it("is pure - the same document classifies the same way every time", () => {
        const doc = { _id: "Task-1", "~class": "Task" };
        expect(filter(doc)).toBe(filter(doc));
        expect(doc).toEqual({ _id: "Task-1", "~class": "Task" });
    });
});
