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

                // Fetched by the id the write returned, not the one passed in `params`:
                // `add` generates the id (`addOrUpdateCard` takes one as its second
                // argument instead), so "test-user" was never this document's id. The
                // mismatch was invisible while `get` returned a one-element array for a
                // single id, which made `user._id` read `undefined` rather than fail.
                const user = await User.get(userDoc._id);

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
        // One id, one document: pinned here too, since this is the call that found the
        // old shape.
        expect(result.user._id).toBeTruthy();
        expect(result.user.username).toBe("test-user");
        // expect(result.keysMatch).toBe(true);
    });
});
