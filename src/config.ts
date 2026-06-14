export interface WorkerTarget {
  id: string;
  label: string;
  baseUrl: string;
  sharedSecret?: string;
}

export interface DiscordChannelMapping {
  channelId: string;
  workspace: string;
  workerId: string;
}

export interface DiscordBridgeConfig {
  discordToken: string;
  applicationId: string;
  guildId: string;
  allowedUserIds: string[];
  allowedUserIdSet: Set<string>;
  channelMappings: DiscordChannelMapping[];
  channelMappingById: Map<string, DiscordChannelMapping>;
  workers: WorkerTarget[];
  defaultWorkerId: string;
  workerTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DiscordBridgeConfig {
  const discordToken = requireEnv(env, "DISCORD_TOKEN");
  const applicationId = parseSnowflake(requireEnv(env, "DISCORD_APPLICATION_ID"), "DISCORD_APPLICATION_ID");
  const guildId = parseSnowflake(requireEnv(env, "DISCORD_GUILD_ID"), "DISCORD_GUILD_ID");
  const allowedUserIds = parseAllowedSnowflakes(requireEnv(env, "DISCORD_ALLOWED_USER_IDS"), "DISCORD_ALLOWED_USER_IDS");
  const channelMappings = parseChannelMappings(requireEnv(env, "DISCORD_CHANNEL_MAPPINGS_JSON"));
  const workers = parseWorkers(requireEnv(env, "DISCORD_WORKERS_JSON"));
  const defaultWorkerId = parseDefaultWorkerId(optionalEnv(env, "DISCORD_DEFAULT_WORKER_ID"), workers);
  const workerTimeoutMs = parsePositiveInteger(
    optionalEnv(env, "DISCORD_WORKER_TIMEOUT_MS"),
    120_000,
    "DISCORD_WORKER_TIMEOUT_MS",
  );

  const workerIds = new Set(workers.map((worker) => worker.id));
  for (const mapping of channelMappings) {
    if (!workerIds.has(mapping.workerId)) {
      throw new Error(`Unknown workerId in DISCORD_CHANNEL_MAPPINGS_JSON for channel ${mapping.channelId}: ${mapping.workerId}`);
    }
  }

  return {
    discordToken,
    applicationId,
    guildId,
    allowedUserIds,
    allowedUserIdSet: new Set(allowedUserIds),
    channelMappings,
    channelMappingById: new Map(channelMappings.map((mapping) => [mapping.channelId, mapping])),
    workers,
    defaultWorkerId,
    workerTimeoutMs,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = optionalEnv(env, name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseSnowflake(value: string, name: string): string {
  if (!/^[1-9]\d{16,20}$/.test(value)) {
    throw new Error(`Invalid Discord snowflake in ${name}: ${value}`);
  }
  return value;
}

function parseAllowedSnowflakes(raw: string, name: string): string[] {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseSnowflake(value, name));

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one Discord user ID`);
  }

  return values;
}

function parseChannelMappings(raw: string): DiscordChannelMapping[] {
  const parsed = parseJsonArray(raw, "DISCORD_CHANNEL_MAPPINGS_JSON");
  const seen = new Set<string>();

  return parsed.map((entry, index) => {
    const record = requireRecord(entry, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}]`);
    const channelId = parseSnowflake(requireString(record.channelId, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].channelId`), `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].channelId`);
    const workspace = requireString(record.workspace, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].workspace`);
    const workerId = requireString(record.workerId, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].workerId`);

    if (seen.has(channelId)) {
      throw new Error(`Duplicate channelId in DISCORD_CHANNEL_MAPPINGS_JSON: ${channelId}`);
    }
    seen.add(channelId);

    return { channelId, workspace, workerId };
  });
}

function parseWorkers(raw: string): WorkerTarget[] {
  const parsed = parseJsonArray(raw, "DISCORD_WORKERS_JSON");
  const seen = new Set<string>();

  const workers = parsed.map((entry, index) => {
    const record = requireRecord(entry, `DISCORD_WORKERS_JSON[${index}]`);
    const id = requireString(record.id, `DISCORD_WORKERS_JSON[${index}].id`);
    const label = requireString(record.label, `DISCORD_WORKERS_JSON[${index}].label`);
    const baseUrl = requireString(record.baseUrl, `DISCORD_WORKERS_JSON[${index}].baseUrl`);
    const sharedSecret = optionalString(record.sharedSecret);

    if (seen.has(id)) {
      throw new Error(`Duplicate worker id in DISCORD_WORKERS_JSON: ${id}`);
    }
    seen.add(id);

    return sharedSecret ? { id, label, baseUrl, sharedSecret } : { id, label, baseUrl };
  });

  if (workers.length === 0) {
    throw new Error("DISCORD_WORKERS_JSON must contain at least one worker");
  }

  return workers;
}

function parseDefaultWorkerId(raw: string | undefined, workers: WorkerTarget[]): string {
  const value = raw ?? workers[0]?.id;
  if (!value) {
    throw new Error("DISCORD_DEFAULT_WORKER_ID is required when no workers are configured");
  }

  if (!workers.some((worker) => worker.id === value)) {
    throw new Error(`Unknown DISCORD_DEFAULT_WORKER_ID: ${value}`);
  }

  return value;
}

function parsePositiveInteger(raw: string | undefined, defaultValue: number, name: string): number {
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  return parsed;
}

function parseJsonArray(raw: string, name: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${name}: expected a JSON array`);
  }
  return parsed;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${name}: expected a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim();
}
