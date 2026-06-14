export type DiscordContextKey = string;

export interface ParsedDiscordContextKey {
  guildId: string;
  projectChannelId: string;
  threadId?: string;
}

export interface ProjectChannelInput {
  channelId: string;
  parentId?: string | null;
  isThread: boolean;
}

export function contextKeyFromIds(
  guildId: string,
  projectChannelId: string,
  threadId?: string,
): DiscordContextKey {
  return threadId ? `${guildId}:${projectChannelId}:${threadId}` : `${guildId}:${projectChannelId}`;
}

export function parseContextKey(key: DiscordContextKey): ParsedDiscordContextKey {
  const parts = key.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(`Invalid Discord context key: ${key}`);
  }

  const [guildId, projectChannelId, threadId] = parts;
  if (!guildId || !projectChannelId) {
    throw new Error(`Invalid Discord context key: ${key}`);
  }

  return threadId ? { guildId, projectChannelId, threadId } : { guildId, projectChannelId };
}

export function isThreadContextKey(key: DiscordContextKey): boolean {
  return key.split(":").length === 3;
}

export function resolveProjectChannelId(input: ProjectChannelInput): string {
  if (!input.isThread) {
    return input.channelId;
  }

  const parentId = input.parentId?.trim();
  if (!parentId) {
    throw new Error(`Thread channel ${input.channelId} does not have a parent project channel`);
  }
  return parentId;
}
