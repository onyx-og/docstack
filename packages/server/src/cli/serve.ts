import { loadConfig } from "../config/load.js";
import { createServer } from "../index.js";

/** `ds serve`: load the config, open the stacks, listen until a signal. */
export const serve = async (options: { config: string }): Promise<void> => {
    const config = await loadConfig(options.config);
    const server = await createServer(config);
    const { url } = await server.listen();
    console.log(`docstack-server listening on ${url} (stacks: ${server.registry.names().join(", ") || "none"})`);

    let closing = false;
    const shutdown = (signal: string) => {
        if (closing) return;
        closing = true;
        console.log(`${signal}: closing`);
        server.close().then(() => process.exit(0), (error) => {
            console.error(error);
            process.exit(1);
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
};
