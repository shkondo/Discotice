import assert from "node:assert/strict";
import test from "node:test";

import { isTerminalRunStatus } from "../types.js";

test("merge_pending is not terminal", () => {
  assert.equal(isTerminalRunStatus("merge_pending"), false);
});

test("completed is terminal", () => {
  assert.equal(isTerminalRunStatus("completed"), true);
});
