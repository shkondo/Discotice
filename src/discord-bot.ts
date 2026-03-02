import { once } from "node:events";
import {
  Client,
  GatewayIntentBits,
  type Message
} from "discord.js";
import type { AppConfig } from "./config.js";
import { CommandQueue } from "./command-queue.js";
import type { CommandQueueStatus, CommandRecord } from "./types.js";

const DISCORD_MESSAGE_LIMIT = 1900;

export interface BridgeStatus {
  readonly botReady: boolean;
  readonly botUserId: string | null;
  readonly allowedChannelCount: number;
  readonly allowedUserCount: number;
  readonly queue: CommandQueueStatus;
}

export class DiscordBotBridge {
  private readonly client: Client;

  public constructor(
    private readonly config: AppConfig,
    private readonly queue: CommandQueue
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.client.once("ready", () => {
      const botName = this.client.user?.tag ?? this.client.user?.id ?? "unknown";
      console.error(`[discord] connected as ${botName}`);
    });

    this.client.on("messageCreate", (message) => {
      void this.handleMessage(message);
    });
  }

  public async start(): Promise<void> {
    await this.client.login(this.config.discordBotToken);

    if (!this.client.isReady()) {
      await once(this.client, "ready");
    }
  }

  public async stop(): Promise<void> {
    await this.client.destroy();
  }

  public getStatus(): BridgeStatus {
    return {
      botReady: this.client.isReady(),
      botUserId: this.client.user?.id ?? null,
      allowedChannelCount: this.config.allowedChannelIds.size,
      allowedUserCount: this.config.allowedUserIds.size,
      queue: this.queue.getStatus()
    };
  }

  public async sendCommandResponse(
    commandId: string,
    responseText: string
  ): Promise<CommandRecord> {
    const command = this.queue.getClaimedCommand(commandId);
    const normalized = responseText.trim();

    if (!normalized) {
      throw new Error("Response text must not be empty.");
    }

    const deliveredMessageIds = await this.replyToCommand(command, normalized);

    return this.queue.resolveCompleted(
      commandId,
      "Response delivered to Discord.",
      deliveredMessageIds
    );
  }

  public async rejectCommand(
    commandId: string,
    reason: string
  ): Promise<CommandRecord> {
    const command = this.queue.getResponseTarget(commandId);
    const normalized = reason.trim();

    if (!normalized) {
      throw new Error("Reject reason must not be empty.");
    }

    await this.replyToCommand(command, `Request rejected: ${normalized}`);

    return this.queue.resolveRejected(commandId, normalized);
  }

  private async handleMessage(message: Message): Promise<void> {
    const botUserId = this.client.user?.id;

    if (!botUserId) {
      return;
    }

    if (!message.inGuild() || message.author.bot) {
      return;
    }

    if (!this.config.allowedChannelIds.has(message.channelId)) {
      return;
    }

    if (!this.config.allowedUserIds.has(message.author.id)) {
      return;
    }

    if (!message.mentions.users.has(botUserId)) {
      return;
    }

    const commandText = stripBotMention(message.content, botUserId);
    const result = this.queue.enqueue({
      id: message.id,
      commandText,
      origin: {
        messageId: message.id,
        guildId: message.guildId ?? "unknown",
        channelId: message.channelId,
        authorId: message.author.id,
        authorTag: message.author.tag,
        receivedAt: new Date(message.createdTimestamp).toISOString()
      }
    });

    if (!result.accepted && result.reason) {
      await this.safeImmediateReply(message, `Command rejected: ${result.reason}`);
    }
  }

  private async replyToCommand(
    command: CommandRecord,
    responseText: string
  ): Promise<string[]> {
    const channel = await this.client.channels.fetch(command.origin.channelId);

    if (
      !channel ||
      !channel.isTextBased() ||
      !("messages" in channel) ||
      !("send" in channel)
    ) {
      throw new Error("The target Discord channel is not a reply-capable text channel.");
    }

    const sourceMessage = await channel.messages.fetch(command.origin.messageId);
    const chunks = splitForDiscord(responseText);
    const sentMessageIds: string[] = [];

    for (const [index, chunk] of chunks.entries()) {
      const body =
        chunks.length === 1 ? chunk : `(${index + 1}/${chunks.length}) ${chunk}`;
      const sentMessage =
        index === 0
          ? await sourceMessage.reply({ content: body })
          : await channel.send({ content: body });

      sentMessageIds.push(sentMessage.id);
    }

    return sentMessageIds;
  }

  private async safeImmediateReply(message: Message, content: string): Promise<void> {
    try {
      const chunks = splitForDiscord(content);

      if (!chunks.length) {
        return;
      }

      await message.reply({ content: chunks[0] });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[discord] failed to send rejection reply: ${reason}`);
    }
  }
}

function stripBotMention(content: string, botUserId: string): string {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  return content.replace(mentionPattern, "").trim();
}

function splitForDiscord(content: string): string[] {
  const normalized = content.trim();

  if (!normalized) {
    return ["(empty response)"];
  }

  if (normalized.length <= DISCORD_MESSAGE_LIMIT) {
    return [normalized];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    let splitIndex = remaining.lastIndexOf("\n", DISCORD_MESSAGE_LIMIT);

    if (splitIndex < Math.floor(DISCORD_MESSAGE_LIMIT * 0.6)) {
      splitIndex = remaining.lastIndexOf(" ", DISCORD_MESSAGE_LIMIT);
    }

    if (splitIndex < Math.floor(DISCORD_MESSAGE_LIMIT * 0.6)) {
      splitIndex = DISCORD_MESSAGE_LIMIT;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
