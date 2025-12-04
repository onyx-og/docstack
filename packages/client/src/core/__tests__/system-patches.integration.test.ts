import { createTestDocStack } from "../test-utils/docstack";
import { getAllSystemPatches } from "../datamodel/index";

jest.setTimeout(30000);

describe("System Patches Integration", () => {
    it("should load all system patches and populate the stack correctly", async () => {
        const { stack, cleanup } = await createTestDocStack("system-patches-test", { withSession: false });

        try {
            // 1. Verify System Classes
            const systemClasses = ["~User", "~Job", "~Policy", "~AuthModule", "~UserSession", "~Group"];
            for (const className of systemClasses) {
                const classModel = await stack.getClassModel(className);
                expect(classModel).toBeDefined();
                expect(classModel!._id).toBe(className);
            }

            // 2. Verify System User
            const systemUser = await stack.findDocument({
                "~class": { $eq: "~User" },
                username: { $eq: "system" }
            });
            expect(systemUser).toBeDefined();
            expect(systemUser!.username).toBe("system");

            // 3. Verify System Groups
            const adminGroup = await stack.findDocument({
                "~class": { $eq: "~Group" },
                name: { $eq: "Admin" }
            });
            expect(adminGroup).toBeDefined();

            const defaultGroup = await stack.findDocument({
                "~class": { $eq: "~Group" },
                name: { $eq: "Default" }
            });
            expect(defaultGroup).toBeDefined();

            // 4. Verify Schema Version
            const allPatches = getAllSystemPatches();
            const latestPatch = allPatches[allPatches.length - 1];

            const systemDoc = await stack.getSystem();
            expect(systemDoc).toBeDefined();
            expect(systemDoc!.schemaVersion).toBe(latestPatch.version);

        } finally {
            await cleanup();
        }
    });
});
