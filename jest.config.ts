
import type {Config} from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  "transform": {
    "^.+\\.tsx?$": ["ts-jest", {"tsconfig": "./server/tsconfig.json"}]
  },
  "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  "moduleFileExtensions": ["ts", "tsx", "js", "jsx", "json", "node"]
};
export default config;