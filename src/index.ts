import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { CommandQueue } from "./command-queue.js";
import { DiscordBotBridge } from "./discord-bot.js";
import { createMcpServer } from "./mcp-server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const queue = new CommandQueue(config);
  const bridge = new DiscordBotBridge(config, queue);
  const server = createMcpServer({
    config,
    queue,
    bridge
  });

  await bridge.start();
  await server.connect(new StdioServerTransport());
  console.error("[mcp] stdio transport connected");

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[shutdown] received ${signal}`);
    await bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch(async (error) => {
  const reason = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[fatal] ${reason}`);
  process.exit(1);
});
