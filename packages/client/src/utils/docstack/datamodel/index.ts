// This method is meant to be run by nodejs to calculate 
// the number of patches in the patch folder

export const countPatches = () => {
    let count = 0;
    try {
        // Browser implementation (Webpack)
        const context = require.context('./patch', false, /\.json$/);
        console.log("getPatchCount - Browser: counting files via require.context");
        count = context.keys().length;
        console.log(`countPatches - total number of patches: ${count}`)
    } catch (e: any) {
        console.log("countPatches - problem while reading patch folder", e)
    }
    return count;
}

export const importJsonFile = async (importFilePath: string) => {
    try {
        console.log("importJsonFile - Browser: importing file via require");
        // The importFilePath must be a string literal for Webpack to resolve it
        // This is a major limitation; you can't have a variable here.
        // You will need to require the file directly.
        // E.g., const data = require('./path/to/your/file.json');
        // Webpack will treat this as an asset and include it.
        // If you need to import different files dynamically, you must use require.context.
        const data = require(`./${importFilePath}`); // This works if importFilePath is a simple variable
        return data;
    } catch (error) {
        console.error('Error reading JSON file:', error);
        throw error;
    }
}

// export const setPatchCount = () => {
//     const count = countPatches();
//     updateEnvFile({ "PATCH_COUNT": `${count}` });
//     console.log("PATCH_COUNT environment updated successfully. Reloading .env file...");
// }

// export default setPatchCount;
