import { test as base, expect, type Page } from '@playwright/test';

/**
 * Fixture for initializing the DocStack client library in the browser.
 * 
 * This fixture injects the compiled library into the browser context and provides
 * helper methods to interact with the DocStack API.
 */
export type DocStackFixture = {
  initDocStack: (options?: { name?: string }) => Promise<any>;
  docStackPage: Page;
};

/**
 * Create a new Playwright test instance with DocStack fixtures.
 * 
 * This extends the base Playwright test with custom fixtures that provide
 * access to the compiled DocStack client library in a browser environment.
 * 
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures';
 * 
 * test('my test', async ({ docStackPage, initDocStack }) => {
 *   const docStack = await initDocStack({ name: 'test-db' });
 *   // ... test code
 * });
 * ```
 */
export const test = base.extend<DocStackFixture>({
  docStackPage: async ({ page }, use) => {
    // Inject the compiled DocStack library into the page context
    await page.addInitScript(async () => {
      // Make the compiled library available globally
      if (typeof window !== 'undefined') {
        (window as any).docstackLibrary = await import('../lib/index.js');
      }
    });

    await use(page);
  },

  initDocStack: async ({ docStackPage }, use) => {
    const initDocStack = async (options?: { name?: string }) => {
      return await docStackPage.evaluate(async (opts) => {
        // Access the compiled library that was injected
        const docStackLib = (window as any).docstackLibrary;
        if (!docStackLib) {
          throw new Error('DocStack library not loaded. Make sure the library is built and served at /dist/index.js');
        }

        // Initialize DocStack with the provided options
        const { DocStack } = docStackLib;
        const stackName = opts?.name || `docstack-test-${Date.now()}`;
        const docStack = new DocStack({ name: stackName });

        // Wait for the ready event
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('DocStack initialization timeout')), 10000);
          docStack.addEventListener('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        return {
          docStack,
          stackName,
          stack: docStack.getStack(stackName),
        };
      }, options);
    };

    await use(initDocStack);
  },
});

export { expect };
