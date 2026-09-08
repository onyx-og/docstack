import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("System Patches Integration", () => {
    it("should load all system patches and populate the stack correctly", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "system-patches-test",
            evaluate: async ({ stack }) => {
                // Authenticate as system user
                await stack.authenticate({
                    username: "system",
                    password: "system"
                });

                const hasAuthSession = stack.authSession !== null;

                // 1. Verify System Classes
                const systemClasses = ["~User", "~Job", "~Policy", "~AuthModule", "~UserSession", "~Group"];
                const classModels: Record<string, { _id: string } | null> = {};
                for (const className of systemClasses) {
                    const classModel = await stack.getClassModel(className);
                    classModels[className] = classModel ? { _id: classModel._id } : null;
                }

                // 2. Verify System User
                const systemUser = await stack.findDocument({
                    "~class": { $eq: "~User" },
                    username: { $eq: "system" }
                }) as any;

                // 3. Verify System Groups
                const adminGroup = await stack.findDocument({
                    "~class": { $eq: "~Group" },
                    name: { $eq: "Admin" }
                });

                const defaultGroup = await stack.findDocument({
                    "~class": { $eq: "~Group" },
                    name: { $eq: "Default" }
                });

                // 4. Verify Schema Version
                const systemDoc = await stack.getSystem();

                return {
                    hasAuthSession,
                    classModels,
                    systemUser: systemUser ? { username: systemUser.username } : null,
                    adminGroupFound: adminGroup !== null,
                    defaultGroupFound: defaultGroup !== null,
                    schemaVersion: systemDoc?.schemaVersion,
                };
            },
        });

        expect(result.hasAuthSession).toBe(true);

        // Verify all system classes
        const systemClasses = ["~User", "~Job", "~Policy", "~AuthModule", "~UserSession", "~Group"];
        for (const className of systemClasses) {
            expect(result.classModels[className]).toBeDefined();
            expect(result.classModels[className]?._id).toBe(className);
        }

        expect(result.systemUser).not.toBeNull();
        expect(result.systemUser?.username).toBe("system");
        expect(result.adminGroupFound).toBe(true);
        expect(result.defaultGroupFound).toBe(true);
        expect(result.schemaVersion).toBeDefined();
    });

    it("~sys-0.0.19: the retired ~Policy class is deactivated but still resolvable", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "policy-class-retired",
            evaluate: async ({ stack }) => {
                // Resolvable by id: a consumer's own legacy `~Policy` documents must keep
                // a class to be read and written through, so this lookup does not filter
                // on `active`.
                const model = await stack.getClassModel("~Policy") as any;

                // Absent from the listing a workbench renders (`useClassList`), which
                // does filter on `active`. This is what deactivation buys.
                const listed = await stack.getClassModels();
                const listedNames = listed.list.map((m: any) => m._id);

                // A legacy policy document still writes and reads back.
                const legacy = {
                    _id: "Policy-Legacy-Retired",
                    "~class": "~Policy",
                    rule: "return true;",
                    targetClass: ["~User"],
                };
                let wrote = false;
                try {
                    await (stack as any).db.bulkDocs([legacy]);
                    wrote = Boolean(await (stack as any).db.get("Policy-Legacy-Retired"));
                } catch { wrote = false; }

                return {
                    modelResolves: Boolean(model),
                    modelActive: model?.active,
                    listedPolicy: listedNames.includes("~Policy"),
                    listedAccessScope: listedNames.includes("~AccessScope"),
                    wrote,
                };
            },
        });

        expect(result.modelResolves).toBe(true);
        expect(result.modelActive).toBe(false);
        expect(result.listedPolicy).toBe(false);
        // The class that replaced it is listed, so the assertion above is about
        // deactivation rather than about the listing being empty.
        expect(result.listedAccessScope).toBe(true);
        expect(result.wrote).toBe(true);
    });
});
