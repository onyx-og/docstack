// The wasm glue and embedded bytes are plain JS vendored artifacts; tsc
// type-checks them through their sibling .d.ts files but does not emit them.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src", "wasm");
const out = join(here, "..", "lib", "wasm");
mkdirSync(out, { recursive: true });
for (const file of ["glue.js", "glue.d.ts", "bytes.js", "bytes.d.ts"]) {
    copyFileSync(join(src, file), join(out, file));
}
console.log("wasm artifacts copied to lib/wasm");
