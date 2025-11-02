import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
  input: './src/index.ts',
  output: {
    dir: 'lib',
    format: 'umd',
    name: 'docstack'
  },
  plugins: [
    json(), typescript()
  ]
};