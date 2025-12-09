/**
 * TypeScript Configuration for E2E Tests
 * 
 * This file documents how TypeScript is configured for Playwright E2E tests.
 * 
 * Configuration:
 * 1. Playwright automatically configures TypeScript compilation
 * 2. TypeScript files are compiled on-the-fly during test execution
 * 3. Configuration is inherited from the project's tsconfig.json
 * 
 * Key Settings:
 * - Module: ESM (required by Playwright)
 * - Target: ES2020+ (modern browser support)
 * - JSX: React (if using React components)
 * - Strict: true (for type safety)
 * 
 * Test Type Definitions:
 * All test files get type definitions from @playwright/test:
 * 
 *   import { test, expect } from '@playwright/test';
 *   // or with custom fixtures:
 *   import { test, expect } from './fixtures';
 * 
 * Custom Fixture Types:
 * 
 *   export type DocStackFixture = {
 *     initDocStack: (options?: { name?: string }) => Promise<any>;
 *     docStackPage: Page;
 *   };
 * 
 *   export const test = base.extend<DocStackFixture>({
 *     // fixture implementations
 *   });
 * 
 * Writing Typed Tests:
 * 
 *   test('example', async ({ docStackPage, initDocStack }) => {
 *     // docStackPage has type Page from @playwright/test
 *     // initDocStack has type from DocStackFixture
 *     const result = await initDocStack({ name: 'test' });
 *     expect(result).toBeDefined();
 *   });
 * 
 * Browser Context Types:
 * 
 * Code executed in browser context with page.evaluate() needs special handling:
 * 
 *   // ✓ Correct: Use page.evaluate with proper typing
 *   const result = await page.evaluate(() => {
 *     return typeof window.docstackLibrary !== 'undefined';
 *   });
 * 
 *   // ✓ Correct: Pass data to browser context
 *   await page.evaluate((data) => {
 *     console.log(data);
 *   }, { foo: 'bar' });
 * 
 *   // ✗ Avoid: Direct globals in browser context
 *   // Don't assume window, self, document are available in function scope
 * 
 * Library Typing in Browser:
 * 
 * The DocStack library is injected as:
 * 
 *   (window as any).docstackLibrary = {
 *     DocStack: <class>,
 *     // ... other exports
 *   }
 * 
 * Access it in tests:
 * 
 *   await page.evaluate(async () => {
 *     const { DocStack } = (window as any).docstackLibrary;
 *     const docStack = new DocStack({ name: 'test' });
 *     return docStack;
 *   });
 * 
 * Or via fixtures:
 * 
 *   const { docStack, stack } = await initDocStack({ name: 'test' });
 *   // These are already typed correctly
 * 
 * Common Patterns:
 * 
 * 1. Testing library initialization
 *    → Use initDocStack fixture
 * 
 * 2. Testing browser APIs  
 *    → Use page.evaluate() to access window/document
 * 
 * 3. Testing library methods
 *    → Use stack.method() on returned stack object
 * 
 * 4. Debugging types
 *    → Hover over variables in VS Code for type info
 *    → Use `type-check` to verify types without running tests
 * 
 * Performance Notes:
 * 
 * - TypeScript is compiled at test startup
 * - Compilation is cached between test runs
 * - Rebuild is triggered if tsconfig.json changes
 * - Use `--no-cache` flag to force recompilation if needed
 * 
 * Related Files:
 * - tsconfig.json (project root)
 * - playwright.config.ts
 * - e2e/fixtures.ts
 * - e2e/*.e2e.ts (test files)
 */
