
import type {Config} from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  "transform": {
    "^.+\\.tsx?$": ["ts-jest", {"tsconfig": "./tsconfig.json"}]
  },
  "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  "moduleFileExtensions": ["ts", "tsx", "js", "jsx", "json", "node"],
  "setupFiles": ["<rootDir>/jest.setup.js"],
  "moduleNameMapper": {
    "^(.*)\\.js$": "$1",
    "^@docstack/shared$": "<rootDir>/../shared/src/index.ts",
    "^@docstack/shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^jsondiffpatch$": "<rootDir>/test/__mocks__/jsondiffpatch.js"
  },
  "testPathIgnorePatterns": ["<rootDir>/lib/"]
};
export default config;
