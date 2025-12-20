import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
  input: './src/index.ts',
  // Externalize all dependencies - they'll be loaded from node_modules in HTML
  // Note: @docstack/shared is NOT externalized - it gets bundled into the output
  external: ['crypto', 'stream', 'path', 'fs', 'util', 'setimmediate', 'winston', 'winston-transport', 'pouchdb', 'pouchdb-browser', 'pouchdb-find', 'zod', 'semver', 'jsondiffpatch'],
  output: [
    {
      // UMD bundle for CommonJS/browser environments
      dir: 'lib',
      format: 'umd',
      name: 'docstack',
      entryFileNames: 'index.js',
      chunkFileNames: '[name].js',
    },
    // {
    //   // Browser-ready ES module for direct import
    //   dir: 'dist',
    //   format: 'es',
    //   entryFileNames: 'index.js',
    //   chunkFileNames: '[name].js',
    // }
  ],
  plugins: [
    json(),
    typescript()
  ]
};