import Class from "../../class";
import type { PolicyModel, UserModel, UserSessionModel } from "@docstack/shared";
import { createSessionProof, createTestDocStack, seedClassicUser, ensureGroup } from "../../test-utils/docstack.js";

describe("Group and policy integration", () => {
    jest.setTimeout(20000);

    it("assigns the default group when a user is created without groups", async () => {
        const { stack, cleanup } = await createTestDocStack("group-default", { withSession: false });
        try {
            await createSessionProof(stack, "system");
            const userClass = (await stack.getClassModel("~User")) || (await stack.getClassModel("User"));
            const schema = userClass?.schema || {};
            await stack.createDoc("user-no-group", "~User", schema, {
                username: "no-group",
                password: "pw-no-group",
                email: "",
                firstName: "No",
                lastName: "Group",
                authMethod: "AuthMod-Classic",
                externalId: "",
                keyDerivationSalt: "salt-no-group",
            } as unknown as UserModel);

            const stored = await stack.findDocument<UserModel>({
                "~class": { $eq: "~User" },
                username: { $eq: "no-group" },
            });

            expect(stored?.groupId).toEqual(["Group-Default"]);
        } finally {
            await cleanup();
        }
    });

    it("enforces group-scoped policies with multi-group sessions", async () => {
        const { stack, cleanup } = await createTestDocStack("group-policies", { withSession: false });
        try {
            await createSessionProof(stack, "system");
            await ensureGroup(stack, "Group-Extra", "Extra");

            const resourceClass = await Class.create(stack, "Resource", "class", "Resource", {
                name: { name: "name", type: "string", config: { mandatory: true } },
            });

            const extraPolicy: PolicyModel = {
                _id: "Policy-Resource-Extra",
                "~class": "~Policy",
                groupId: "Group-Extra",
                rule: "return true;",
                targetClass: [resourceClass.getModel()._id],
            };

            await stack.db.bulkDocs([extraPolicy as any]);

            await seedClassicUser(stack, {
                username: "tester-only",
                password: "pw-tester",
                groupId: ["Group-Tester"],
            });
            await createSessionProof(stack, "tester-only");

            await expect(
                stack.createDoc(null, resourceClass.name, resourceClass, { name: "denied" })
            ).rejects.toThrow();

            await seedClassicUser(stack, {
                username: "multi",
                password: "pw-multi",
                groupId: ["Group-Tester", "Group-Extra"],
            });
            await createSessionProof(stack, "multi");

            await expect(
                stack.createDoc(null, resourceClass.name, resourceClass, { name: "allowed" })
            ).resolves.toBeTruthy();

            const sessionDoc = await stack.findDocument<UserSessionModel>({
                "~class": { $eq: "~UserSession" },
                username: { $eq: "multi" },
            });

            expect(sessionDoc?.groupId).toEqual(expect.arrayContaining(["Group-Tester", "Group-Extra"]));
        } finally {
            await cleanup();
        }
    });
});
