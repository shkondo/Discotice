# Discord Command Bridge MCP Server

Antigravity から利用することを前提にした、最小構成の Discord command bridge です。  
Discord の許可済みメッセージをキューとして保持し、MCP 経由でエージェントが取り出して処理し、結果を元の Discord メッセージへ返信できます。

## 採用構成

- Runtime: Node.js 20+
- Language: TypeScript
- MCP SDK: `@modelcontextprotocol/sdk` (stdio transport)
- Discord: `discord.js`
- Env loading: `dotenv`

構成を最小にするため、HTTP サーバーや DB は入れていません。  
キューはメモリ保持のみです。

## できること

- Discord Bot へのメンション付きメッセージだけ受け付ける
- 許可チャンネルだけを受け付ける
- 許可ユーザーだけを受け付ける
- 危険な文字列を含むメッセージを初期ガードで拒否する
- Antigravity などの MCP クライアントから pending command を取得する
- 実行結果を元の Discord メッセージへ返信する

## ディレクトリ構成

```text
.
├── .env.example
├── docs/
│   └── antigravity-mcp-config.example.json
├── package.json
├── README.md
├── src/
│   ├── command-queue.ts
│   ├── config.ts
│   ├── discord-bot.ts
│   ├── index.ts
│   ├── mcp-server.ts
│   └── types.ts
└── tsconfig.json
```

## セットアップ

### 1. Discord Bot を用意する

Discord Developer Portal で Bot を作成し、以下を有効にしてください。

- Server Members Intent は不要
- Message Content Intent は必要

Bot を対象サーバーに招待し、最低限以下の権限を付与してください。

- View Channels
- Send Messages
- Read Message History

### 2. 環境変数を用意する

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

設定値:

- `DISCORD_BOT_TOKEN`: Discord Bot token
- `DISCORD_ALLOWED_CHANNEL_IDS`: 処理対象のチャンネル ID。複数ある場合はカンマ区切り
- `DISCORD_ALLOWED_USER_IDS`: 処理を許可するユーザー ID。複数ある場合はカンマ区切り
- `DISCORD_COMMAND_MAX_LENGTH`: 受け付ける命令文の最大文字数
- `DISCORD_QUEUE_LIMIT`: pending + claimed の最大保持数
- `DISCORD_EXTRA_BLOCKLIST`: 追加で拒否したい文字列。カンマ区切り

### 3. 依存を入れる

```bash
npm install
```

### 4. ビルドする

```bash
npm run build
```

### 5. ローカルで起動する

```bash
npm start
```

`npm start` は MCP stdio サーバーとして起動します。  
単独で起動しても Discord Bot には接続されますが、MCP クライアントが接続するまではツール呼び出しはできません。

## Antigravity との接続

2026-03-02 時点で Google の公式ドキュメント上の設定例は確認できませんでした。  
ただし、`antigravity.codes` の Antigravity 向け MCP 接続手順では `mcp_config.json` の `mcpServers` に `command` / `args` / `env` を定義する形が案内されています。  
この実装はその一般的な stdio MCP 形式に合わせています。

接続手順:

1. Antigravity の agent panel 右上 `...` を開く
2. `Manage MCP Servers` を開く
3. `View raw config` を開く
4. `mcp_config.json` に設定を追加する

サンプルは [docs/antigravity-mcp-config.example.json](/Users/shkondo/Development/Discotice/docs/antigravity-mcp-config.example.json) にあります。

例:

```json
{
  "mcpServers": {
    "discord-command-bridge": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/Discotice/dist/index.js"
      ],
      "env": {
        "DISCORD_BOT_TOKEN": "replace-with-your-bot-token",
        "DISCORD_ALLOWED_CHANNEL_IDS": "123456789012345678",
        "DISCORD_ALLOWED_USER_IDS": "123456789012345678"
      }
    }
  }
}
```

## Discord での使い方

許可ユーザーが、許可チャンネルで、Bot をメンションして投稿します。

```text
<@BOT_USER_ID> 最新の障害対応手順を要約して
```

受信条件:

- Bot メンション必須
- 許可チャンネルのみ
- 許可ユーザーのみ
- 空メッセージ不可
- 文字数上限あり
- 初期 blocklist に一致する危険文字列を拒否

不正な入力は即座に Discord 上で rejection reply を返します。

## MCP ツール

- `discord_get_bridge_status`: 接続状態とキュー件数を確認
- `discord_list_pending_commands`: pending command を一覧
- `discord_claim_next_command`: 最古の pending command を claim
- `discord_send_command_response`: 実行結果を Discord に返信して完了扱いにする
- `discord_reject_command`: 処理しない command を理由付きで reject
- `discord_get_command`: 特定 command の状態を取得

## 最小実行フロー

1. Discord で許可されたユーザーが Bot にメンション付きで命令を送る
2. サーバーが条件を満たすメッセージだけをキューに積む
3. Antigravity で `discord_claim_next_command` を呼ぶ
4. 取得した `commandText` をエージェントの作業対象として処理する
5. 結果を `discord_send_command_response` で Discord に返す

## ローカル検証手順

### A. 起動確認

```bash
npm run build
npm start
```

標準エラーに以下が出れば起動できています。

- `[discord] connected as ...`
- `[mcp] stdio transport connected`

### B. Discord 受信確認

1. 許可ユーザーで許可チャンネルに投稿する
2. Bot にメンションを付ける
3. blocklist にかからない短い命令を送る

例:

```text
<@BOT_USER_ID> status を確認して
```

### C. MCP 側確認

Antigravity または任意の MCP クライアントから:

1. `discord_list_pending_commands`
2. `discord_claim_next_command`
3. `discord_send_command_response`

の順で呼びます。

## 現時点の制約

- 永続化なし。再起動で pending / claimed 状態は消えます
- Discord からの入力で Antigravity セッションを自動起動はしません
- 高度な認可、監査ログ、署名検証は未実装です
- 危険入力のガードは単純な部分一致です
- ワーカー並列実行や複数クライアントでの排他制御は未実装です

## 今後の改善候補

1. SQLite などでキューを永続化する
2. コマンドテンプレートや slash command に対応する
3. より厳密な policy engine を入れて検査を強化する
4. claim timeout や再試行制御を追加する
5. 実行ログと監査イベントを保存する
