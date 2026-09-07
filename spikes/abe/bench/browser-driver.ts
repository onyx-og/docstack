/** Serves the spike dir, opens bench/browser.html in Chromium (borrowed from the
 *  client package's playwright install), prints the page's collected lines. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const ROOT = normalize(join(import.meta.dirname, ".."));
const MIME: Record<string, string> = {
    ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm",
    ".ts": "text/plain", ".map": "application/json",
};

const require = createRequire(import.meta.url);
const CLIENT = process.env.CLIENT_PKG ?? "/home/onyxo/docstack/packages/client";
// playwright-core ships inside the client's @playwright/test.
const { chromium } = require(require.resolve("playwright-core", { paths: [CLIENT] }));

const server = createServer(async (request, response) => {
    try {
        const path = normalize(join(ROOT, decodeURIComponent((request.url ?? "/").split("?")[0])));
        if (!path.startsWith(ROOT)) throw new Error("traversal");
        const body = await readFile(path);
        response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
        response.end(body);
    } catch {
        response.writeHead(404); response.end("not found");
    }
});

await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as { port: number };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/bench/browser.html`);
await page.waitForFunction("window.__DONE === true", null, { timeout: 300000 });
const lines: string[] = await page.evaluate("window.__LINES");
const failed: boolean = await page.evaluate("window.__FAILED");
await browser.close();
server.close();

console.log(lines.join("\n"));
console.log(failed ? "\nBROWSER BENCH FAILURES" : "\nbrowser bench complete");
process.exit(failed ? 1 : 0);
