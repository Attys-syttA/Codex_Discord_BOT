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

  get(contextKey: DiscordContextKey): SessionMetadata | undefined {
    return this.sessions.get(contextKey);
  }

  upsert(metadata: Omit<SessionMetadata, "updatedAt">): SessionMetadata {
    const next = {
      ...metadata,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(metadata.contextKey, next);
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
    return this.sessions.delete(contextKey);
  }

  list(): SessionMetadata[] {
    return [...this.sessions.values()].sort((left, right) => left.contextKey.localeCompare(right.contextKey));
  }
}
