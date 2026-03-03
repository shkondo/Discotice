# 利用者向けセットアップ手順

このドキュメントは、このリポジトリのコード実装が完了した前提で、あなたが実施する必要がある設定と確認作業を順番にまとめた手順書です。

## 前提

- このリポジトリで `npm install` と `npm run build` は完了している
- `dist/` が生成されている
- 作業ブランチ上の最新コードを使う

## 先に結論

この実装で必要なのは Discord Bot の設定です。  
Webhook は不要です。

必要:

- Discord Bot の作成
- Bot token の発行
- `Message Content Intent` の有効化
- Bot のサーバー招待
- 対象チャンネルの権限設定
- `.env` の設定
- Antigravity への MCP 登録

不要:

- Discord Webhook の作成
- Webhook URL の設定
- Slash Command の登録

## 手順 1: Discord Developer Portal で Bot を作成する

1. [Discord Developer Portal](https://discord.com/developers/applications) を開く
2. `New Application` から新しいアプリを作成する
3. 左メニューの `Bot` を開く
4. `Add Bot` を実行して Bot を作成する

## 手順 2: Bot token を発行して控える

1. `Bot` 画面で token を発行する
2. token を安全な場所に控える
3. token をコードや Git に直接書かない

この token は後で `.env` の `DISCORD_BOT_TOKEN` に設定します。

## 手順 3: 必要な Intent を有効化する

`Bot` 設定画面で以下を確認します。

- `Message Content Intent`: 有効にする
- `Server Members Intent`: この最小構成では不要
- `Presence Intent`: この最小構成では不要

`Message Content Intent` を有効化しないと、Bot がメッセージ本文を読めません。

## 手順 4: Bot を Discord サーバーに招待する

1. `OAuth2` -> `URL Generator` を開く
2. `Scopes` で `bot` を選ぶ
3. `Bot Permissions` で以下を選ぶ
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
4. 生成された URL を開いて、対象サーバーに招待する

補足:

- 管理者権限は不要です
- 最小権限のままで十分です

## 手順 5: 対象チャンネルを決めて権限を確認する

Bot に命令を送る専用チャンネルを 1 つ決めることを推奨します。

そのチャンネルで、Bot に以下の権限があることを確認してください。

- `View Channels`
- `Send Messages`
- `Read Message History`

必要に応じて、チャンネル権限で Bot の権限を明示的に許可してください。

## 手順 6: チャンネル ID と許可ユーザー ID を取得する

### チャンネル ID

1. Discord の設定で `開発者モード` を有効化する
2. 対象チャンネルを右クリックする
3. `ID をコピー` を選ぶ

この値を `.env` の `DISCORD_ALLOWED_CHANNEL_IDS` に設定します。

### ユーザー ID

1. 命令実行を許可したい自分のユーザーを右クリックする
2. `ID をコピー` を選ぶ

この値を `.env` の `DISCORD_ALLOWED_USER_IDS` に設定します。

複数許可する場合はカンマ区切りで設定します。

## 手順 7: `.env` を作成して設定する

リポジトリ直下で以下を実行します。

```bash
cp .env.example .env
```

その後、`.env` に実値を入れます。

例:

```dotenv
DISCORD_BOT_TOKEN=your-real-bot-token
DISCORD_ALLOWED_CHANNEL_IDS=123456789012345678
DISCORD_ALLOWED_USER_IDS=123456789012345678
DISCORD_COMMAND_MAX_LENGTH=500
DISCORD_QUEUE_LIMIT=50
DISCORD_EXTRA_BLOCKLIST=
```

設定項目:

- `DISCORD_BOT_TOKEN`: 発行した Bot token
- `DISCORD_ALLOWED_CHANNEL_IDS`: 処理対象チャンネル ID
- `DISCORD_ALLOWED_USER_IDS`: 実行許可ユーザー ID
- `DISCORD_COMMAND_MAX_LENGTH`: 1 メッセージで受ける最大文字数
- `DISCORD_QUEUE_LIMIT`: キュー保持数の上限
- `DISCORD_EXTRA_BLOCKLIST`: 追加禁止文字列

## 手順 8: ローカルでサーバーを起動する

```bash
npm start
```

起動後、標準エラーに以下のようなログが出れば起動できています。

- `[discord] connected as ...`
- `[mcp] stdio transport connected`

もし起動時に環境変数エラーが出たら、`.env` の値を見直してください。

## 手順 9: Discord 側で受信確認する

許可ユーザーで、許可チャンネルに、Bot へメンション付きで投稿します。

例:

```text
<@BOT_USER_ID> status を確認して
```

受け付け条件:

- Bot メンションがある
- 許可チャンネルである
- 許可ユーザーである
- メッセージ本文が空でない
- 長すぎない
- blocklist に一致しない

条件を満たさない場合は、Discord 上で rejection reply が返ります。

## 手順 10: Antigravity に MCP サーバーを登録する

1. Antigravity の agent panel を開く
2. 右上の `...` を開く
3. `Manage MCP Servers` を開く
4. `View raw config` を開く
5. `mcp_config.json` に設定を追加する

サンプルは [docs/antigravity-mcp-config.example.json](/Users/shkondo/Development/Discotice/docs/antigravity-mcp-config.example.json) を参照してください。

最小例:

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
        "DISCORD_BOT_TOKEN": "your-real-bot-token",
        "DISCORD_ALLOWED_CHANNEL_IDS": "123456789012345678",
        "DISCORD_ALLOWED_USER_IDS": "123456789012345678"
      }
    }
  }
}
```

注意:

- `args` にはこのリポジトリの `dist/index.js` の絶対パスを入れる
- `env` は `.env` と同じ値でよい
- Antigravity から起動する場合、Antigravity 側の設定だけでも動かせる

## 手順 11: エンドツーエンドで確認する

Antigravity から以下の順で確認します。

1. `discord_get_bridge_status`
2. `discord_list_pending_commands`
3. `discord_claim_next_command`
4. `discord_send_command_response`

期待する動作:

- `discord_list_pending_commands` で Discord から送った命令が見える
- `discord_claim_next_command` で command が取得できる
- `discord_send_command_response` を呼ぶと、元の Discord メッセージに返信される

## トラブルシュート

### Bot が反応しない

確認ポイント:

- `DISCORD_BOT_TOKEN` が正しいか
- `Message Content Intent` が有効か
- Bot が対象サーバーに招待されているか
- Bot にチャンネル権限があるか
- 投稿者の ID が `DISCORD_ALLOWED_USER_IDS` に入っているか
- チャンネル ID が `DISCORD_ALLOWED_CHANNEL_IDS` に入っているか
- Bot へのメンションを付けているか

### Discord で rejection reply が返る

主な原因:

- Bot メンションを除いた後の本文が空
- 文字数上限超過
- blocklist に含まれる文字列が入っている
- 同じメッセージ ID を再処理しようとしている

### Antigravity から見えない

確認ポイント:

- `mcp_config.json` の `command` と `args` が正しいか
- `dist/index.js` のパスが絶対パスになっているか
- `env` の値が正しいか
- Antigravity 側で MCP サーバー設定が読み込まれているか

## 実施後の完了条件

以下が確認できれば、最小構成としては利用開始できます。

- Bot が起動して Discord に接続できる
- 許可ユーザーのメンション投稿だけが受理される
- Antigravity から pending command を取得できる
- Antigravity からの応答を Discord に返せる
