# Playwright Integration Summary

This document outlines the Playwright integration with custom fixtures and TypeScript configuration for browser-based testing of the DocStack client library.

## Changes Made

### 1. Playwright Configuration (`playwright.config.ts`)

**New file**: `/packages/client/playwright.config.ts`

- Defines test directory as `./e2e`
- Configures base URL for the test server
- Sets up web server to automatically build and serve the library
- Configures browsers: Chromium, Firefox, WebKit
- Enables HTML reporting
- Sets up trace collection on test failures

### 2. Custom Playwright Fixtures (`e2e/fixtures.ts`)

**New file**: `/packages/client/e2e/fixtures.ts`

Provides two custom fixtures:

#### `docStackPage: Page`
- Injects the compiled DocStack library into the browser context
- Makes the library available at `window.docstackLibrary`
- Provides the Playwright Page object for direct browser interaction

#### `initDocStack: (options?) => Promise<any>`
- Initializes a DocStack instance in the browser environment
- Returns: `{ docStack, stack, stackName }`
- Handles library loading and ready event waiting
- Allows per-test configuration

**Usage**:
```typescript
import { test, expect } from './fixtures';

test('example', async ({ docStackPage, initDocStack }) => {
  const { stack } = await initDocStack({ name: 'test-db' });
  expect(stack).toBeDefined();
});
```

### 3. Sample E2E Tests (`e2e/auth.e2e.ts`)

**New file**: `/packages/client/e2e/auth.e2e.ts`

Includes example tests for:
- DocStack initialization in browser
- Environment validation (IndexedDB, crypto APIs)
- Global object verification (window, self)

### 4. Client Library Updates (`src/core/stack.ts`)

**Modified**: `/packages/client/src/core/stack.ts`

#### Environment-Aware PouchDB Import
```typescript
if (isBrowserEnv) {
  PouchDB = (await import('pouchdb-browser')).default;
} else {
  PouchDB = (await import('pouchdb')).default;
}
```

The library now automatically selects:
- **Browser**: `pouchdb-browser` with IndexedDB adapter
- **Node.js**: `pouchdb` with configured adapters

#### Cross-Environment Crypto Utilities

Added helper functions for environment-compatible crypto operations:

```typescript
function getRandomHex(size: number): string
function getRandomUUID(): string
```

These handle the differences between:
- **Browser**: `crypto.getRandomValues()`, `crypto.randomUUID()`
- **Node.js**: `crypto.randomBytes()`, custom UUID generation

### 5. Rollup Configuration Updates (`rollup.config.js`)

**Modified**: `/packages/client/rollup.config.js`

Now generates two output formats:

1. **lib/** (UMD) - For Node.js and traditional bundlers
2. **dist/** (ES Module) - For browser and E2E tests

Example pattern for browser test library loading:
```typescript
// Test file loads from:
const { docstack } = await import('/dist/index.js');
```

### 6. Package.json Updates

**Modified**: `/packages/client/package.json`

#### New Dependencies
```json
{
  "dependencies": {
    "pouchdb-browser": "^9.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "http-server": "^14.1.1"
  }
}
```

#### New Scripts
```json
{
  "test": "playwright test",
  "test:headed": "playwright test --headed",
  "test:debug": "playwright test --debug",
  "serve:test": "npx http-server dist -p 3000 -c-1"
}
```

### 7. Documentation

**New files**:
- `/packages/client/e2e/README.md` - Comprehensive E2E testing guide
- `/packages/client/e2e/.gitignore` - Playwright artifacts and test databases
- `/packages/client/.playwrightrc.json` - IDE plugin support

## Architecture Pattern

The integration follows this pattern for browser test library loading:

```typescript
// 1. Test configuration (playwright.config.ts)
webServer: {
  command: 'npm run build && npm run serve:test',
  url: 'http://127.0.0.1:3000'
}

// 2. Fixture injects library (fixtures.ts)
await page.addInitScript(async () => {
  (window as any).docstackLibrary = await import('/dist/index.js');
});

// 3. Test uses library (auth.e2e.ts)
test('example', async ({ docStackPage, initDocStack }) => {
  const { stack } = await initDocStack();
  // stack uses pouchdb-browser (IndexedDB) automatically
});
```

## Key Benefits

1. **True Browser Testing**: Tests run in actual browsers with IndexedDB
2. **Automatic Environment Detection**: Library detects browser vs Node.js automatically
3. **Custom Fixtures**: Simplified test writing with `initDocStack` and `docStackPage`
4. **TypeScript Support**: Full TypeScript configuration for tests
5. **Cross-Browser**: Same tests run on Chromium, Firefox, and WebKit
6. **CI/CD Ready**: Configuration automatically adjusts for CI environments

## Testing Patterns

### Pattern 1: Simple Initialization
```typescript
test('initialize', async ({ initDocStack }) => {
  const { stack } = await initDocStack();
  expect(stack).toBeDefined();
});
```

### Pattern 2: Browser Context Operations
```typescript
test('query data', async ({ docStackPage }) => {
  const result = await docStackPage.evaluate(async () => {
    const { DocStack } = (window as any).docstackLibrary;
    // Use DocStack in browser context
  });
});
```

### Pattern 3: Combined Usage
```typescript
test('create and retrieve', async ({ docStackPage, initDocStack }) => {
  const { stack } = await initDocStack();
  
  // Use fixture to initialize
  await docStackPage.evaluate(async () => {
    // Then use in browser context
    const { DocStack } = (window as any).docstackLibrary;
  });
});
```

## Differences from Node.js Tests

| Aspect | Jest (Node.js) | Playwright (Browser) |
|--------|---|---|
| **Database Adapter** | Memory/LevelDB | IndexedDB |
| **Crypto Module** | `import crypto` | `window.crypto` |
| **PouchDB Version** | `pouchdb` | `pouchdb-browser` |
| **Globals** | Jest globals | Browser globals |
| **Storage** | File system/Memory | IndexedDB/LocalStorage |
| **Execution Context** | Node.js process | Actual browser |

## Running the Tests

```bash
# Build the library and run all E2E tests
npm run build && npm test

# Run with browser visible
npm run test:headed

# Debug with Playwright inspector
npm run test:debug

# Run specific test
npx playwright test e2e/auth.e2e.ts
```

## Next Steps

1. Add more comprehensive E2E tests in `/e2e/` directory
2. Configure CI/CD pipeline to run E2E tests
3. Add performance benchmarks using Playwright
4. Set up visual regression testing if needed
5. Integrate with test reporting systems

## Troubleshooting

**Q: Tests fail with "library not loaded"**
A: Ensure `npm run build` completes successfully and creates `/dist/index.js`

**Q: Crypto errors in browser**
A: The library's `getRandomHex()` and `getRandomUUID()` functions should handle this automatically

**Q: Port 3000 already in use**
A: Change the port in both `playwright.config.ts` and `package.json` scripts
