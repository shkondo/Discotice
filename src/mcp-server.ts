import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import { CommandQueue } from "./command-queue.js";
import { DiscordBotBridge } from "./discord-bot.js";
import type { CommandRecord } from "./types.js";

interface ServerDependencies {
  readonly config: AppConfig;
  readonly queue: CommandQueue;
  readonly bridge: DiscordBotBridge;
}

export function createMcpServer({
  config,
  queue,
  bridge
}: ServerDependencies): McpServer {
  const server = new McpServer({
    name: config.serverName,
    version: "0.1.0"
  });

  server.registerTool(
    "discord_get_bridge_status",
    {
      title: "Get Bridge Status",
      description:
        "Return runtime status for the Discord command bridge, including queue counts and whether the bot is connected.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const status = bridge.getStatus();
      const structuredStatus = {
        botReady: status.botReady,
        botUserId: status.botUserId,
        allowedChannelCount: status.allowedChannelCount,
        allowedUserCount: status.allowedUserCount,
        queue: {
          ...status.queue
        }
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2)
          }
        ],
        structuredContent: structuredStatus
      };
    }
  );

  server.registerTool(
    "discord_list_pending_commands",
    {
      title: "List Pending Commands",
      description:
        "List pending Discord messages that passed the channel, mention, user, and safety filters.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of pending commands to return.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ limit }) => {
      const commands = queue.listPending(limit);

      return {
        content: [
          {
            type: "text",
            text: commands.length
              ? commands.map(formatCommand).join("\n\n")
              : "No pending Discord commands."
          }
        ],
        structuredContent: {
          commands
        }
      };
    }
  );

  server.registerTool(
    "discord_claim_next_command",
    {
      title: "Claim Next Command",
      description:
        "Claim the oldest pending Discord command so the agent can execute it and then reply back to Discord.",
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async () => {
      const command = queue.claimNext();

      if (!command) {
        return {
          content: [
            {
              type: "text",
              text: "No pending Discord commands."
            }
          ],
          structuredContent: {
            command: null
          }
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatCommand(command)
          }
        ],
        structuredContent: {
          command
        }
      };
    }
  );

  server.registerTool(
    "discord_send_command_response",
    {
      title: "Send Command Response",
      description:
        "Send the execution result back to the original Discord message and mark the command as completed.",
      inputSchema: {
        command_id: z
          .string()
          .min(1)
          .describe("The Discord message ID returned by the bridge."),
        response_text: z
          .string()
          .min(1)
          .max(12000)
          .describe("The text to send back to Discord.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ command_id, response_text }) => {
      const record = await bridge.sendCommandResponse(command_id, response_text);

      return {
        content: [
          {
            type: "text",
            text: `Response delivered for command ${command_id}.`
          }
        ],
        structuredContent: {
          command: record
        }
      };
    }
  );

  server.registerTool(
    "discord_reject_command",
    {
      title: "Reject Command",
      description:
        "Reject a pending or claimed Discord command and send the rejection reason back to Discord.",
      inputSchema: {
        command_id: z
          .string()
          .min(1)
          .describe("The Discord message ID returned by the bridge."),
        reason: z
          .string()
          .min(1)
          .max(1000)
          .describe("Why the command is being rejected.")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ command_id, reason }) => {
      const record = await bridge.rejectCommand(command_id, reason);

      return {
        content: [
          {
            type: "text",
            text: `Command ${command_id} was rejected.`
          }
        ],
        structuredContent: {
          command: record
        }
      };
    }
  );

  server.registerTool(
    "discord_get_command",
    {
      title: "Get Command By ID",
      description:
        "Fetch the current state of a tracked Discord command by its message ID.",
      inputSchema: {
        command_id: z
          .string()
          .min(1)
          .describe("The Discord message ID returned by the bridge.")
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ command_id }) => {
      const command = queue.getTrackedCommand(command_id);

      return {
        content: [
          {
            type: "text",
            text: command ? formatCommand(command) : `Command ${command_id} was not found.`
          }
        ],
        structuredContent: {
          command
        }
      };
    }
  );

  return server;
}

function formatCommand(command: CommandRecord): string {
  return [
    `Command ID: ${command.id}`,
    `Status: ${command.status}`,
    `Author: ${command.origin.authorTag} (${command.origin.authorId})`,
    `Channel ID: ${command.origin.channelId}`,
    `Received At: ${command.origin.receivedAt}`,
    `Command: ${command.commandText}`
  ].join("\n");
}
