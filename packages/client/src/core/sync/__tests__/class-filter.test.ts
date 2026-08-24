import { createClassFilter, hasClassRules, DATA_MODEL_CLASSES } from "../class-filter";

describe("class filtering", () => {
    const task = { _id: "Task-1", "~class": "Task" };
    const draft = { _id: "Draft-1", "~class": "Draft" };
    const project = { _id: "Project-1", "~class": "Project" };

    describe("exclude", () => {
        const filter = createClassFilter({ exclude: ["Draft"] });

        it("drops the named classes and keeps everything else", () => {
            expect(filter(draft)).toBe(false);
            expect(filter(task)).toBe(true);
            expect(filter(project)).toBe(true);
        });

        it("keeps the data model", () => {
            expect(filter({ _id: "Task", "~class": "class" })).toBe(true);
            expect(filter({ _id: "Policy-Task", "~class": "~Policy" })).toBe(true);
        });
    });

    describe("include", () => {
        const filter = createClassFilter({ include: ["Task"] });

        it("keeps only the named classes", () => {
            expect(filter(task)).toBe(true);
            expect(filter(draft)).toBe(false);
            expect(filter(project)).toBe(false);
        });

        it.each(DATA_MODEL_CLASSES)("keeps '%s' so the replica stays readable", (className) => {
            // An allow-list taken literally would ship Task documents to a remote with no
            // Task class model on it - a database the next device cannot open.
            expect(filter({ _id: `doc-${className}`, "~class": className })).toBe(true);
        });

        it("can be told not to keep the data model", () => {
            const bare = createClassFilter({ include: ["Task"], includeDataModel: false });
            expect(bare(task)).toBe(true);
            expect(bare({ _id: "Task", "~class": "class" })).toBe(false);
        });
    });

    describe("include and exclude together", () => {
        it("lets exclude win", () => {
            const filter = createClassFilter({ include: ["Task", "Draft"], exclude: ["Draft"] });
            expect(filter(task)).toBe(true);
            expect(filter(draft)).toBe(false);
        });

        it("lets exclude override the data model too", () => {
            const filter = createClassFilter({ include: ["Task"], exclude: ["~Policy"] });
            expect(filter({ _id: "Policy-Task", "~class": "~Policy" })).toBe(false);
            expect(filter({ _id: "Task", "~class": "class" })).toBe(true);
        });
    });

    describe("relations", () => {
        // Relations carry `~domain` and class *ids*, not `~class`. A filter that only
        // reads `~class` lets them all through, and a relation whose endpoint was
        // filtered out lands on the peer as a dangling reference.
        const relation = (sourceClass: string, targetClass: string) => ({
            _id: `${sourceClass}-${targetClass}-1`,
            "~domain": `${sourceClass}${targetClass}`,
            sourceClass,
            targetClass,
        });

        it("replicates a relation only when both endpoints do", () => {
            const filter = createClassFilter({ include: ["Task", "Project"] });
            expect(filter(relation("Task", "Project"))).toBe(true);
            expect(filter(relation("Task", "Draft"))).toBe(false);
            expect(filter(relation("Draft", "Task"))).toBe(false);
        });

        it("applies exclusions to endpoints", () => {
            const filter = createClassFilter({ exclude: ["Draft"] });
            expect(filter(relation("Task", "Project"))).toBe(true);
            expect(filter(relation("Task", "Draft"))).toBe(false);
        });

        it("drops a relation with no endpoints to judge", () => {
            const filter = createClassFilter({ include: ["Task"] });
            expect(filter({ _id: "r1", "~domain": "Broken" })).toBe(false);
        });
    });

    describe("documents with nothing to judge by", () => {
        it("abstains on a tombstone, so deletions still replicate", () => {
            // A deletion arrives as { _id, _rev, _deleted } with no class on it. Dropping
            // it here would mean the delete never reaches the peer and the document
            // silently comes back.
            const filter = createClassFilter({ include: ["Task"] });
            expect(filter({ _id: "Task-1", _rev: "2-abc", _deleted: true })).toBe(true);
        });

        it("abstains on untyped documents", () => {
            const filter = createClassFilter({ exclude: ["Draft"] });
            expect(filter({ _id: "lastDocId", value: 12 })).toBe(true);
        });

        it("drops nothing at all", () => {
            expect(createClassFilter({ include: ["Task"] })(null as any)).toBe(false);
        });
    });

    describe("hasClassRules", () => {
        it.each([
            [undefined, false],
            [{}, false],
            [{ include: [] }, false],
            [{ exclude: [] }, false],
            [{ include: ["Task"] }, true],
            [{ exclude: ["Draft"] }, true],
        ])("reports %o as %s", (options, expected) => {
            expect(hasClassRules(options as any)).toBe(expected);
        });
    });

    describe("no rules", () => {
        it("passes everything", () => {
            const filter = createClassFilter();
            expect(filter(task)).toBe(true);
            expect(filter(draft)).toBe(true);
        });
    });
});
