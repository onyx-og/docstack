import { test as it, expect } from './fixtures';

const describe = it.describe;

describe("ClientStack authentication", () => {
    it("creates and stores a user session proof", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: "auth-session-proof",
            username: "auth-test-user",
            password: "auth-test-pass",
            evaluate: async ({ stack }) => {
                // The fixture already authenticated, so we have a session
                const authSession = stack.authSession;
                if (!authSession) {
                    throw new Error("Expected authSession to be set after authentication");
                }

                const storedSession = await stack.db.get<any>(authSession.session._id);

                return {
                    sessionUsername: authSession.session.username,
                    storedSessionStatus: storedSession.sessionStatus,
                    authSessionId: authSession.session.sessionId,
                    storedSessionId: storedSession.sessionId,
                    hasDerivedKey: authSession.derivedKey !== undefined,
                };
            },
        });

        expect(result.sessionUsername).toBe("auth-test-user");
        expect(result.storedSessionStatus).toBe("active");
        expect(result.authSessionId).toBe(result.storedSessionId);
        expect(result.hasDerivedKey).toBe(true);
    });

    it("rejects authentication for unknown users", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { DocStack } = (window as any).docstack;

            const stackName = `auth-missing-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const docStack = new DocStack({ name: stackName });

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("DocStack initialization timeout")), 10000);
                docStack.addEventListener("ready", () => { clearTimeout(timeout); resolve(); });
            });

            const stack = docStack.getStack(stackName);
            if (!stack) {
                throw new Error(`Failed to resolve stack '${stackName}'`);
            }

            let threwNotFound = false;
            let errorMessage = "";
            try {
                await stack.authenticate({ username: "ghost", password: "none" });
            } catch (e: any) {
                threwNotFound = true;
                errorMessage = e.message || "";
            }

            return { threwNotFound, errorMessage };
        });

        expect(result.threwNotFound).toBe(true);
        expect(result.errorMessage).toContain("not found");
    });
});
