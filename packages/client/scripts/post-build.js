import { replaceInFile } from 'replace-in-file';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLACEHOLDER = 'process.env.PLACEHOLDER';

async function runReplacement() {
  const replacementValue = JSON.stringify('placeholder_value');
  const TARGET = join(__dirname, '..', 'lib', '**', '*.js')

  const options = {
    glob: {
      windowsPathsNoEscape: true,
    },
    files: TARGET,
    from: new RegExp(PLACEHOLDER, 'g'),
    to: replacementValue,
  };

  try {
    const results = await replaceInFile(options);
    if (results.some(r => r.hasChanged === true)) {
      console.log(`✅ Success: Replaced ${PLACEHOLDER} with ${replacementValue} in ${count} files.`);
    } else {
      console.warn(`⚠️ No occurrence of ${PLACEHOLDER} found in ${TARGET}.`);
    }

  } catch (error) {
    console.error(`❌ Error during substitution:`, error);
    process.exit(1);
  }
}

runReplacement();