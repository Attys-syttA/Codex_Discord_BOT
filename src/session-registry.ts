import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { DiscordContextKey } from "./discord-context.js";

export interface SessionMetadata {
  contextKey: DiscordContextKey;
  projectChannelId: string;
  threadId?: string;
  workspace: string;
  workerId: string;
  workerSessionId?: string;
  codexThreadId?: string;
  updatedAt: string;
}

export class SessionRegistry {
  private readonly sessions = new Map<DiscordContextKey, SessionMetadata>();

  constructor(initialSessions: SessionMetadata[] = []) {
    for (const session of initialSessions) {
      this.sessions.set(session.contextKey, session);
    }
  }

  get(contextKey: DiscordContextKey): SessionMetadata | undefined {
    return this.sessions.get(contextKey);
  }

  upsert(metadata: Omit<SessionMetadata, "updatedAt">): SessionMetadata {
    const next = {
      ...metadata,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(metadata.contextKey, next);
    this.onChanged();
    return next;
  }

  attachThread(contextKey: DiscordContextKey, codexThreadId: string): SessionMetadata {
    const current = this.sessions.get(contextKey);
    if (!current) {
      throw new Error(`Cannot attach Codex thread without a session context: ${contextKey}`);
    }

    return this.upsert({
      ...current,
      codexThreadId,
    });
  }

  remove(contextKey: DiscordContextKey): boolean {
    const deleted = this.sessions.delete(contextKey);
    if (deleted) {
      this.onChanged();
    }
    return deleted;
  }

  list(): SessionMetadata[] {
    return [...this.sessions.values()].sort((left, right) => left.contextKey.localeCompare(right.contextKey));
  }

  protected onChanged(): void {
    // Hook for durable registries.
  }
}

export class FileSessionRegistry extends SessionRegistry {
  constructor(private readonly storePath: string) {
    super(loadStoredSessions(storePath));
  }

  protected override onChanged(): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    writeFileSync(
      this.storePath,
      `${JSON.stringify({ version: 1, sessions: this.list() }, null, 2)}\n`,
      "utf8",
    );
  }
}

function loadStoredSessions(storePath: string): SessionMetadata[] {
  if (!existsSync(storePath)) {
    return [];
  }

  const raw = readFileSync(storePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  const sessions = readSessionArray(parsed);
  return sessions.map((entry, index) => readSessionMetadata(entry, `sessions[${index}]`));
}

function readSessionArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object" && Array.isArray((value as { sessions?: unknown }).sessions)) {
    return (value as { sessions: unknown[] }).sessions;
  }

  throw new Error("Invalid session store: expected a session array");
}

function readSessionMetadata(value: unknown, name: string): SessionMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid session store entry ${name}: expected an object`);
  }

  const record = value as Record<string, unknown>;
  const metadata: SessionMetadata = {
    contextKey: requireString(record.contextKey, `${name}.contextKey`) as DiscordContextKey,
    projectChannelId: requireString(record.projectChannelId, `${name}.projectChannelId`),
    workspace: requireString(record.workspace, `${name}.workspace`),
    workerId: requireString(record.workerId, `${name}.workerId`),
    updatedAt: requireString(record.updatedAt, `${name}.updatedAt`),
  };

  const threadId = optionalString(record.threadId);
  if (threadId) {
    metadata.threadId = threadId;
  }

  const workerSessionId = optionalString(record.workerSessionId);
  if (workerSessionId) {
    metadata.workerSessionId = workerSessionId;
  }

  const codexThreadId = optionalString(record.codexThreadId);
  if (codexThreadId) {
    metadata.codexThreadId = codexThreadId;
  }

  return metadata;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid session store entry ${name}: expected a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim();
}
