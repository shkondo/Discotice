export interface CommandOrigin {
  readonly messageId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly authorId: string;
  readonly authorTag: string;
  readonly receivedAt: string;
}

export type CommandStatus = "pending" | "claimed" | "completed" | "rejected";

export interface CommandRecord {
  readonly id: string;
  readonly commandText: string;
  readonly origin: CommandOrigin;
  status: CommandStatus;
  claimedAt?: string;
  completedAt?: string;
  resolutionNote?: string;
  deliveredMessageIds?: string[];
}

export interface CommandQueueStatus {
  readonly pending: number;
  readonly claimed: number;
  readonly completed: number;
  readonly rejected: number;
  readonly capacity: number;
}

export interface AcceptedCommandResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly command?: CommandRecord;
}

export type ApprovalAction = "merge" | "hold" | "retry";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "held";

export type RunStatus =
  | "queued"
  | "running"
  | "merge_pending"
  | "retry_pending"
  | "completed"
  | "failed"
  | "cancelled";

export interface ApprovalRequestRecord {
  readonly approvalId: string;
  readonly issueId: string;
  readonly requestedAction: ApprovalAction;
  status: ApprovalStatus;
  readonly createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface RunStateRecord {
  readonly issueId: string;
  status: RunStatus;
  readonly updatedAt: string;
  summary?: string;
}

export interface AuditEventRecord {
  readonly eventId: string;
  readonly issueId: string;
  readonly eventType: string;
  readonly createdAt: string;
  readonly details?: string;
}

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}
