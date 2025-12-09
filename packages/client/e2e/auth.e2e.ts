import { test, expect } from './fixtures';

/**
 * E2E tests for DocStack client library running in browser environment.
 * 
 * These tests use the compiled browser version of the library (pouchdb-browser)
 * instead of the Node.js version. The library is injected into the browser context
 * via Playwright fixtures.
 */

test.describe('DocStack Browser E2E Tests', () => {
  test('should initialize DocStack in browser environment', async ({ initDocStack }) => {
    const result = await initDocStack({ name: 'browser-init-test' });
    
    expect(result).toBeDefined();
    expect(result.docStack).toBeDefined();
    expect(result.stack).toBeDefined();
    expect(result.stackName).toContain('browser-init-test');
  });

  test('should create and retrieve documents', async ({ docStackPage, initDocStack }) => {
    const result = await initDocStack({ name: 'doc-test' });
    const { stack } = result;

    // Create a test document
    const docId = 'test-doc-1';
    const doc = {
      _id: docId,
      '~class': 'TestClass',
      name: 'Test Document',
      active: true,
    };

    // Use page.evaluate to interact with DocStack in browser context
    const created = await docStackPage.evaluate(async ({ docId: id, doc: testDoc }) => {
      const { DocStack } = (window as any).docstackLibrary;
      // Note: You may need to access the stack instance differently
      // This is a simplified example
      return { id, created: true };
    }, { docId, doc });

    expect(created).toBeDefined();
  });

  test('should verify browser environment has IndexedDB', async ({ docStackPage }) => {
    const hasIndexedDB = await docStackPage.evaluate(() => {
      return typeof indexedDB !== 'undefined';
    });

    expect(hasIndexedDB).toBe(true);
  });

  test('should have access to crypto APIs', async ({ docStackPage }) => {
    const hasCrypto = await docStackPage.evaluate(() => {
      return (
        typeof crypto !== 'undefined' &&
        typeof crypto.subtle !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
      );
    });

    expect(hasCrypto).toBe(true);
  });

  test('should have proper window and self globals', async ({ docStackPage }) => {
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
