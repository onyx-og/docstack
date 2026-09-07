/**
 * Lazy WASM instantiation. The module bytes ride the bundle base64-embedded
 * (no fetch, no asset path — every bundler and the browser test harness see
 * plain JS), but nothing compiles until the first ABE call: a stack that never
 * touches scopes pays bytes, not startup. Instantiation is ASYNC on purpose —
 * Chrome caps synchronous WebAssembly compilation on the main thread, so
 * `initSync` over a 600 KB module is a browser refusal waiting to happen.
 */
import init, * as glue from "./wasm/glue.js";
import { WASM_BASE64 } from "./wasm/bytes.js";

export type AbeApi = {
    setup(): string;
    cp_keygen(mskJson: string, attrsJson: string): string;
    cp_encrypt(pkJson: string, policy: string, plaintext: Uint8Array): string;
    cp_decrypt(skJson: string, ctJson: string): Uint8Array;
};

let ready: Promise<AbeApi> | null = null;

const decode = (b64: string): Uint8Array => {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

export const ensureAbe = (): Promise<AbeApi> => {
    if (!ready) {
        ready = init({ module_or_path: decode(WASM_BASE64) }).then(() => glue as unknown as AbeApi);
    }
    return ready;
};
