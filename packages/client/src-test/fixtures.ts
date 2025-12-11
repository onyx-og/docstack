import { test as base, expect, type Page } from '@playwright/test';
import { ClientStack, DocStack } from '../lib';

type EvaluateInBrowser<T> = (args: {
  docStack: DocStack;
  stack: ClientStack;
  stackName: string;
}) => T | Promise<T>;
/**
 * Fixture for initializing the DocStack client library in the browser.
 * 
 * This fixture injects the compiled library into the browser context and provides
 * helper methods to interact with the DocStack API.
 */
export type DocStackFixture = {
  useDocStack: <T>(options: { name?: string; evaluate: EvaluateInBrowser<T> }) => Promise<T>;
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
    // Navigate to the test page where the DocStack library is already loaded.
    await page.goto('/test/index.html', { waitUntil: 'load' });
    await use(page);
  },
  /**
   * Initialize the DocStack client library in the browser.
   * the ClientStack instance is being serialized 
   * when it's passed from the browser context back to your Node.js test runner.
   *  The page.evaluate function in Playwright returns a JSON-serializable representation of the object,
   * which means all the methods (functions) are stripped away, leaving you with just the data properties.
   * To fix this, you need to work with the ClientStack instance inside the browser context
   *  where it's "alive" and has all its methods
   **/ 
  useDocStack: async ({ docStackPage }, use) => {
    const initDocStack = async <T>(options: { name?: string; evaluate: EvaluateInBrowser<T> }) => {
      // The 'evaluate' function is passed as a string to the browser context.
      return await docStackPage.evaluate(async ({ name, evaluate }) => {
        // Access the compiled library that was injected
        const docStackLib = (window as any).docstack;
        if (!docStackLib) {
          throw new Error('DocStack library not found on window.docstack. Make sure it is loaded by the test page.');
        }

        // Initialize DocStack with the provided options
        const { DocStack } = docStackLib;
        const stackName = name || `docstack-test-${Date.now()}`;
        const docStack = new DocStack({ name: stackName });

        // Wait for the ready event
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('DocStack initialization timeout')), 10000);
          docStack.addEventListener('ready', () => { clearTimeout(timeout); resolve(); });
        });

        const stack = docStack.getStack(stackName);
        if (!stack) {
            throw new Error(`Failed to resolve stack '${stackName}'`);
        }

        // Reconstruct and execute the evaluate function in the browser
        const evaluateFunc = new Function('return ' + evaluate)();
        return await evaluateFunc({ docStack, stack, stackName });
      }, { name: options.name, evaluate: options.evaluate.toString() });
    };
    
    await use(initDocStack);
  },
});

export { expect };
