# Vendor Bundle Strategy

## Overview

The vendor bundle is a separate build artifact that bundles all external dependencies used by the DocStack client library. This approach enables clean browser-based testing in a monorepo environment where dependencies are located at the root `node_modules/` directory.

## Problem Statement

In a monorepo structure, `node_modules/` exists at the root level, not within individual package directories. When serving a package via HTTP (e.g., for Playwright E2E tests), the HTTP server's working directory is typically restricted to the package folder, making relative paths to the root-level `node_modules/` inaccessible.

**Issue with direct script loading:**
```html
<!-- These paths don't work when serving from packages/client/ -->
<script src="../../../node_modules/winston/lib/winston.js"></script>
<script src="../../../node_modules/pouchdb/dist/pouchdb.js"></script>
```

**Solution:** Bundle all dependencies into a single, self-contained vendor bundle that can be served from within the package directory.

## Architecture

### Files Involved

1. **`rollup.vendor.js`** - Rollup configuration for building the vendor bundle
2. **`src/vendor.js`** - Entry point that imports and re-exports all external dependencies
3. **`test/vendor-bundle.js`** - Generated output (included in .gitignore)
4. **`test/index.html`** - Test page that loads the vendor bundle before the library

### Build Process

```bash
# Build main library + vendor bundle
npm run build

# Build vendor bundle only
npm run build:vendor
```

The `build` script runs both configurations sequentially:
```json
{
  "build": "rollup --config ./rollup.config.js && rollup --config ./rollup.vendor.js"
}
```

## How It Works

### 1. Vendor Entry Point (`src/vendor.js`)

Imports and re-exports all external dependencies as a unified module:

```javascript
// Polyfills
import 'setimmediate';

// Logging
export { default as winston } from 'winston';
export { default as Transport } from 'winston-transport';

// Database
export { default as PouchDB } from 'pouchdb';
export { default as PouchDBBrowser } from 'pouchdb-browser';
export { default as PouchDBFind } from 'pouchdb-find';

// Utilities
export * as zod from 'zod';
export * as semver from 'semver';
export { default as jsondiffpatch } from 'jsondiffpatch';
```

### 2. Vendor Bundle Config (`rollup.vendor.js`)

Uses Rollup plugins to bundle the entry point into an IIFE (Immediately Invoked Function Expression):

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: './src/vendor.js',
  output: {
    file: 'test/vendor-bundle.js',
    format: 'iife',
    name: 'DocStackVendor',
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
  ]
};
```

**Key Configuration:**
- **format: 'iife'** - Wraps everything in a self-executing function, making it runnable with just a `<script>` tag
- **resolve plugin** - Resolves package imports from `node_modules/`
- **commonjs plugin** - Converts CommonJS modules to ES modules that Rollup can bundle
- **browser: true** - Prefers browser-compatible versions of packages (e.g., `pouchdb-browser` over `pouchdb`)

### 3. Test Page (`test/index.html`)

Simple HTML page that loads the vendor bundle and library:

```html
<script src="../test/vendor-bundle.js"></script>
<script src="../lib/index.js"></script>
```

The vendor bundle is loaded first, ensuring all dependencies are available globally before the DocStack library is loaded.

## Benefits

1. **Monorepo Compatibility** - Avoids relative path issues with root-level `node_modules/`
2. **Single Dependency Bundle** - Reduces HTML script tag count from 9 to 1
3. **Cleaner Test Environment** - All external setup happens in a single bundle
4. **Versioning Control** - Bundling strategy is explicitly defined in rollup config
5. **Browser Environment Support** - Works with any modern browser environment

## Integration with Playwright

The vendor bundle works seamlessly with Playwright testing:

1. **Browser Launch** - Playwright serves `test/index.html`
2. **Vendor Load** - Browser loads `vendor-bundle.js` first
3. **Library Load** - Browser loads `lib/index.js` (UMD bundle with dependencies available)
4. **ES Module Tests** - Optional dynamic import of `dist/index.js` for ES module testing

## Differences from Main Build

| Aspect | Main Build (`rollup.config.js`) | Vendor Bundle (`rollup.vendor.js`) |
|--------|----------------------------------|-------------------------------------|
| **Input** | `src/index.ts` | `src/vendor.js` |
| **Output Format** | UMD (`lib/`) and ES (`dist/`) | IIFE |
| **External Deps** | Declared as external | Bundled |
| **Purpose** | Production library | Development/testing |
| **Frequency** | Every build | Only when deps change |

## Maintenance

When adding new external dependencies:

1. Add to `src/vendor.js` exports:
   ```javascript
   export { default as MyPackage } from 'my-package';
   ```

2. Rebuild vendor bundle:
   ```bash
   npm run build:vendor
   ```

3. The `test/vendor-bundle.js` will be updated automatically

## Troubleshooting

### "Cannot find package" error during build

**Cause:** Missing `@rollup/plugin-commonjs` or `@rollup/plugin-node-resolve`

**Solution:**
```bash
cd /workspaces/docstack
npm install
```

### Vendor bundle is empty or missing exports

**Cause:** Dependencies not properly exported in `src/vendor.js`

**Solution:** Verify each export exists in the source file and matches the actual export name from the package.

### Library loads but dependencies are undefined

**Cause:** Vendor bundle loaded after the main library

**Solution:** Ensure vendor bundle script tag comes before the library script tag in HTML:
```html
<!-- Correct order -->
<script src="../test/vendor-bundle.js"></script>
<script src="../lib/index.js"></script>
```

## Future Enhancements

- Cache busting: Add content hash to bundle filename
- Tree shaking: Remove unused exports from vendor bundle
- Split bundles: Separate vendor bundles for different test scenarios
