#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { revision, RevisionOptions } from "./revision.js";

/** What the tool prints when asked, and when misused. */
const USAGE = `docstack - the DocStack command line tool

Usage:
  docstack revision --autogenerate -m "<what changed>" [options]
  docstack revision --check [options]

Options:
  -m, --message <text>   What the patch changes. Required when generating.
      --model <path>     The module exporting the model. Default: src/model.ts, model.ts, ...
      --patches <dir>    The patch directory. Default: src/patches, patches, ...
      --target <name>    Consumer patch target. Default: this project's package name.
      --bump <level>     major | minor | patch. Default: minor.
      --version <semver> An explicit next version, instead of bumping.
      --types-import <s> Where generated files import the Patch type from.
                         Default: @docstack/client/model.
  -h, --help             This text.

\`--check\` exits non-zero when the model and the patch chain disagree, which is what
CI runs. \`--autogenerate\` writes the patch that closes the gap and regenerates the
patch directory's index.
`;

/**
 * Parses the argument vector.
 *
 * Hand-rolled rather than pulled from a dependency: the surface is two flags and a
 * handful of options, and a CLI an application installs should not drag an argument
 * parser behind it.
 *
 * @param argv - Arguments after the node executable and script.
 * @returns The command name and the options it carries.
 * @throws On an unknown flag, rather than ignoring it - a silently dropped `--patches`
 * would generate against the wrong baseline.
 */
export const parseArgs = (argv: readonly string[]): {
    command: string | undefined;
    options: Omit<RevisionOptions, "cwd" | "mode"> & { mode?: RevisionOptions["mode"]; help?: boolean };
} => {
    const options: ReturnType<typeof parseArgs>["options"] = {};
    let command: string | undefined;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = () => {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith("-")) {
                throw new Error(`${argument} needs a value.`);
            }
            index += 1;
            return value;
        };
        switch (argument) {
            case "--autogenerate": options.mode = "autogenerate"; break;
            case "--check": options.mode = "check"; break;
            case "-m": case "--message": options.message = next(); break;
            case "--model": options.model = next(); break;
            case "--patches": options.patches = next(); break;
            case "--target": options.target = next(); break;
            case "--bump": {
                const value = next();
                if (value !== "major" && value !== "minor" && value !== "patch") {
                    throw new Error(`--bump must be major, minor or patch; got '${value}'.`);
                }
                options.bump = value;
                break;
            }
            case "--version": options.version = next(); break;
            case "--types-import": options.typesImport = next(); break;
            case "-h": case "--help": options.help = true; break;
            default:
                if (argument.startsWith("-")) throw new Error(`Unknown option '${argument}'.`);
                if (!command) command = argument;
                else throw new Error(`Unexpected argument '${argument}'.`);
        }
    }
    return { command, options };
};

/**
 * Runs the tool.
 *
 * @param argv - Arguments after the node executable and script.
 * @param cwd - The project root.
 * @returns The process exit code.
 */
export const run = (argv: readonly string[], cwd: string): number => {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs(argv);
    } catch (error) {
        console.error(`docstack: ${(error as Error).message}\n`);
        console.error(USAGE);
        return 2;
    }
    const { command, options } = parsed;

    if (options.help || !command) {
        console.log(USAGE);
        return command ? 0 : 2;
    }
    if (command !== "revision") {
        console.error(`docstack: unknown command '${command}'.\n`);
        console.error(USAGE);
        return 2;
    }
    if (!options.mode) {
        console.error("docstack: revision needs --autogenerate or --check.\n");
        console.error(USAGE);
        return 2;
    }

    try {
        const result = revision({ ...options, cwd, mode: options.mode });
        for (const line of result.output) {
            if (line.startsWith("warning:")) console.warn(line);
            else console.log(line);
        }
        return result.code;
    } catch (error) {
        console.error(`docstack: ${(error as Error).message}`);
        return 1;
    }
};

// Only when this module IS the entry point, so it stays importable by tests. Compared
// as resolved URLs rather than by matching the path: a substring test matched any path
// that happened to contain the project's name, and running the CLI inside a test run is
// the one failure that looks like the test itself exiting.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(run(process.argv.slice(2), process.cwd()));
}
