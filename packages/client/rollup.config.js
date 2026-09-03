import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: './src/index.ts',
  // Externalize all dependencies - they'll be loaded from node_modules in HTML
  // Note: @docstack/shared is NOT externalized - it gets bundled into the output
  // Node core modules are deliberately absent: nothing here imports them any more, and
  // listing them as external would let one back in silently. If a build starts warning
  // about an unresolved 'fs' or 'stream', a dependency has dragged Node into a browser
  // package again - fix that rather than re-adding it here.
  external: ['pouchdb', 'pouchdb-browser', 'pouchdb-find', 'zod', 'semver', 'jsondiffpatch'],
  output: [
    {
      // UMD bundle for CommonJS/browser environments
      file: 'lib/index.umd.js',
      format: 'umd',
      name: 'docstack',
      entryFileNames: 'index.js',
      chunkFileNames: '[name].js',
    },
    {
      // Browser-ready ES module for direct import
      dir: 'lib',
      format: 'es',
      entryFileNames: 'index.js',
      chunkFileNames: '[name].js',
    }
  ],
  plugins: [
    resolve({
      preferBuiltins: false,
      // Honor package.json "browser" fields: pouchdb-selector-core (and the
      // pouchdb-utils tree under it) ships Node variants whose isBinaryObject
      // references Buffer - resolving those into a browser bundle throws
      // "Buffer is not defined" on the first selector match.
      browser: true,
       // Explicitly state extensions if we encounter resolution issues
      extensions: ['.mjs', '.js', '.json', '.node', '.ts']
    }),
    commonjs(),
    json(),
    typescript()
  ]
};