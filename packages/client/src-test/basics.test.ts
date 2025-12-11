// import { createAuthenticatedStack, createTestDocStack } from "../test-utils/docstack";
import { test as it, expect } from './fixtures';
// const describe = test.describe;

/**
 * E2E tests for DocStack client library running in browser environment.
 * 
 * These tests use the compiled browser version of the library (pouchdb-browser)
 * instead of the Node.js version. The library is injected into the browser context
 * via Playwright fixtures.
 */

it.describe('DocStack Basics', () => {
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

  it('stack should provide db infos', async ({ docStackPage }) => {
    const dbInfo = await docStackPage.evaluate(async () => {
      const docStackLib = (window as any).docstack;
      const { DocStack } = docStackLib;
      const stackName = 'db-info-test';
      const docStack = new DocStack({ name: stackName });
      await new Promise<void>((resolve) => docStack.addEventListener('ready', () => resolve()));
      
      const stack = docStack.getStack(stackName);
      if (!stack) throw new Error('Stack not found');
      
      const info = await stack.getDbInfo();
      return { ...info, expectedName: stack.getDbName() };
    });
    expect(dbInfo.db_name).toBe(dbInfo.expectedName);
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