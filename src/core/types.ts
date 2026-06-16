import type { DiscordContextKey } from "../discord-context.js";

export type SessionStatus =
  | "idle"
  | "busy"
  | "waiting_approval"
  | "error"
  | "stopped";

export type QueueItemStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ApprovalKind =
  | "command_execution"
  | "file_modification"
  | "push_publish"
  | "worker_question"
  | "dangerous_tool_action";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "auto_approved";

export type AutoApproveMode = "off" | "on";

export interface ChannelBinding {
  guildId: string;
  channelId: string;
  workspace: string;
  workerId: string;
  autoPromptEnabled: boolean;
  autoApproveMode: AutoApproveMode;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadBinding {
  guildId: string;
  parentChannelId: string;
  threadId: string;
  sessionMode: "channel" | "thread";
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  contextKey: DiscordContextKey;
  guildId: string;
  channelId: string;
  threadId?: string;
  workspace: string;
  workerId: string;
  workerSessionId?: string;
  codexThreadId?: string;
  status: SessionStatus;
  lastActivityAt: string;
  lastPromptPreview?: string;
  lastResponsePreview?: string;
  updatedAt: string;
}

export interface QueueItem {
  id: number;
  contextKey: DiscordContextKey;
  discordUserId: string;
  sourceMessageId?: string;
  promptText: string;
  status: QueueItemStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ApprovalRequest {
  id: number;
  contextKey: DiscordContextKey;
  workerId: string;
  workerSessionId?: string;
  approvalKind: ApprovalKind;
  payloadJson: string;
  discordMessageId?: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedByDiscordUserId?: string;
}

export interface AuditLogEntry {
  id: number;
  contextKey: DiscordContextKey;
  actorDiscordUserId?: string;
  action: string;
  result: string;
  detailJson?: string;
  createdAt: string;
}

export interface PromptResult {
  responseParts: string[];
  toolStarts: number;
  toolFailures: number;
  approvalRequest?: ApprovalRequest;
  usage?: {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
  };
}
