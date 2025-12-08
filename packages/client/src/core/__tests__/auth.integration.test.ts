import type { UserSessionModel } from "@docstack/shared";
import { createAuthenticatedStack, createTestDocStack } from "../test-utils/docstack";
import { DocStack } from "..";
// import { test as it, expect } from '../../fixtures';
// const describe = test.describe;


describe("ClientStack authentication", () => {
    it("creates and stores a user session proof", async () => {
        const { stack, cleanup, proof, user } = await createAuthenticatedStack({"stack": "auth-session-proof"});
        try {
            expect(proof.session.username).toBe(user.username);
            const storedSession = await stack.db.get<UserSessionModel>(proof.session._id);
            expect(storedSession.sessionStatus).toBe("active");
            expect(stack.authSession?.session.sessionId).toBe(proof.session.sessionId);
            expect(proof.derivedKey).toBeDefined();
        } finally {
            await cleanup();
            setTimeout(() => {}, 10000); // allow async cleanup to finish
        }
    });

    it("rejects authentication for unknown users", async () => {
        // const { stack, cleanup } = await createTestDocStack("auth-missing-user");
        const stackName = `${"auth-missing-user"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const docStack = new DocStack({ name: stackName });
        await new Promise<void>((resolve) => {
            docStack.addEventListener("ready", async () => {
                const stack = docStack.getStack(stackName);
                if (!stack) {
                    throw new Error(`Failed to resolve stack '${stackName}'`);
                }
                try {
                    await expect(stack.authenticate({ username: "ghost", password: "none" })).rejects.toThrow("not found");
                } finally {
                    // await cleanup();
                    resolve();
                }
            })
        })
        
       
    });
});
