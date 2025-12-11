import type { UserSessionModel } from "@docstack/shared";
// import { createAuthenticatedStack, createTestDocStack } from "../test-utils/docstack";
import { DocStack, ClientStack, Class } from "../lib";
import { test as it, expect } from './fixtures';
// const describe = test.describe;

/**
 * E2E tests for DocStack client library running in browser environment.
 * 
 * These tests use the compiled browser version of the library (pouchdb-browser)
 * instead of the Node.js version. The library is injected into the browser context
 * via Playwright fixtures.
 */

it.describe('DocStack Browser E2E Tests', () => {
  it('should initialize DocStack in browser environment', async ({ initDocStack }) => {
    const result = await initDocStack({ name: 'browser-init-test' });
    
    expect(result).toBeDefined();
    expect(result.docStack).toBeDefined();
    expect(result.stack).toBeDefined();
    expect(result.stackName).toContain('browser-init-test');
  });

  it('docstack should containt one stack', async ({ docStackPage, initDocStack }) => {
    const result = await initDocStack({ name: 'doc-test' });
    const { stack, docStack } = result;

    expect(docStack.stacks.length).toBeGreaterThan(0)
  });

  it('stack should provide db infos', async ({ docStackPage, initDocStack }) => {
    const result = await initDocStack({ name: 'doc-test' });
    const { docStack } = result;

    const stack = docStack.stacks[0];
    const dbInfo = await stack.getDbInfo()
    expect(dbInfo).toHaveProperty('db_name')
  });

  it('should verify browser environment has IndexedDB', async ({ docStackPage }) => {
    const hasIndexedDB = await docStackPage.evaluate(() => {
      return typeof indexedDB !== 'undefined';
    });

    expect(hasIndexedDB).toBe(true);
  });

  it('should have access to crypto APIs', async ({ docStackPage }) => {
    const hasCrypto = await docStackPage.evaluate(() => {
      return (
        typeof crypto !== 'undefined' &&
        typeof crypto.subtle !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
      );
    });

    expect(hasCrypto).toBe(true);
  });

  it('should have proper window and self globals', async ({ docStackPage }) => {
    const globals = await docStackPage.evaluate(() => {
      return {
        hasWindow: typeof window !== 'undefined',
        hasSelf: typeof self !== 'undefined',
        windowIsSelf: window === self,
      };
    });

    expect(globals.hasWindow).toBe(true);
    expect(globals.hasSelf).toBe(true);
    expect(globals.windowIsSelf).toBe(true);
  });
});



/*
it.describe("ClientStack authentication", () => {
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
*/