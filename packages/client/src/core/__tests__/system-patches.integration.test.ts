import { createTestDocStack } from "../test-utils/docstack";
import { getAllSystemPatches } from "../datamodel/index";

jest.setTimeout(30000);

describe("System Patches Integration", () => {
    it("should load all system patches and populate the stack correctly", async () => {
        const { stack, cleanup } = await createTestDocStack("system-patches-test", { withSession: false });

        try {
            const sessionproof = await stack.authenticate({
                username: "system",
                password: "system"
            });
            console.log("Got session proof", { sessionproof })
            expect(stack.authSession).not.toBeNull();
            // 1. Verify System Classes
            const systemClasses = ["~User", "~Job", "~Policy", "~AuthModule", "~UserSession", "~Group"];
            for (const className of systemClasses) {
                const classModel = await stack.getClassModel(className);
                expect(classModel).toBeDefined();
                expect(classModel!._id).toBe(className);
            }

            const userClass = await stack.getClass("~User");
            const users = await userClass?.getCards();
            console.log("Got user list", users)
            // 2. Verify System User
            const systemUser = await stack.findDocument({
                "~class": { $eq: "~User" },
                username: { $eq: "system" }
            });
            // const systemUser = await stack.db.get("system");
            console.log("Got system user", systemUser);
            expect(systemUser).not.toBeNull();
            expect(systemUser!.username).toBe("system");

            // const allDocs = await stack.db.allDocs({
            //     include_docs: true
            // });
            // console.log("Got all docs", allDocs);

            // const groupClass = await stack.getClass("~Group");
            // const groups = await groupClass?.getCards();
            // console.log("Got group list", groups)
            // 3. Verify System Groups
            const adminGroup = await stack.findDocument({
                "~class": { $eq: "~Group" },
                name: { $eq: "Admin" }
            });
            expect(adminGroup).not.toBeNull();

            const defaultGroup = await stack.findDocument({
                "~class": { $eq: "~Group" },
                name: { $eq: "Default" }
            });
            expect(defaultGroup).not.toBeNull();

            // 4. Verify Schema Version
            const allPatches = await getAllSystemPatches();
            const latestPatch = allPatches[allPatches.length - 1];

            const systemDoc = await stack.getSystem();
            expect(systemDoc).toBeDefined();
            expect(systemDoc!.schemaVersion).toBe(latestPatch.version);

        } finally {
            await cleanup();
        }
    });
});
