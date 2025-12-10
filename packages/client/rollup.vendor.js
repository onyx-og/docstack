import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

/**
 * Vendor bundle configuration
 * 
 * This bundles all external dependencies into a single vendor bundle
 * that exposes them as globals for use in browser environments.
 */
export default {
  input: './src-test/vendor.js',
  output: {
    file: 'test/vendor-bundle.js',
    format: 'iife'
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    nodePolyfills(),
    replace({
      preventAssignment: true,
      'process.env': '{}',
      'process.argv': '[]',
      'process.stdout': 'null',
      'process.stderr': 'null',
      'process.platform': '"browser"',
      'process.env.NODE_ENV': '"production"',
      'process.nextTick': '_nextTick',
      'process.browser': 'true',
      'setImmediate(': 'queueMicrotask(',
    }),
    json(),
    commonjs(),
  ]
};
