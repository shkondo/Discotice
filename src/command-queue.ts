import type { AppConfig } from "./config.js";
import type {
  AcceptedCommandResult,
  CommandOrigin,
  CommandQueueStatus,
  CommandRecord
} from "./types.js";

interface IncomingCommand {
  readonly id: string;
  readonly commandText: string;
  readonly origin: CommandOrigin;
}

export class CommandQueue {
  private readonly pending: CommandRecord[] = [];
  private readonly claimed = new Map<string, CommandRecord>();
  private readonly completed = new Map<string, CommandRecord>();
  private readonly rejected = new Map<string, CommandRecord>();

  public constructor(
    private readonly config: Pick<
      AppConfig,
      "blockedFragments" | "commandMaxLength" | "queueLimit"
    >
  ) {}

  public enqueue(input: IncomingCommand): AcceptedCommandResult {
    if (this.has(input.id)) {
      return {
        accepted: false,
        reason: "This Discord message was already processed."
      };
    }

    const normalized = input.commandText.trim();

    if (!normalized) {
      return {
        accepted: false,
        reason: "Command text is empty after removing the bot mention."
      };
    }

    if (normalized.length > this.config.commandMaxLength) {
      return {
        accepted: false,
        reason: `Command exceeds the ${this.config.commandMaxLength} character limit.`
      };
    }

    const lowered = normalized.toLowerCase();
    const blocked = this.config.blockedFragments.find((fragment) =>
      lowered.includes(fragment)
    );

    if (blocked) {
      return {
        accepted: false,
        reason: `Command contains a blocked fragment: "${blocked}".`
      };
    }

    if (this.pending.length + this.claimed.size >= this.config.queueLimit) {
      return {
        accepted: false,
        reason: "The command queue is full."
      };
    }

    const record: CommandRecord = {
      id: input.id,
      commandText: normalized,
      origin: input.origin,
      status: "pending"
    };

    this.pending.push(record);

    return {
      accepted: true,
      command: this.toPublicRecord(record)
    };
  }

  public listPending(limit: number): CommandRecord[] {
    return this.pending.slice(0, limit).map((record) => this.toPublicRecord(record));
  }

  public claimNext(): CommandRecord | null {
    const next = this.pending.shift();

    if (!next) {
      return null;
    }

    next.status = "claimed";
    next.claimedAt = new Date().toISOString();
    this.claimed.set(next.id, next);

    return this.toPublicRecord(next);
  }

  public resolveCompleted(
    commandId: string,
    note: string,
    deliveredMessageIds: string[]
  ): CommandRecord {
    const record = this.claimed.get(commandId);

    if (!record) {
      throw new Error(`Command "${commandId}" is not currently claimed.`);
    }

    this.claimed.delete(commandId);
    record.status = "completed";
    record.completedAt = new Date().toISOString();
    record.resolutionNote = note;
    record.deliveredMessageIds = [...deliveredMessageIds];
    this.completed.set(record.id, record);

    return this.toPublicRecord(record);
  }

  public resolveRejected(commandId: string, reason: string): CommandRecord {
    const pendingIndex = this.pending.findIndex((record) => record.id === commandId);
    let record: CommandRecord | undefined;

    if (pendingIndex >= 0) {
      const pendingRecord = this.pending.splice(pendingIndex, 1)[0];

      if (pendingRecord) {
        record = pendingRecord;
      }
    } else {
      record = this.claimed.get(commandId);

      if (record) {
        this.claimed.delete(commandId);
      }
    }

    if (!record) {
      throw new Error(`Command "${commandId}" is not pending or claimed.`);
    }

    record.status = "rejected";
    record.completedAt = new Date().toISOString();
    record.resolutionNote = reason;
    this.rejected.set(record.id, record);

    return this.toPublicRecord(record);
  }

  public getTrackedCommand(commandId: string): CommandRecord | null {
    const pending = this.pending.find((record) => record.id === commandId);

    if (pending) {
      return this.toPublicRecord(pending);
    }

    const claimed = this.claimed.get(commandId);

    if (claimed) {
      return this.toPublicRecord(claimed);
    }

    const completed = this.completed.get(commandId);

    if (completed) {
      return this.toPublicRecord(completed);
    }

    const rejected = this.rejected.get(commandId);

    if (rejected) {
      return this.toPublicRecord(rejected);
    }

    return null;
  }

  public getClaimedCommand(commandId: string): CommandRecord {
    const claimed = this.claimed.get(commandId);

    if (!claimed) {
      throw new Error(`Command "${commandId}" is not currently claimed.`);
    }

    return claimed;
  }

  public getResponseTarget(commandId: string): CommandRecord {
    const pending = this.pending.find((record) => record.id === commandId);

    if (pending) {
      return pending;
    }

    const claimed = this.claimed.get(commandId);

    if (claimed) {
      return claimed;
    }

    throw new Error(`Command "${commandId}" is not pending or claimed.`);
  }

  public getStatus(): CommandQueueStatus {
    return {
      pending: this.pending.length,
      claimed: this.claimed.size,
      completed: this.completed.size,
      rejected: this.rejected.size,
      capacity: this.config.queueLimit
    };
  }

  private has(commandId: string): boolean {
    return (
      this.pending.some((record) => record.id === commandId) ||
      this.claimed.has(commandId) ||
      this.completed.has(commandId) ||
      this.rejected.has(commandId)
    );
  }

  private toPublicRecord(record: CommandRecord): CommandRecord {
    return {
      ...record,
      origin: {
        ...record.origin
      },
      deliveredMessageIds: record.deliveredMessageIds
        ? [...record.deliveredMessageIds]
        : undefined
    };
  }
}
