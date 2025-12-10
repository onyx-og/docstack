import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
  input: './src/index.ts',
  // Externalize all dependencies - they'll be loaded from node_modules in HTML
  external: ['crypto', 'stream', 'path', 'fs', 'util', 'setimmediate', 'winston', 'winston-transport', '@docstack/shared', 'pouchdb', 'pouchdb-browser', 'pouchdb-find', 'zod', 'semver', 'jsondiffpatch'],
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
    typescript({
      // Don't generate declarations here - use separate build:types script
      declaration: false
      // By removing `tsconfig: false`, the plugin will now use your tsconfig.json
    })
  ]
};