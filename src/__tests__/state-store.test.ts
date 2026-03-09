import assert from "node:assert/strict";
import test from "node:test";

import { StateStore } from "../state-store.js";

function createTestStore(): StateStore {
  return new StateStore(":memory:");
}

test("creates and resolves an approval request", () => {
  const store = createTestStore();
  const approval = store.createApprovalRequest({
    issueId: "DISC-123",
    requestedAction: "merge",
  });

  const resolved = store.resolveApproval({
    approvalId: approval.approvalId,
    resolution: "approved",
  });

  assert.equal(resolved.status, "approved");
});

test("upserts and fetches run state", () => {
  const store = createTestStore();

  store.upsertRunState({
    issueId: "DISC-123",
    status: "merge_pending",
    summary: "Waiting for approval",
  });

  const run = store.getRunState("DISC-123");

  assert.equal(run?.status, "merge_pending");
  assert.equal(run?.summary, "Waiting for approval");
});
