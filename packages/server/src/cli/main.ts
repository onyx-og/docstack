import { init } from "./init.js";
import { serve } from "./serve.js";

const USAGE = `docstack-server <command>

Commands:
  init [--dir <path>]     Write ds.config.js, mint the authority's master pair and the node secret
  serve [--config <file>] Run the node described by ds.config.js (default) in the current directory
  help                    This text

Environment: DS_HOST, DS_PORT, DS_STORAGE_ADAPTER, DS_STORAGE_DIR, DS_STATE_DIR, DS_LOG_LEVEL,
DS_JWT_SECRET, DS_DOC_KEY, DS_AUTHORITY_PASSPHRASE (each secret also as *_FILE).`;

const flag = (args: string[], name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
};

/** The `ds` binary. */
export const main = async (args: string[]): Promise<void> => {
    const [command] = args;
    switch (command) {
        case "init":
            await init({ dir: flag(args, "--dir") ?? process.cwd() });
            return;
        case "serve":
            await serve({ config: flag(args, "--config") ?? "ds.config.js" });
            return;
        case undefined:
        case "help":
        case "--help":
        case "-h":
            console.log(USAGE);
            return;
        default:
            console.error(`Unknown command '${command}'.\n\n${USAGE}`);
            process.exitCode = 2;
    }
};
