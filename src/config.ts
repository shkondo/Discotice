import dotenv from "dotenv";

dotenv.config();

const DEFAULT_BLOCKED_FRAGMENTS = [
  "rm -rf",
  "sudo ",
  "shutdown",
  "reboot",
  "mkfs",
  "dd if=",
  "curl | sh",
  "wget | sh",
  ":(){:|:&};:"
];

export interface AppConfig {
  readonly discordBotToken: string;
  readonly allowedChannelIds: Set<string>;
  readonly allowedUserIds: Set<string>;
  readonly commandMaxLength: number;
  readonly queueLimit: number;
  readonly blockedFragments: string[];
  readonly serverName: string;
}

function requireValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parseIdSet(env: NodeJS.ProcessEnv, key: string): Set<string> {
  const raw = requireValue(env, key);
  const values = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!values.length) {
    throw new Error(`${key} must include at least one Discord ID.`);
  }

  return new Set(values);
}

function parsePositiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = env[key]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsed;
}

function parseBlockedFragments(env: NodeJS.ProcessEnv): string[] {
  const extra = env.DISCORD_EXTRA_BLOCKLIST
    ?.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean) ?? [];

  return [...DEFAULT_BLOCKED_FRAGMENTS, ...extra];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    discordBotToken: requireValue(env, "DISCORD_BOT_TOKEN"),
    allowedChannelIds: parseIdSet(env, "DISCORD_ALLOWED_CHANNEL_IDS"),
    allowedUserIds: parseIdSet(env, "DISCORD_ALLOWED_USER_IDS"),
    commandMaxLength: parsePositiveInteger(env, "DISCORD_COMMAND_MAX_LENGTH", 500),
    queueLimit: parsePositiveInteger(env, "DISCORD_QUEUE_LIMIT", 50),
    blockedFragments: parseBlockedFragments(env),
    serverName: "discord-command-bridge-mcp-server"
  };
}
