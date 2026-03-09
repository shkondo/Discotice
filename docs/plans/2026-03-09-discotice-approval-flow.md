# Discotice Approval Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent approval and run-state workflows to Discotice so Discord can be used for `merge / hold / retry` decisions during daytime autonomous development.

**Architecture:** Extend the current in-memory Discord command bridge with a SQLite-backed state layer for command records, approval requests, run states, and audit events. Keep the existing message intake path, then add explicit approval-oriented MCP tools and Discord command parsing so an external runner can create approval requests and resolve them safely.

**Tech Stack:** TypeScript, Node.js 20+, sqlite, `discord.js`, `@modelcontextprotocol/sdk`, `zod`

---

### Task 1: Add a test harness and persistence dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/__tests__/smoke.test.ts`

**Step 1: Add test tooling and sqlite dependency**

Update `package.json` to add:

```json
{
  "scripts": {
    "test": "node --test dist-test/**/*.test.js"
  },
  "dependencies": {
    "better-sqlite3": "..."
  },
  "devDependencies": {
    "@types/better-sqlite3": "..."
  }
}
```

**Step 2: Add a minimal smoke test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

test("smoke", () => {
  assert.equal(1 + 1, 2);
});
```

**Step 3: Run test to verify the harness fails or is not wired yet**

Run: `npm test`
Expected: FAIL because the build/test output path is not implemented yet.

**Step 4: Wire the test build minimally**

Adjust scripts so TypeScript test files can compile to `dist-test` and the smoke test runs.

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS with the smoke test.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/__tests__/smoke.test.ts
git commit -m "test: add initial test harness"
```

### Task 2: Introduce state models for approvals and runs

**Files:**
- Modify: `src/types.ts`
- Create: `src/__tests__/types.test.ts`

**Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isTerminalRunStatus } from "../types.js";

test("merge_pending is not terminal", () => {
  assert.equal(isTerminalRunStatus("merge_pending"), false);
});

test("completed is terminal", () => {
  assert.equal(isTerminalRunStatus("completed"), true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because approval and run-state helpers do not exist.

**Step 3: Write minimal implementation**

Add types and helpers for:

- `ApprovalAction`
- `ApprovalStatus`
- `RunStatus`
- `ApprovalRequestRecord`
- `RunStateRecord`
- `AuditEventRecord`
- `isTerminalRunStatus`

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/__tests__/types.test.ts
git commit -m "feat: add approval and run state types"
```

### Task 3: Add a SQLite-backed state store

**Files:**
- Create: `src/state-store.ts`
- Create: `src/__tests__/state-store.test.ts`

**Step 1: Write the failing test**

```ts
test("creates and resolves an approval request", () => {
  const store = createTestStore();
  const approval = store.createApprovalRequest({
    issueId: "DISC-123",
    requestedAction: "merge"
  });

  const resolved = store.resolveApproval({
    approvalId: approval.approvalId,
    resolution: "approved"
  });

  assert.equal(resolved.status, "approved");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `state-store.ts` does not exist.

**Step 3: Write minimal implementation**

Implement a store that:

- creates required tables on startup
- persists approvals, run states, and audit events
- can create/list/resolve approval requests
- can upsert and fetch run states

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state-store.ts src/__tests__/state-store.test.ts
git commit -m "feat: add sqlite state store"
```

### Task 4: Add approval-oriented MCP tools

**Files:**
- Modify: `src/mcp-server.ts`
- Modify: `src/types.ts`
- Create: `src/__tests__/mcp-server-approval.test.ts`

**Step 1: Write the failing test**

```ts
test("registers approval tools", async () => {
  const server = createMcpServerForTest();
  const tools = server.listToolNames();

  assert.deepEqual(tools.includes("discord_create_approval_request"), true);
  assert.deepEqual(tools.includes("discord_resolve_approval"), true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because approval tools are not registered.

**Step 3: Write minimal implementation**

Add MCP tools for:

- `discord_create_approval_request`
- `discord_list_pending_approvals`
- `discord_resolve_approval`
- `discord_get_run_status`
- `discord_list_active_runs`

These tools should call the state store and return concise text responses.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp-server.ts src/types.ts src/__tests__/mcp-server-approval.test.ts
git commit -m "feat: add approval mcp tools"
```

### Task 5: Extend Discord command handling for merge/hold/retry

**Files:**
- Modify: `src/discord-bot.ts`
- Modify: `src/command-queue.ts`
- Create: `src/__tests__/discord-bot-commands.test.ts`

**Step 1: Write the failing test**

```ts
test("parses merge command and resolves approval", async () => {
  const env = createDiscordBotTestEnv();
  await env.receiveMention("@Discotice merge DISC-123");

  assert.equal(env.store.listResolvedApprovals()[0]?.resolution, "approved");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because approval commands are treated like generic queue items.

**Step 3: Write minimal implementation**

Update Discord intake so:

- `merge <id>` resolves a pending merge approval as approved
- `hold <id>` resolves as rejected/held
- `retry <id>` marks the run for retry and records an audit event
- `status <id>`, `runs`, `queue` return direct Discord replies without going through generic claim flow

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/discord-bot.ts src/command-queue.ts src/__tests__/discord-bot-commands.test.ts
git commit -m "feat: add discord approval commands"
```

### Task 6: Wire state store into application startup

**Files:**
- Modify: `src/index.ts`
- Modify: `src/config.ts`
- Create: `src/__tests__/config.test.ts`

**Step 1: Write the failing test**

```ts
test("requires sqlite path when approval workflow is enabled", () => {
  assert.throws(() =>
    loadConfig({
      DISCORD_APPROVALS_ENABLED: "true"
    })
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because the config flag and DB path do not exist.

**Step 3: Write minimal implementation**

Add config for:

- `DISCORD_STATE_DB_PATH`
- optional approval feature flags if needed

Instantiate the state store in `index.ts` and inject it into the MCP server and Discord bridge.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/index.ts src/config.ts src/__tests__/config.test.ts
git commit -m "feat: wire persistent state into startup"
```

### Task 7: Document the approval workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/user-setup-guide.md`
- Modify: `docs/antigravity-mcp-config.example.json`

**Step 1: Write the failing doc checklist**

Document missing items:

- no approval workflow overview
- no DB path configuration
- no `merge / hold / retry` examples
- no runner integration notes

**Step 2: Verify the docs are incomplete**

Read: `README.md`
Expected: approval workflow is not described.

**Step 3: Write minimal documentation**

Add:

- approval flow overview
- required env vars
- Discord command examples
- runner integration notes

**Step 4: Verify the docs**

Read: `README.md`, `docs/user-setup-guide.md`
Expected: approval flow can be followed without guessing.

**Step 5: Commit**

```bash
git add README.md docs/user-setup-guide.md docs/antigravity-mcp-config.example.json
git commit -m "docs: add approval workflow documentation"
```

### Task 8: Verification sweep

**Files:**
- Modify: `README.md` if verification notes are needed

**Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 2: Run type checking**

Run: `npm run check`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Perform a manual smoke check**

Run:

```bash
npm start
```

Expected:

- Discord bot connects
- MCP stdio transport connects
- approval tools are available

**Step 5: Commit**

```bash
git add README.md
git commit -m "chore: verify approval workflow implementation"
```
