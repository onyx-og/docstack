import type { UserSessionModel } from "@docstack/shared";
import { createAuthenticatedStack, createTestDocStack } from "../test-utils/docstack";

jest.setTimeout(20000);

describe("ClientStack authentication", () => {
    it("creates and stores a user session proof", async () => {
        const { stack, cleanup, proof, user } = await createAuthenticatedStack();
        try {
            expect(proof.session.username).toBe(user.username);
            const storedSession = await stack.db.get<UserSessionModel>(proof.session._id);
            expect(storedSession.sessionStatus).toBe("active");
            expect(stack.authSession?.session.sessionId).toBe(proof.session.sessionId);
            expect(proof.derivedKey).toBeDefined();
        } finally {
            await cleanup();
        }
    });

    it("rejects authentication for unknown users", async () => {
        const { stack, cleanup } = await createTestDocStack("auth-missing-user");
        try {
            await expect(stack.authenticate({ username: "ghost", password: "none" })).rejects.toThrow("not found");
        } finally {
            await cleanup();
        }
    });
});
