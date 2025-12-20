import { test as it, expect } from './fixtures';

it.setTimeout(120_000)

const describe = it.describe;

describe("user triggers", () => {
    it("should auto-populate wrappedDocumentKey on user creation if documentKey is present", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "user-trigger-test",
            username: "test-user-trigger",
            password: "test-user-trigger-pass",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                await stack.authenticate({username: "system", password: "system"});

                const User = await Class.fetch(stack, "~User");

                if (!User) {
                    throw new Error("User class not found");
                }

                const userDoc = await User.add({
                    _id: "test-user",
                    username: "test-user",
                    password: "password",
                    groupId: ["Group-Default"],
                    authMethod: "AuthMod-Classic",
                });

                const user = await User.get("test-user");

                // const unwrappedKey = await stack.cryptoEngine.unwrapAndStoreDocumentKey(user.wrappedDocumentKey, user.keyDerivationSalt);

                return {
                    user: {
                        _id: user._id,
                        username: user.username,
                        hasWrappedKey: !!userDoc.wrappedDocumentKey,
                    },
                    // keysMatch: unwrappedKey === documentKey
                };
            },
        });

        expect(result.user.hasWrappedKey).toBe(true);
        // expect(result.keysMatch).toBe(true);
    });
});
