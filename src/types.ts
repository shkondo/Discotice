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
