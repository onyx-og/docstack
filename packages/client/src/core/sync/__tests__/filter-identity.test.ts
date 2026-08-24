import { createReplicationFilter } from "../internal-docs";
import { createClassFilter } from "../class-filter";
import { composeFilterIdentity, describeFilter, withFilterIdentity } from "../filter-identity";

/**
 * PouchDB hashes `source.id() + target.id() + filter.toString()` into the replication
 * checkpoint (`generateReplicationId`). Filters produced by a factory all share one
 * closure source, so without an identity they would share one checkpoint: changing what
 * you replicate would resume from the previous configuration's position and never
 * backfill. These tests pin that down at the level PouchDB actually reads.
 */
describe("filter identity", () => {
    describe("the internal-document filter", () => {
        it("identifies itself rather than reporting its source text", () => {
            const filter = createReplicationFilter();
            expect(String(filter)).toContain("docstack-filter/1:internal");
            expect(String(filter)).not.toContain("=>");
        });

        it("gives the same configuration the same identity", () => {
            expect(String(createReplicationFilter())).toBe(String(createReplicationFilter()));
            expect(String(createReplicationFilter({ replicateSessions: true })))
                .toBe(String(createReplicationFilter({ replicateSessions: true })));
        });

        it("gives different configurations different identities", () => {
            const base = String(createReplicationFilter());
            expect(String(createReplicationFilter({ replicateSessions: true }))).not.toBe(base);
            expect(String(createReplicationFilter({ replicatePatchLedger: true }))).not.toBe(base);
            expect(String(createReplicationFilter({ extraClasses: ["Draft"] }))).not.toBe(base);
            expect(String(createReplicationFilter({ extraDocIds: ["app-settings"] }))).not.toBe(base);
            expect(String(createReplicationFilter({ extraIdPrefixes: ["tmp/"] }))).not.toBe(base);
        });

        it("does not treat a reordered list as a different configuration", () => {
            // Re-replicating an entire database because a list was written in another
            // order would be a nasty surprise.
            expect(String(createReplicationFilter({ extraClasses: ["A", "B"] })))
                .toBe(String(createReplicationFilter({ extraClasses: ["B", "A"] })));
        });
    });

    describe("the class filter", () => {
        it("distinguishes configurations", () => {
            expect(String(createClassFilter({ exclude: ["Draft"] })))
                .not.toBe(String(createClassFilter({ exclude: ["Archive"] })));
            expect(String(createClassFilter({ include: ["Task"] })))
                .not.toBe(String(createClassFilter({ exclude: ["Task"] })));
            expect(String(createClassFilter({ include: ["Task"] })))
                .not.toBe(String(createClassFilter({ include: ["Task"], includeDataModel: false })));
        });

        it("is stable for the same configuration", () => {
            expect(String(createClassFilter({ include: ["Task", "Project"] })))
                .toBe(String(createClassFilter({ include: ["Project", "Task"] })));
        });
    });

    describe("helpers", () => {
        it("keeps the function working after stamping", () => {
            const filter = withFilterIdentity((doc: any) => doc.keep === true, "test-identity");
            expect(filter({ keep: true })).toBe(true);
            expect(filter({ keep: false })).toBe(false);
            expect(String(filter)).toBe("test-identity");
        });

        it("renders nested configuration deterministically", () => {
            expect(describeFilter("k", { b: 1, a: [2, 1] })).toBe(describeFilter("k", { a: [2, 1], b: 1 }));
            expect(describeFilter("k", { a: ["y", "x"] })).toBe(describeFilter("k", { a: ["x", "y"] }));
            expect(describeFilter("k", { a: 1 })).not.toBe(describeFilter("k", { a: 2 }));
        });

        it("composes identities in order", () => {
            const composed = composeFilterIdentity(["one", "two"]);
            expect(composed).toContain("one");
            expect(composed).toContain("two");
            expect(composed).not.toBe(composeFilterIdentity(["two", "one"]));
        });
    });
});
