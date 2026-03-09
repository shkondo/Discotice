# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Communication

Always response in Japanese.

## Project Overview

Discord Command Bridge MCP Server — a minimal Discord bot that queues mention-based messages from allowed users/channels and exposes them to MCP clients (e.g. Antigravity) via stdio transport. No HTTP server or database; the queue is in-memory only.

## Commands

```bash
npm run build    # TypeScript compile (src/ → dist/)
npm run check    # Type-check without emitting
npm start        # Run the server (node dist/index.js)
```

There are no tests or linter configured.

## Architecture

The system has three layers wired together in `src/index.ts`:

1. **Config** (`src/config.ts`) — Loads `.env` via dotenv, validates required values, builds `AppConfig`. Includes a default blocklist of dangerous shell fragments.

2. **CommandQueue** (`src/command-queue.ts`) — In-memory state machine for commands. Lifecycle: `pending → claimed → completed | rejected`. Enforces max length, blocklist, queue capacity, and dedup by Discord message ID. The queue uses the Discord message ID as the command ID.

3. **DiscordBotBridge** (`src/discord-bot.ts`) — discord.js client that filters incoming messages (guild-only, non-bot, allowed channel, allowed user, bot-mentioned), strips the mention, and enqueues. Also handles reply delivery with Discord's 2000-char split logic.

4. **MCP Server** (`src/mcp-server.ts`) — Registers 6 tools using `@modelcontextprotocol/sdk`. Tool names are prefixed `discord_`. Uses Zod schemas for input validation. All tools return both `content` (text) and `structuredContent`.

### Data Flow

```
Discord message → DiscordBotBridge.handleMessage → CommandQueue.enqueue
MCP client → discord_claim_next_command → CommandQueue.claimNext
MCP client → discord_send_command_response → DiscordBotBridge.sendCommandResponse → Discord reply
```

### MCP Tools

| Tool | Mutates | Description |
|------|---------|-------------|
| `discord_get_bridge_status` | no | Connection status + queue counts |
| `discord_list_pending_commands` | no | List pending commands |
| `discord_claim_next_command` | yes | Dequeue oldest pending → claimed |
| `discord_send_command_response` | yes | Reply to Discord + mark completed |
| `discord_reject_command` | yes | Reply rejection + mark rejected |
| `discord_get_command` | no | Lookup any command by ID |

## Key Design Decisions

- **ESM-only**: `"type": "module"` in package.json; all imports use `.js` extension (TypeScript NodeNext resolution).
- **stdio transport**: The MCP server communicates over stdin/stdout. Diagnostic logging goes to stderr (`console.error`).
- **No persistence**: Queue state is lost on restart. This is intentional for the minimal scope.
- **Command ID = Discord message ID**: No separate UUID generation; message IDs are globally unique.

## Environment Variables

Defined in `.env` (see `.env.example`):
- `DISCORD_BOT_TOKEN` (required)
- `DISCORD_ALLOWED_CHANNEL_IDS` (required, comma-separated)
- `DISCORD_ALLOWED_USER_IDS` (required, comma-separated)
- `DISCORD_COMMAND_MAX_LENGTH` (default: 500)
- `DISCORD_QUEUE_LIMIT` (default: 50)
- `DISCORD_EXTRA_BLOCKLIST` (optional, comma-separated)
