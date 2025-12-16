import { test as it, expect } from './fixtures';

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

                // Generate a random 32-byte hex key in the browser
                const array = new Uint8Array(32);
                crypto.getRandomValues(array);
                const documentKey = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

                await stack.cryptoEngine.setDocumentKey(documentKey);

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
                    keyDerivationSalt: "a-salt"
                });

                const user = await User.get("test-user");

                const unwrappedKey = await stack.cryptoEngine.unwrapAndStoreDocumentKey(user.wrappedDocumentKey, user.keyDerivationSalt);

                return {
                    user: {
                        _id: user._id,
                        username: user.username,
                        hasWrappedKey: !!user.wrappedDocumentKey,
                    },
                    keysMatch: unwrappedKey === documentKey
                };
            },
        });

        expect(result.user.hasWrappedKey).toBe(true);
        expect(result.keysMatch).toBe(true);
    });
});
