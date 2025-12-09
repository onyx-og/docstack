#!/bin/bash

# DocStack Playwright Integration Test Script
# This script demonstrates how to run the integrated Playwright E2E tests

set -e

echo "========================================"
echo "DocStack Browser E2E Test Setup"
echo "========================================"
echo ""

# Step 1: Install dependencies
echo "Step 1: Installing dependencies..."
# npm install
echo "✓ Dependencies ready (run 'npm install' if needed)"
echo ""

# Step 2: Build the library
echo "Step 2: Building the client library..."
echo "Running: npm run build"
echo ""
echo "This generates:"
echo "  - lib/     → CommonJS/UMD bundle (Node.js)"
echo "  - dist/    → ES module bundle (browser/E2E tests)"
echo ""

# Step 3: Run tests
echo "Step 3: Running Playwright E2E tests..."
echo ""
echo "Available commands:"
echo "  npm test              - Run all E2E tests headless"
echo "  npm run test:headed   - Run tests with browser visible"
echo "  npm run test:debug    - Debug tests with Playwright Inspector"
echo ""

# Step 4: Explain the architecture
echo "========================================"
echo "Architecture Overview"
echo "========================================"
echo ""
echo "1. Playwright Configuration (playwright.config.ts)"
echo "   ├─ Configures test directory: ./e2e"
echo "   ├─ Sets up web server to serve built library"
echo "   └─ Supports Chromium, Firefox, WebKit"
echo ""

echo "2. Custom Fixtures (e2e/fixtures.ts)"
echo "   ├─ docStackPage - Playwright Page with library injected"
echo "   └─ initDocStack - Initialize DocStack in browser context"
echo ""

echo "3. Client Library (src/core/stack.ts)"
echo "   ├─ Detects browser vs Node.js environment"
echo "   ├─ Browser: imports pouchdb-browser (IndexedDB)"
echo "   └─ Node.js: imports pouchdb (memory/LevelDB)"
echo ""

echo "4. Build Output (rollup.config.js)"
echo "   ├─ lib/  → For Node.js (Jest tests)"
echo "   └─ dist/ → For browsers (E2E tests)"
echo ""

echo "5. Test Pattern"
echo "   ├─ Build library → npm run build"
echo "   ├─ Start server → http-server dist -p 3000"
echo "   ├─ Load in browser → page.evaluate(() => import('/dist/index.js'))"
echo "   └─ Test with fixtures → use initDocStack and docStackPage"
echo ""

echo "========================================"
echo "Example Test"
echo "========================================"
echo ""
echo "import { test, expect } from './fixtures';"
echo ""
echo "test('example', async ({ initDocStack }) => {"
echo "  const { stack } = await initDocStack({ name: 'test-db' });"
echo "  expect(stack).toBeDefined();"
echo "});"
echo ""

echo "========================================"
echo "Key Differences: Browser vs Node.js"
echo "========================================"
echo ""
echo "┌─────────────────┬──────────────────┬────────────────────┐"
echo "│ Aspect          │ Jest (Node.js)   │ Playwright (Browser)│"
echo "├─────────────────┼──────────────────┼────────────────────┤"
echo "│ Database        │ Memory/LevelDB   │ IndexedDB          │"
echo "│ PouchDB Version │ pouchdb          │ pouchdb-browser    │"
echo "│ Crypto Module   │ import crypto    │ window.crypto      │"
echo "│ Execution       │ Node.js process  │ Real browser       │"
echo "└─────────────────┴──────────────────┴────────────────────┘"
echo ""

echo "========================================"
echo "Quick Start"
echo "========================================"
echo ""
echo "1. Build the library:"
echo "   npm run build"
echo ""
echo "2. Run E2E tests:"
echo "   npm test"
echo ""
echo "3. Watch tests run:"
echo "   npm run test:headed"
echo ""
echo "4. View test report:"
echo "   npx playwright show-report"
echo ""

echo "========================================"
echo "Documentation"
echo "========================================"
echo ""
echo "See e2e/README.md for comprehensive testing guide"
echo "See PLAYWRIGHT_INTEGRATION.md for integration details"
echo ""
