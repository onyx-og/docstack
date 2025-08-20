import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';

export default {
  input: 'server/src/index.ts',
  output: {
    dir: 'lib',
    format: 'umd',
    name: 'couchsurfer'
  },
  plugins: [replace({
    'process.env.BUILDING': 1
  }), typescript(), json()]
};