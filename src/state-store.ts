import Database from "better-sqlite3";

import type {
  ApprovalAction,
  ApprovalRequestRecord,
  ApprovalStatus,
  AuditEventRecord,
  RunStateRecord,
  RunStatus,
} from "./types.js";

interface CreateApprovalRequestInput {
  readonly issueId: string;
  readonly requestedAction: ApprovalAction;
}

interface ResolveApprovalInput {
  readonly approvalId: string;
  readonly resolution: Exclude<ApprovalStatus, "pending">;
  readonly resolutionNote?: string;
}

interface UpsertRunStateInput {
  readonly issueId: string;
  readonly status: RunStatus;
  readonly summary?: string;
}

interface AppendAuditEventInput {
  readonly issueId: string;
  readonly eventType: string;
  readonly details?: string;
}

export class StateStore {
  private readonly db: Database.Database;

  public constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  public createApprovalRequest(input: CreateApprovalRequestInput): ApprovalRequestRecord {
    const approval: ApprovalRequestRecord = {
      approvalId: crypto.randomUUID(),
      issueId: input.issueId,
      requestedAction: input.requestedAction,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO approval_requests (
          approval_id,
          issue_id,
          requested_action,
          status,
          created_at,
          resolved_at,
          resolution_note
        ) VALUES (
          @approvalId,
          @issueId,
          @requestedAction,
          @status,
          @createdAt,
          NULL,
          NULL
        )`,
      )
      .run(approval);

    this.appendAuditEvent({
      issueId: input.issueId,
      eventType: "approval_created",
      details: `${input.requestedAction}:${approval.approvalId}`,
    });

    return approval;
  }

  public listPendingApprovals(): ApprovalRequestRecord[] {
    return this.db
      .prepare(
        `SELECT
          approval_id AS approvalId,
          issue_id AS issueId,
          requested_action AS requestedAction,
          status,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM approval_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC`,
      )
      .all() as ApprovalRequestRecord[];
  }

  public resolveApproval(input: ResolveApprovalInput): ApprovalRequestRecord {
    const resolvedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE approval_requests
        SET status = @resolution,
            resolved_at = @resolvedAt,
            resolution_note = @resolutionNote
        WHERE approval_id = @approvalId
          AND status = 'pending'`,
      )
      .run({
        approvalId: input.approvalId,
        resolution: input.resolution,
        resolvedAt,
        resolutionNote: input.resolutionNote ?? null,
      });

    if (result.changes === 0) {
      throw new Error(`Pending approval not found: ${input.approvalId}`);
    }

    const approval = this.getApproval(input.approvalId);
    if (!approval) {
      throw new Error(`Approval not found after update: ${input.approvalId}`);
    }

    this.appendAuditEvent({
      issueId: approval.issueId,
      eventType: "approval_resolved",
      details: `${input.resolution}:${approval.approvalId}`,
    });

    return approval;
  }

  public getApproval(approvalId: string): ApprovalRequestRecord | undefined {
    return this.db
      .prepare(
        `SELECT
          approval_id AS approvalId,
          issue_id AS issueId,
          requested_action AS requestedAction,
          status,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM approval_requests
        WHERE approval_id = ?`,
      )
      .get(approvalId) as ApprovalRequestRecord | undefined;
  }

  public upsertRunState(input: UpsertRunStateInput): RunStateRecord {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO run_states (issue_id, status, updated_at, summary)
        VALUES (@issueId, @status, @updatedAt, @summary)
        ON CONFLICT(issue_id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          summary = excluded.summary`,
      )
      .run({
        issueId: input.issueId,
        status: input.status,
        updatedAt,
        summary: input.summary ?? null,
      });

    this.appendAuditEvent({
      issueId: input.issueId,
      eventType: "run_state_updated",
      details: `${input.status}:${input.summary ?? ""}`,
    });

    const runState = this.getRunState(input.issueId);
    if (!runState) {
      throw new Error(`Run state not found after upsert: ${input.issueId}`);
    }

    return runState;
  }

  public getRunState(issueId: string): RunStateRecord | undefined {
    return this.db
      .prepare(
        `SELECT
          issue_id AS issueId,
          status,
          updated_at AS updatedAt,
          summary
        FROM run_states
        WHERE issue_id = ?`,
      )
      .get(issueId) as RunStateRecord | undefined;
  }

  public listActiveRuns(): RunStateRecord[] {
    return this.db
      .prepare(
        `SELECT
          issue_id AS issueId,
          status,
          updated_at AS updatedAt,
          summary
        FROM run_states
        WHERE status NOT IN ('completed', 'failed', 'cancelled')
        ORDER BY updated_at DESC`,
      )
      .all() as RunStateRecord[];
  }

  public appendAuditEvent(input: AppendAuditEventInput): AuditEventRecord {
    const event: AuditEventRecord = {
      eventId: crypto.randomUUID(),
      issueId: input.issueId,
      eventType: input.eventType,
      createdAt: new Date().toISOString(),
      details: input.details,
    };

    this.db
      .prepare(
        `INSERT INTO audit_events (
          event_id,
          issue_id,
          event_type,
          created_at,
          details
        ) VALUES (
          @eventId,
          @issueId,
          @eventType,
          @createdAt,
          @details
        )`,
      )
      .run({
        ...event,
        details: event.details ?? null,
      });

    return event;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        approval_id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        requested_action TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_note TEXT
      );

      CREATE TABLE IF NOT EXISTS run_states (
        issue_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        event_id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        details TEXT
      );
    `);
  }
}
