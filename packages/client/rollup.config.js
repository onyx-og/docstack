import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// Externalize the storage layer and the shared runtime libraries - they load from
// node_modules. `@docstack/shared` and `@docstack/abe` are NOT externalized: they are
// bundled into the output.
// Node core modules are deliberately absent: nothing here imports them, and listing them
// as external would let one back in silently. If a build starts warning about an
// unresolved 'fs' or 'stream', a dependency has dragged Node into the browser bundle
// again - fix that rather than re-adding it here.
const external = ['pouchdb', 'pouchdb-browser', 'pouchdb-find', 'zod', 'semver', 'jsondiffpatch'];

// `browser: true` honours package.json "browser" fields: pouchdb-selector-core (and the
// pouchdb-utils tree under it) ships Node variants whose isBinaryObject references Buffer
// - resolving those into a browser bundle throws "Buffer is not defined" on the first
// selector match. The Node build resolves the Node variants instead.
const plugins = ({ browser }) => [
    resolve({
        preferBuiltins: !browser,
        browser,
        extensions: ['.mjs', '.js', '.json', '.node', '.ts'],
    }),
    commonjs(),
    json(),
    typescript(),
];

export default [
    {
        // UMD bundle for script-tag use. The lazy `import("@docstack/abe")` would otherwise
        // ask for a chunk, which the single-file UMD format cannot carry.
        input: './src/index.ts',
        external,
        output: {
            file: 'lib/index.umd.js',
            format: 'umd',
            name: 'docstack',
            inlineDynamicImports: true,
            globals: { 'pouchdb-browser': 'PouchDB', 'pouchdb-find': 'PouchDBFind', zod: 'z', semver: 'semver', jsondiffpatch: 'jsondiffpatch' },
        },
        plugins: plugins({ browser: true }),
    },
    {
        // Browser-ready ES module: the `browser`/`default` export conditions. Keeps the
        // split, so module consumers only load the WASM when scopes are used.
        input: './src/index.ts',
        external,
        output: { dir: 'lib', format: 'es', entryFileNames: 'index.js', chunkFileNames: '[name]-[hash].js' },
        plugins: plugins({ browser: true }),
    },
    {
        // Node ES module: the `node` export condition and `@docstack/client/node`. Built on
        // its own so it carries the Node variants of the bundled dependencies and shares no
        // chunk with the browser build; a single file, the WASM inlined, since Node has no
        // reason to load it lazily.
        input: './src/node.ts',
        external,
        output: { file: 'lib/node.js', format: 'es', inlineDynamicImports: true },
        plugins: plugins({ browser: false }),
    },
    {
        // `@docstack/client/model`: the declarations, the attribute-to-validator mapping,
        // the fold and the diff, with no engine behind them. A model module is loaded in
        // Node by `docstack revision` as well as in the browser by the app, so it must not
        // drag the storage layer in. Environment-neutral by construction - nothing here
        // touches a database - so one build serves both, resolved with `browser: false`
        // because the Node side is the one with a resolver to disappoint.
        input: './src/model.ts',
        external,
        output: { file: 'lib/model.js', format: 'es', inlineDynamicImports: true },
        plugins: plugins({ browser: false }),
    },
];
