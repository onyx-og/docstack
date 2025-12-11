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
});
