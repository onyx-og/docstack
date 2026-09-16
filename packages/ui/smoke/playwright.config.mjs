import { defineConfig } from "@playwright/test";

// `npm run test` in packages/ui builds first (pretest) and then runs this; a bare
// `npx playwright test -c smoke/playwright.config.mjs` drives whatever is in build/.
export default defineConfig({
    testDir: ".",
    testMatch: "smoke.spec.mjs",
    outputDir: "../test-results",
    timeout: 90_000,
    reporter: [["line"]],
    webServer: {
        command: "node serve.mjs",
        url: "http://127.0.0.1:3100/docstack/app/",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
    use: { baseURL: "http://127.0.0.1:3100" },
});
