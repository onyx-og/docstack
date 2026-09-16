// Serves the production build the way the docs site hosts it: under /docstack/app,
// with the single-page fallback the router relies on. No dependencies, so the smoke
// test needs nothing beyond Playwright.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PREFIX = "/docstack/app";
const ROOT = path.resolve(process.env.WB_BUILD_DIR ?? fileURLToPath(new URL("../build/", import.meta.url)));
const PORT = Number(process.env.PORT ?? 3100);
const TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".map": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject",
    ".wasm": "application/wasm",
};

const resolve = async (pathname) => {
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return null;
    const relative = decodeURIComponent(pathname.slice(PREFIX.length)).replace(/^\/+/, "");
    const candidate = path.resolve(ROOT, relative);
    if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
    try {
        if ((await stat(candidate)).isFile()) return candidate;
    } catch {
        // Not a file: fall through to the application shell.
    }
    return path.join(ROOT, "index.html");
};

createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const file = await resolve(pathname);
    if (!file) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end(`not under ${PREFIX}`);
        return;
    }
    try {
        const body = await readFile(file);
        response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
        response.end(body);
    } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(error?.message ?? String(error));
    }
}).listen(PORT, "127.0.0.1", () => {
    console.log(`workbench build served at http://127.0.0.1:${PORT}${PREFIX}/ from ${ROOT}`);
});
