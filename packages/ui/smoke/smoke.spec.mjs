import { test, expect } from "@playwright/test";

// The workbench has no unit tests. This is the check that the production build runs:
// one React in the bundle (a duplicate compiles fine and breaks every hook at
// runtime), the provider opening a fresh browser stack, and the debug panel's export
// and restore going through the engine's content transfer.
test("the built workbench opens a fresh stack, exports it and restores it, without runtime errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.goto("/docstack/app/");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: 30_000 });
    const stackInput = page.locator('input[name="stackName"]');
    await expect(stackInput).toBeVisible();
    const stackName = `smoke-${Date.now()}`;
    await stackInput.fill(stackName);
    await page.getByRole("button", { name: "Login" }).click();

    // The provider has opened the stack once the status bar shows a real schema version.
    await expect(page.getByText(`Stack: ${stackName}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Schema version: \d/)).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Debug panel" }).click();
    await page.getByRole("button", { name: "Create Dump" }).click();
    await expect(page.getByTestId("debug-status")).toContainText("Export ready", { timeout: 20_000 });
    // The anchor carries the Blob URL; Prismal wraps it in a button of its own.
    const download = page.locator("a[download]");
    await expect(download).toBeVisible();
    await expect(download).toHaveText("Download export");

    const exported = await page.evaluate(async (href) => (await fetch(href)).text(), await download.getAttribute("href"));
    await page.locator('input[type="file"]').setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(exported) });
    await expect(page.getByTestId("debug-status")).toContainText("Restored:", { timeout: 30_000 });

    const fatal = errors.filter((entry) => /Invalid hook call|Minified React error|reading 'useContext'|is not a function/.test(entry));
    expect(fatal, errors.join("\n")).toEqual([]);
});
