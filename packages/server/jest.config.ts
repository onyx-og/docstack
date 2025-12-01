import type {Config} from '@jest/types';

const config: Config.InitialOptions = {
  verbose: true,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: "./tsconfig.jest.json",
      diagnostics: { ignoreCodes: [151002] },
    }],
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^(.*)\\.js$": "$1",
    "^@docstack/shared$": "<rootDir>/../shared/src/index.ts",
    "^@docstack/shared/workers/(.*)$": "<rootDir>/__mocks__/shared-workers/$1",
    "^@docstack/shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^@docstack/client$": "<rootDir>/../client/src/index.ts",
    "^@docstack/client/(.*)$": "<rootDir>/../client/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/lib/"],
};

export default config;
