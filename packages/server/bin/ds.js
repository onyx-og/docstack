#!/usr/bin/env node
import("../lib/cli/main.js").then(({ main }) => main(process.argv.slice(2))).catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exit(1);
});
