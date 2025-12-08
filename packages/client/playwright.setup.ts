import tsconfig from './tsconfig.json' assert { type: 'json' };

// Configure Node module resolution for Playwright tests
const paths = tsconfig.compilerOptions.paths;

if (paths) {
  for (const [alias, [target]] of Object.entries(paths)) {
    const pattern = alias.replace('*', '(.*)');
    const replacement = target.replace('*', '$1');
    // This is handled by TypeScript loader
  }
}
