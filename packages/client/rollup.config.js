import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: './src/index.ts',
  // Externalize all dependencies - they'll be loaded from node_modules in HTML
  // Note: @docstack/shared is NOT externalized - it gets bundled into the output
  external: ['crypto', 'stream', 'path', 'fs', 'util', 'setimmediate', 'winston', 'winston-transport', 'pouchdb', 'pouchdb-browser', 'pouchdb-find', 'zod', 'semver', 'jsondiffpatch'],
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
       // Explicitly state extensions if we encounter resolution issues
      extensions: ['.mjs', '.js', '.json', '.node', '.ts']
    }),
    commonjs(),
    json(),
    typescript()
  ]
};