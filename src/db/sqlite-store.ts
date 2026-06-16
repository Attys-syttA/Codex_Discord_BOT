import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import type {
  ApprovalKind,
  ApprovalRequest,
  ApprovalStatus,
  AuditLogEntry,
  AutoApproveMode,
  ChannelBinding,
  QueueItem,
  QueueItemStatus,
  SessionRecord,
  SessionStatus,
  ThreadBinding,
} from "../core/types.js";
import type { DiscordContextKey } from "../discord-context.js";

interface LegacySessionRecord {
  contextKey: string;
  projectChannelId: string;
  threadId?: string;
  workspace: string;
  workerId: string;
  workerSessionId?: string;
  codexThreadId?: string;
  updatedAt: string;
}

export interface SqliteStateStoreOptions {
  databasePath: string;
  legacySessionStorePath?: string;
}

export class SqliteStateStore {
  private readonly db: Database.Database;

  constructor(private readonly options: SqliteStateStoreOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.db = new Database(options.databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.importLegacySessionsIfNeeded();
  }

  close(): void {
    this.db.close();
  }

  getChannelBinding(guildId: string, channelId: string): ChannelBinding | undefined {
    const row = this.db.prepare(`
      SELECT guild_id, channel_id, workspace, worker_id, auto_prompt_enabled, auto_approve_mode, created_at, updated_at
      FROM channel_bindings
      WHERE guild_id = ? AND channel_id = ?
    `).get(guildId, channelId) as ChannelBindingRow | undefined;
    return row ? mapChannelBinding(row) : undefined;
  }

  listChannelBindings(guildId?: string): ChannelBinding[] {
    const sql = guildId
      ? `
        SELECT guild_id, channel_id, workspace, worker_id, auto_prompt_enabled, auto_approve_mode, created_at, updated_at
        FROM channel_bindings
        WHERE guild_id = ?
        ORDER BY channel_id
      `
      : `
        SELECT guild_id, channel_id, workspace, worker_id, auto_prompt_enabled, auto_approve_mode, created_at, updated_at
        FROM channel_bindings
        ORDER BY guild_id, channel_id
      `;
    const rows = guildId
      ? this.db.prepare(sql).all(guildId)
      : this.db.prepare(sql).all();
    return (rows as ChannelBindingRow[]).map(mapChannelBinding);
  }

  upsertChannelBinding(
    value: Omit<ChannelBinding, "createdAt" | "updatedAt"> & Partial<Pick<ChannelBinding, "createdAt" | "updatedAt">>,
  ): ChannelBinding {
    const current = this.getChannelBinding(value.guildId, value.channelId);
    const now = new Date().toISOString();
    const createdAt = value.createdAt ?? current?.createdAt ?? now;
    const updatedAt = value.updatedAt ?? now;

    this.db.prepare(`
      INSERT INTO channel_bindings (
        guild_id, channel_id, workspace, worker_id, auto_prompt_enabled, auto_approve_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET
        workspace = excluded.workspace,
        worker_id = excluded.worker_id,
        auto_prompt_enabled = excluded.auto_prompt_enabled,
        auto_approve_mode = excluded.auto_approve_mode,
        updated_at = excluded.updated_at
    `).run(
      value.guildId,
      value.channelId,
      value.workspace,
      value.workerId,
      value.autoPromptEnabled ? 1 : 0,
      value.autoApproveMode,
      createdAt,
      updatedAt,
    );

    return this.getChannelBinding(value.guildId, value.channelId)!;
  }

  removeChannelBinding(guildId: string, channelId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM channel_bindings
      WHERE guild_id = ? AND channel_id = ?
    `).run(guildId, channelId);
    return result.changes > 0;
  }

  getThreadBinding(guildId: string, threadId: string): ThreadBinding | undefined {
    const row = this.db.prepare(`
      SELECT guild_id, parent_channel_id, thread_id, session_mode, display_name, created_at, updated_at
      FROM thread_bindings
      WHERE guild_id = ? AND thread_id = ?
    `).get(guildId, threadId) as ThreadBindingRow | undefined;
    return row ? mapThreadBinding(row) : undefined;
  }

  upsertThreadBinding(
    value: Omit<ThreadBinding, "createdAt" | "updatedAt"> & Partial<Pick<ThreadBinding, "createdAt" | "updatedAt">>,
  ): ThreadBinding {
    const current = this.getThreadBinding(value.guildId, value.threadId);
    const now = new Date().toISOString();
    const createdAt = value.createdAt ?? current?.createdAt ?? now;
    const updatedAt = value.updatedAt ?? now;

    this.db.prepare(`
      INSERT INTO thread_bindings (
        guild_id, parent_channel_id, thread_id, session_mode, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, thread_id) DO UPDATE SET
        parent_channel_id = excluded.parent_channel_id,
        session_mode = excluded.session_mode,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at
    `).run(
      value.guildId,
      value.parentChannelId,
      value.threadId,
      value.sessionMode,
      value.displayName ?? null,
      createdAt,
      updatedAt,
    );

    return this.getThreadBinding(value.guildId, value.threadId)!;
  }

  getSession(contextKey: DiscordContextKey): SessionRecord | undefined {
    const row = this.db.prepare(`
      SELECT context_key, guild_id, channel_id, thread_id, workspace, worker_id, worker_session_id, codex_thread_id,
             status, last_activity_at, last_prompt_preview, last_response_preview, updated_at
      FROM sessions
      WHERE context_key = ?
    `).get(contextKey) as SessionRow | undefined;
    return row ? mapSessionRecord(row) : undefined;
  }

  listSessions(guildId?: string, channelId?: string): SessionRecord[] {
    let sql = `
      SELECT context_key, guild_id, channel_id, thread_id, workspace, worker_id, worker_session_id, codex_thread_id,
             status, last_activity_at, last_prompt_preview, last_response_preview, updated_at
      FROM sessions
    `;
    const params: string[] = [];
    const conditions: string[] = [];
    if (guildId) {
      conditions.push("guild_id = ?");
      params.push(guildId);
    }
    if (channelId) {
      conditions.push("channel_id = ?");
      params.push(channelId);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
    sql += " ORDER BY updated_at DESC";
    return (this.db.prepare(sql).all(...params) as SessionRow[]).map(mapSessionRecord);
  }

  upsertSession(
    value: Omit<SessionRecord, "updatedAt" | "lastActivityAt"> & Partial<Pick<SessionRecord, "updatedAt" | "lastActivityAt">>,
  ): SessionRecord {
    const current = this.getSession(value.contextKey);
    const now = new Date().toISOString();
    const updatedAt = value.updatedAt ?? now;
    const lastActivityAt = value.lastActivityAt ?? now;

    this.db.prepare(`
      INSERT INTO sessions (
        context_key, guild_id, channel_id, thread_id, workspace, worker_id, worker_session_id, codex_thread_id,
        status, last_activity_at, last_prompt_preview, last_response_preview, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_key) DO UPDATE SET
        guild_id = excluded.guild_id,
        channel_id = excluded.channel_id,
        thread_id = excluded.thread_id,
        workspace = excluded.workspace,
        worker_id = excluded.worker_id,
        worker_session_id = excluded.worker_session_id,
        codex_thread_id = excluded.codex_thread_id,
        status = excluded.status,
        last_activity_at = excluded.last_activity_at,
        last_prompt_preview = excluded.last_prompt_preview,
        last_response_preview = excluded.last_response_preview,
        updated_at = excluded.updated_at
    `).run(
      value.contextKey,
      value.guildId,
      value.channelId,
      value.threadId ?? null,
      value.workspace,
      value.workerId,
      value.workerSessionId ?? current?.workerSessionId ?? null,
      value.codexThreadId ?? current?.codexThreadId ?? null,
      value.status,
      lastActivityAt,
      value.lastPromptPreview ?? current?.lastPromptPreview ?? null,
      value.lastResponsePreview ?? current?.lastResponsePreview ?? null,
      updatedAt,
    );

    return this.getSession(value.contextKey)!;
  }

  removeSession(contextKey: DiscordContextKey): boolean {
    const result = this.db.prepare(`
      DELETE FROM sessions
      WHERE context_key = ?
    `).run(contextKey);
    return result.changes > 0;
  }

  enqueuePrompt(
    value: Omit<QueueItem, "id" | "createdAt" | "status"> & Partial<Pick<QueueItem, "createdAt" | "status">>,
  ): QueueItem {
    const createdAt = value.createdAt ?? new Date().toISOString();
    const status = value.status ?? "queued";
    const result = this.db.prepare(`
      INSERT INTO queue_items (
        context_key, discord_user_id, source_message_id, prompt_text, status, created_at, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.contextKey,
      value.discordUserId,
      value.sourceMessageId ?? null,
      value.promptText,
      status,
      createdAt,
      value.startedAt ?? null,
      value.finishedAt ?? null,
    );
    return this.getQueueItem(Number(result.lastInsertRowid))!;
  }

  getQueueItem(id: number): QueueItem | undefined {
    const row = this.db.prepare(`
      SELECT id, context_key, discord_user_id, source_message_id, prompt_text, status, created_at, started_at, finished_at
      FROM queue_items
      WHERE id = ?
    `).get(id) as QueueItemRow | undefined;
    return row ? mapQueueItem(row) : undefined;
  }

  listQueue(contextKey: DiscordContextKey): QueueItem[] {
    return (this.db.prepare(`
      SELECT id, context_key, discord_user_id, source_message_id, prompt_text, status, created_at, started_at, finished_at
      FROM queue_items
      WHERE context_key = ? AND status IN ('queued', 'running')
      ORDER BY id
    `).all(contextKey) as QueueItemRow[]).map(mapQueueItem);
  }

  countQueuedItems(contextKey: DiscordContextKey): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM queue_items
      WHERE context_key = ? AND status = 'queued'
    `).get(contextKey) as { count: number };
    return row.count;
  }

  markQueueItemStatus(id: number, status: QueueItemStatus): QueueItem | undefined {
    const now = new Date().toISOString();
    const startedAt = status === "running" ? now : undefined;
    const finishedAt = ["completed", "failed", "cancelled"].includes(status) ? now : undefined;
    this.db.prepare(`
      UPDATE queue_items
      SET status = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at)
      WHERE id = ?
    `).run(status, startedAt ?? null, finishedAt ?? null, id);
    return this.getQueueItem(id);
  }

  clearQueue(contextKey: DiscordContextKey): number {
    const result = this.db.prepare(`
      UPDATE queue_items
      SET status = 'cancelled', finished_at = ?
      WHERE context_key = ? AND status = 'queued'
    `).run(new Date().toISOString(), contextKey);
    return result.changes;
  }

  createApprovalRequest(
    value: Omit<ApprovalRequest, "id" | "createdAt" | "status"> & Partial<Pick<ApprovalRequest, "createdAt" | "status">>,
  ): ApprovalRequest {
    const createdAt = value.createdAt ?? new Date().toISOString();
    const status = value.status ?? "pending";
    const result = this.db.prepare(`
      INSERT INTO approval_requests (
        context_key, worker_id, worker_session_id, approval_kind, payload_json, discord_message_id,
        status, created_at, resolved_at, resolved_by_discord_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.contextKey,
      value.workerId,
      value.workerSessionId ?? null,
      value.approvalKind,
      value.payloadJson,
      value.discordMessageId ?? null,
      status,
      createdAt,
      value.resolvedAt ?? null,
      value.resolvedByDiscordUserId ?? null,
    );
    return this.getApprovalRequest(Number(result.lastInsertRowid))!;
  }

  getApprovalRequest(id: number): ApprovalRequest | undefined {
    const row = this.db.prepare(`
      SELECT id, context_key, worker_id, worker_session_id, approval_kind, payload_json, discord_message_id,
             status, created_at, resolved_at, resolved_by_discord_user_id
      FROM approval_requests
      WHERE id = ?
    `).get(id) as ApprovalRow | undefined;
    return row ? mapApprovalRequest(row) : undefined;
  }

  updateApprovalRequestMessageId(id: number, discordMessageId: string): ApprovalRequest | undefined {
    this.db.prepare(`
      UPDATE approval_requests
      SET discord_message_id = ?
      WHERE id = ?
    `).run(discordMessageId, id);
    return this.getApprovalRequest(id);
  }

  listPendingApprovals(contextKey?: DiscordContextKey): ApprovalRequest[] {
    const rows = contextKey
      ? this.db.prepare(`
          SELECT id, context_key, worker_id, worker_session_id, approval_kind, payload_json, discord_message_id,
                 status, created_at, resolved_at, resolved_by_discord_user_id
          FROM approval_requests
          WHERE context_key = ? AND status = 'pending'
          ORDER BY id
        `).all(contextKey)
      : this.db.prepare(`
          SELECT id, context_key, worker_id, worker_session_id, approval_kind, payload_json, discord_message_id,
                 status, created_at, resolved_at, resolved_by_discord_user_id
          FROM approval_requests
          WHERE status = 'pending'
          ORDER BY id
        `).all();
    return (rows as ApprovalRow[]).map(mapApprovalRequest);
  }

  expirePendingApprovals(expiredBefore: string, contextKey?: DiscordContextKey): number {
    const result = contextKey
      ? this.db.prepare(`
          UPDATE approval_requests
          SET status = 'expired', resolved_at = ?
          WHERE context_key = ? AND status = 'pending' AND created_at <= ?
        `).run(expiredBefore, contextKey, expiredBefore)
      : this.db.prepare(`
          UPDATE approval_requests
          SET status = 'expired', resolved_at = ?
          WHERE status = 'pending' AND created_at <= ?
        `).run(expiredBefore, expiredBefore);
    return result.changes;
  }

  resolveApprovalRequest(id: number, status: ApprovalStatus, resolvedByDiscordUserId?: string): ApprovalRequest | undefined {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE approval_requests
      SET status = ?, resolved_at = ?, resolved_by_discord_user_id = ?
      WHERE id = ?
    `).run(status, now, resolvedByDiscordUserId ?? null, id);
    return this.getApprovalRequest(id);
  }

  appendAuditLog(
    value: Omit<AuditLogEntry, "id" | "createdAt"> & Partial<Pick<AuditLogEntry, "createdAt">>,
  ): AuditLogEntry {
    const createdAt = value.createdAt ?? new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO audit_log (context_key, actor_discord_user_id, action, result, detail_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      value.contextKey,
      value.actorDiscordUserId ?? null,
      value.action,
      value.result,
      value.detailJson ?? null,
      createdAt,
    );
    const row = this.db.prepare(`
      SELECT id, context_key, actor_discord_user_id, action, result, detail_json, created_at
      FROM audit_log
      WHERE id = ?
    `).get(Number(result.lastInsertRowid)) as AuditRow;
    return mapAuditLog(row);
  }

  listAuditLog(contextKey?: DiscordContextKey): AuditLogEntry[] {
    const rows = contextKey
      ? this.db.prepare(`
          SELECT id, context_key, actor_discord_user_id, action, result, detail_json, created_at
          FROM audit_log
          WHERE context_key = ?
          ORDER BY id
        `).all(contextKey)
      : this.db.prepare(`
          SELECT id, context_key, actor_discord_user_id, action, result, detail_json, created_at
          FROM audit_log
          ORDER BY id
        `).all();
    return (rows as AuditRow[]).map(mapAuditLog);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_bindings (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        workspace TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        auto_prompt_enabled INTEGER NOT NULL DEFAULT 1,
        auto_approve_mode TEXT NOT NULL DEFAULT 'off',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS thread_bindings (
        guild_id TEXT NOT NULL,
        parent_channel_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        session_mode TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, thread_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        context_key TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        workspace TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        worker_session_id TEXT,
        codex_thread_id TEXT,
        status TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        last_prompt_preview TEXT,
        last_response_preview TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_key TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        source_message_id TEXT,
        prompt_text TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS approval_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_key TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        worker_session_id TEXT,
        approval_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        discord_message_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by_discord_user_id TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_key TEXT NOT NULL,
        actor_discord_user_id TEXT,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        detail_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  private importLegacySessionsIfNeeded(): void {
    const hasSessions = this.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    if (hasSessions.count > 0 || !this.options.legacySessionStorePath || !existsSync(this.options.legacySessionStorePath)) {
      return;
    }

    const raw = readFileSync(this.options.legacySessionStorePath, "utf8").trim();
    if (!raw) {
      return;
    }

    const payload = JSON.parse(raw) as { sessions?: LegacySessionRecord[] } | LegacySessionRecord[];
    const sessions = Array.isArray(payload) ? payload : payload.sessions ?? [];
    for (const entry of sessions) {
      const parts = String(entry.contextKey).split(":");
      const guildId = parts[0];
      const channelId = parts[1];
      if (!guildId || !channelId) {
        continue;
      }
      this.upsertSession({
        contextKey: entry.contextKey,
        guildId,
        channelId,
        workspace: entry.workspace,
        workerId: entry.workerId,
        status: "idle",
        lastActivityAt: entry.updatedAt,
        updatedAt: entry.updatedAt,
        ...(entry.threadId ? { threadId: entry.threadId } : {}),
        ...(entry.workerSessionId ? { workerSessionId: entry.workerSessionId } : {}),
        ...(entry.codexThreadId ? { codexThreadId: entry.codexThreadId } : {}),
      });
    }
  }
}

interface ChannelBindingRow {
  guild_id: string;
  channel_id: string;
  workspace: string;
  worker_id: string;
  auto_prompt_enabled: number;
  auto_approve_mode: AutoApproveMode;
  created_at: string;
  updated_at: string;
}

interface ThreadBindingRow {
  guild_id: string;
  parent_channel_id: string;
  thread_id: string;
  session_mode: "channel" | "thread";
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  context_key: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  workspace: string;
  worker_id: string;
  worker_session_id: string | null;
  codex_thread_id: string | null;
  status: SessionStatus;
  last_activity_at: string;
  last_prompt_preview: string | null;
  last_response_preview: string | null;
  updated_at: string;
}

interface QueueItemRow {
  id: number;
  context_key: string;
  discord_user_id: string;
  source_message_id: string | null;
  prompt_text: string;
  status: QueueItemStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface ApprovalRow {
  id: number;
  context_key: string;
  worker_id: string;
  worker_session_id: string | null;
  approval_kind: ApprovalKind;
  payload_json: string;
  discord_message_id: string | null;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by_discord_user_id: string | null;
}

interface AuditRow {
  id: number;
  context_key: string;
  actor_discord_user_id: string | null;
  action: string;
  result: string;
  detail_json: string | null;
  created_at: string;
}

function mapChannelBinding(row: ChannelBindingRow): ChannelBinding {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    workspace: row.workspace,
    workerId: row.worker_id,
    autoPromptEnabled: row.auto_prompt_enabled === 1,
    autoApproveMode: row.auto_approve_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapThreadBinding(row: ThreadBindingRow): ThreadBinding {
  return {
    guildId: row.guild_id,
    parentChannelId: row.parent_channel_id,
    threadId: row.thread_id,
    sessionMode: row.session_mode,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRecord(row: SessionRow): SessionRecord {
  return {
    contextKey: row.context_key,
    guildId: row.guild_id,
    channelId: row.channel_id,
    ...(row.thread_id ? { threadId: row.thread_id } : {}),
    workspace: row.workspace,
    workerId: row.worker_id,
    ...(row.worker_session_id ? { workerSessionId: row.worker_session_id } : {}),
    ...(row.codex_thread_id ? { codexThreadId: row.codex_thread_id } : {}),
    status: row.status,
    lastActivityAt: row.last_activity_at,
    ...(row.last_prompt_preview ? { lastPromptPreview: row.last_prompt_preview } : {}),
    ...(row.last_response_preview ? { lastResponsePreview: row.last_response_preview } : {}),
    updatedAt: row.updated_at,
  };
}

function mapQueueItem(row: QueueItemRow): QueueItem {
  return {
    id: row.id,
    contextKey: row.context_key,
    discordUserId: row.discord_user_id,
    ...(row.source_message_id ? { sourceMessageId: row.source_message_id } : {}),
    promptText: row.prompt_text,
    status: row.status,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
  };
}

function mapApprovalRequest(row: ApprovalRow): ApprovalRequest {
  return {
    id: row.id,
    contextKey: row.context_key,
    workerId: row.worker_id,
    ...(row.worker_session_id ? { workerSessionId: row.worker_session_id } : {}),
    approvalKind: row.approval_kind,
    payloadJson: row.payload_json,
    ...(row.discord_message_id ? { discordMessageId: row.discord_message_id } : {}),
    status: row.status,
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.resolved_by_discord_user_id ? { resolvedByDiscordUserId: row.resolved_by_discord_user_id } : {}),
  };
}

function mapAuditLog(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    contextKey: row.context_key,
    ...(row.actor_discord_user_id ? { actorDiscordUserId: row.actor_discord_user_id } : {}),
    action: row.action,
    result: row.result,
    ...(row.detail_json ? { detailJson: row.detail_json } : {}),
    createdAt: row.created_at,
  };
}
