import type { UserModel } from "@docstack/shared";
import { createSessionProof, createTestDocStack, seedClassicUser } from "../../test-utils/docstack.js";

jest.setTimeout(20000);

describe("User class policies", () => {
    it("only returns the requesting user's document", async () => {
        const { stack, cleanup } = await createTestDocStack("user-policy", { withSession: false });

        try {
            await createSessionProof(stack, "system");

            await seedClassicUser(stack, {
                username: "alice",
                password: "password-1",
                keyDerivationSalt: "salt-alice",
            });

            await seedClassicUser(stack, {
                username: "bob",
                password: "password-2",
                keyDerivationSalt: "salt-bob",
            });

            await stack.authenticate({ username: "alice", password: "password-1" });

            const result = await stack.findDocuments<UserModel>({ "~class": { $eq: "~User" } });
            expect(result.docs).toHaveLength(1);
            expect(result.docs[0].username).toBe("alice");
        } finally {
            await cleanup();
        }
    });
});
