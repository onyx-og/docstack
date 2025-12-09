# DocStack Browser E2E Tests

This directory contains end-to-end tests for the DocStack client library running in a browser environment using Playwright.

## Overview

These tests run the **compiled browser version** of the DocStack library (using `pouchdb-browser` with IndexedDB) instead of the Node.js version. This ensures tests verify the browser-specific behavior and integration points.

### Key Features

- **Browser Environment**: Tests run in a real browser context (Chromium, Firefox, WebKit)
- **Compiled Library**: Uses the built `/dist/index.js` from the Rollup build
- **Custom Fixtures**: Provides `initDocStack` and `docStackPage` fixtures for easy library interaction
- **IndexedDB Storage**: Uses browser's IndexedDB instead of Node.js adapters
- **Cross-Browser Support**: Run the same tests across multiple browsers

## Setup

### Install Dependencies

```bash
npm install
```

### Build the Library

Before running tests, build the library:

```bash
npm run build
```

This generates:
- `lib/` - CommonJS/UMD bundle (for Node.js)
- `dist/` - ES module bundle (for browser/tests)

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Headed Mode

Watch the tests run in the browser:

```bash
npm run test:headed
```

### Debug Tests

Pause and step through tests:

```bash
npm run test:debug
```

### Run Specific Test

```bash
npx playwright test auth.e2e.ts
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from './fixtures';

test('my test', async ({ docStackPage, initDocStack }) => {
  // Use the fixtures to interact with DocStack
  const result = await initDocStack({ name: 'my-test-db' });
  
  // Test your code
  expect(result.stack).toBeDefined();
});
```

### Available Fixtures

#### `docStackPage: Page`
The Playwright `Page` object with the DocStack library pre-loaded.

```typescript
test('example', async ({ docStackPage }) => {
  // Execute code in the browser context
  const result = await docStackPage.evaluate(() => {
    return typeof window.docstackLibrary !== 'undefined';
  });
  expect(result).toBe(true);
});
```

#### `initDocStack: (options?) => Promise<any>`
Initializes a DocStack instance in the browser.

```typescript
test('example', async ({ initDocStack }) => {
  const { docStack, stack, stackName } = await initDocStack({ 
    name: 'my-database' 
  });
  
  expect(stack).toBeDefined();
  expect(stackName).toContain('my-database');
});
```

### Example Test

```typescript
test('should create and query documents', async ({ docStackPage, initDocStack }) => {
  const { stack } = await initDocStack({ name: 'doc-test' });
  
  // Create a document
  const doc = {
    _id: 'test-1',
    '~class': 'TestClass',
    name: 'Test Document',
    active: true,
  };
  
  // Evaluate code in the browser to use the stack
  const created = await docStackPage.evaluate(async (testDoc) => {
    const { DocStack } = (window as any).docstackLibrary;
    // Your test logic here
    return { success: true };
  }, doc);
  
  expect(created.success).toBe(true);
});
```

## Configuration

### Playwright Config (`playwright.config.ts`)

The configuration defines:
- **Test directory**: `./e2e`
- **Base URL**: `http://127.0.0.1:3000` (configured in `webServer`)
- **Browsers**: Chromium, Firefox, WebKit
- **Build server**: Automatically builds and serves the library
- **Reporters**: HTML report

To modify test behavior, edit `playwright.config.ts`.

### Fixtures (`fixtures.ts`)

The custom test fixtures:
1. **docStackPage**: Injects the library before test runs
2. **initDocStack**: Initializes DocStack in browser context

To modify fixture behavior, edit `fixtures.ts`.

## Troubleshooting

### Library Not Found Error

If tests fail with "DocStack library not loaded", ensure:

1. Run `npm run build` before tests
2. Check that `/dist/index.js` exists
3. Verify the web server is running on `http://127.0.0.1:3000`

### IndexedDB Access Issues

If tests fail with IndexedDB errors:

1. Make sure you're in browser context (not Node.js)
2. Check that the test uses the `docStackPage` fixture
3. Verify `crypto` APIs are available in the browser

### Port Already in Use

If port 3000 is in use:

Edit `playwright.config.ts` and change:
```typescript
webServer: {
  url: 'http://127.0.0.1:3001', // Change port
  // ...
}
```

Then update `package.json` script:
```json
"serve:test": "npx http-server dist -p 3001 -c-1"
```

## Test Report

After running tests, view the HTML report:

```bash
npx playwright show-report
```

This opens an interactive report showing:
- Test results
- Screenshots/videos (if enabled)
- Test timings
- Error details

## Architecture Notes

### Browser vs Node.js

This test suite uses the **browser-compiled version** of the library. The key difference:

- **Browser**: Uses `pouchdb-browser` with IndexedDB adapter
- **Node.js**: Uses `pouchdb` with memory/LevelDB adapters

The library's `stack.ts` file automatically detects the environment and imports the correct version:

```typescript
if (isBrowserEnv) {
  PouchDB = (await import('pouchdb-browser')).default;
} else {
  PouchDB = (await import('pouchdb')).default;
}
```

### Web Server

The tests use `http-server` to serve the compiled library at `/dist/index.js`. This mimics real-world usage where:

1. Client library is built and bundled
2. Served over HTTP
3. Loaded in browser context
4. Tests interact with the loaded library

## Performance Tips

1. **Parallel Execution**: Tests run in parallel by default; set `fullyParallel: false` to run sequentially
2. **Reuse Servers**: Set `reuseExistingServer: true` to avoid rebuilding between test runs
3. **Headed Mode**: Use `test:headed` to debug specific tests instead of headless mode

## Contributing

When adding new tests:

1. Place test files in `e2e/` directory
2. Name with `.e2e.ts` suffix
3. Import fixtures from `./fixtures`
4. Document complex test logic with comments
5. Keep tests focused and isolated
6. Avoid hardcoded data; use fixtures for setup

## CI/CD Integration

To run these tests in CI:

```bash
npm install
npm run build
npm test
```

The `playwright.config.ts` automatically:
- Uses single worker in CI mode
- Enables retries on failure
- Disables server reuse
- Collects trace on first retry

See the configuration section for CI-specific settings.
