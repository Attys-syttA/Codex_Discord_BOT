import path from "node:path";

export interface WorkerTarget {
  id: string;
  label: string;
  baseUrl: string;
  sharedSecret?: string;
  workspaceRoot?: string;
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
  allowedRoleIds: string[];
  allowedRoleIdSet: Set<string>;
  channelMappings: DiscordChannelMapping[];
  channelMappingById: Map<string, DiscordChannelMapping>;
  workers: WorkerTarget[];
  defaultWorkerId: string;
  autoWorkspaceRoot?: string;
  autoWorkspaceAliases: Map<string, string>;
  ephemeralResponses: boolean;
  workerTimeoutMs: number;
  sessionStorePath: string;
}

export interface LoadConfigOptions {
  configDir?: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): DiscordBridgeConfig {
  const configDir = normalizePath(options.configDir ?? process.cwd());
  const inferredWorkspaceRoot = dirnamePortable(configDir);
  const discordToken = requireEnv(env, "DISCORD_TOKEN");
  const applicationId = parseSnowflake(requireEnv(env, "DISCORD_APPLICATION_ID"), "DISCORD_APPLICATION_ID");
  const guildId = parseSnowflake(requireEnv(env, "DISCORD_GUILD_ID"), "DISCORD_GUILD_ID");
  const allowedUserIds = parseAllowedSnowflakes(requireEnv(env, "DISCORD_ALLOWED_USER_IDS"), "DISCORD_ALLOWED_USER_IDS");
  const allowedRoleIds = parseOptionalSnowflakes(optionalEnv(env, "DISCORD_ALLOWED_ROLE_IDS"), "DISCORD_ALLOWED_ROLE_IDS");
  const workers = parseWorkers(requireEnv(env, "DISCORD_WORKERS_JSON"), configDir, env);
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const defaultWorkerId = parseDefaultWorkerId(optionalEnv(env, "DISCORD_DEFAULT_WORKER_ID"), workers);
  const autoWorkspaceRoot = resolvePortablePath(optionalEnv(env, "DISCORD_AUTO_WORKSPACE_ROOT"), configDir);
  const channelMappings = parseChannelMappings(requireEnv(env, "DISCORD_CHANNEL_MAPPINGS_JSON"), configDir, workerById);
  const autoWorkspaceAliases = parseAutoWorkspaceAliases(optionalEnv(env, "DISCORD_AUTO_WORKSPACE_ALIASES_JSON"));
  const ephemeralResponses = parseBoolean(optionalEnv(env, "DISCORD_EPHEMERAL_RESPONSES"), true, "DISCORD_EPHEMERAL_RESPONSES");
  const workerTimeoutMs = parsePositiveInteger(
    optionalEnv(env, "DISCORD_WORKER_TIMEOUT_MS"),
    120_000,
    "DISCORD_WORKER_TIMEOUT_MS",
  );
  const sessionStorePath = optionalEnv(env, "DISCORD_SESSION_STORE_PATH") ?? ".discord-bot-state/sessions.json";

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
    allowedRoleIds,
    allowedRoleIdSet: new Set(allowedRoleIds),
    channelMappings,
    channelMappingById: new Map(channelMappings.map((mapping) => [mapping.channelId, mapping])),
    workers,
    defaultWorkerId,
    ...(autoWorkspaceRoot ? { autoWorkspaceRoot } : {}),
    autoWorkspaceAliases,
    ephemeralResponses,
    workerTimeoutMs,
    sessionStorePath,
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

function parseOptionalSnowflakes(raw: string | undefined, name: string): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseSnowflake(value, name));
}

function parseChannelMappings(
  raw: string,
  workspaceBaseDir: string,
  workerById: Map<string, WorkerTarget>,
): DiscordChannelMapping[] {
  const parsed = parseJsonArray(raw, "DISCORD_CHANNEL_MAPPINGS_JSON");
  const seen = new Set<string>();

  return parsed.map((entry, index) => {
    const record = requireRecord(entry, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}]`);
    const channelId = parseSnowflake(requireString(record.channelId, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].channelId`), `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].channelId`);
    const workerId = requireString(record.workerId, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].workerId`);
    const workerWorkspaceBaseDir = workerById.get(workerId)?.workspaceRoot ?? workspaceBaseDir;
    const workspace = resolvePortablePath(
      requireString(record.workspace, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].workspace`),
      workerWorkspaceBaseDir,
    ) ?? requireString(record.workspace, `DISCORD_CHANNEL_MAPPINGS_JSON[${index}].workspace`);

    if (seen.has(channelId)) {
      throw new Error(`Duplicate channelId in DISCORD_CHANNEL_MAPPINGS_JSON: ${channelId}`);
    }
    seen.add(channelId);

    return { channelId, workspace, workerId };
  });
}

function parseWorkers(raw: string, configDir: string, env: NodeJS.ProcessEnv): WorkerTarget[] {
  const parsed = parseJsonArray(raw, "DISCORD_WORKERS_JSON");
  const seen = new Set<string>();

  const workers = parsed.map((entry, index) => {
    const record = requireRecord(entry, `DISCORD_WORKERS_JSON[${index}]`);
    const id = requireString(record.id, `DISCORD_WORKERS_JSON[${index}].id`);
    const label = requireString(record.label, `DISCORD_WORKERS_JSON[${index}].label`);
    const baseUrl = requireString(record.baseUrl, `DISCORD_WORKERS_JSON[${index}].baseUrl`);
    const sharedSecret = optionalString(record.sharedSecret);
    const sharedSecretEnv = optionalString(record.sharedSecretEnv);
    const workspaceRoot = optionalString(record.workspaceRoot);

    if (seen.has(id)) {
      throw new Error(`Duplicate worker id in DISCORD_WORKERS_JSON: ${id}`);
    }
    seen.add(id);

    const resolvedSharedSecret = sharedSecretEnv
      ? requireEnv(env, sharedSecretEnv)
      : sharedSecret;
    const resolvedWorkspaceRoot = resolvePortablePath(workspaceRoot, configDir);

    return {
      id,
      label,
      baseUrl,
      ...(resolvedSharedSecret ? { sharedSecret: resolvedSharedSecret } : {}),
      ...(resolvedWorkspaceRoot ? { workspaceRoot: resolvedWorkspaceRoot } : {}),
    };
  });

  if (workers.length === 0) {
    throw new Error("DISCORD_WORKERS_JSON must contain at least one worker");
  }

  return workers;
}

function parseAutoWorkspaceAliases(raw: string | undefined): Map<string, string> {
  if (!raw) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid DISCORD_AUTO_WORKSPACE_ALIASES_JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const record = requireRecord(parsed, "DISCORD_AUTO_WORKSPACE_ALIASES_JSON");
  const aliases = new Map<string, string>();
  for (const [sourceName, targetName] of Object.entries(record)) {
    const source = sourceName.trim();
    const target = requireString(targetName, `DISCORD_AUTO_WORKSPACE_ALIASES_JSON.${sourceName}`);
    if (!source) {
      throw new Error("Invalid DISCORD_AUTO_WORKSPACE_ALIASES_JSON: alias keys must be non-empty");
    }
    aliases.set(normalizeWorkspaceAliasKey(source), target);
  }

  return aliases;
}

function normalizeWorkspaceAliasKey(value: string): string {
  return value.trim().toLowerCase();
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

function parseBoolean(raw: string | undefined, defaultValue: boolean, name: string): boolean {
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${name}: expected true or false`);
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

function resolvePortablePath(raw: string | undefined, baseDir: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const value = raw.trim();
  if (!value) {
    return undefined;
  }

  const pathModule = getPathModule(value, baseDir);
  return normalizePath(pathModule.isAbsolute(value) ? value : pathModule.resolve(baseDir, value));
}

function dirnamePortable(value: string): string {
  return normalizePath(getPathModule(value).dirname(value));
}

function normalizePath(value: string): string {
  return getPathModule(value).normalize(value);
}

function getPathModule(...values: string[]): typeof path.win32 | typeof path.posix {
  return values.some(isWindowsLikePath) ? path.win32 : path.posix;
}

function isWindowsLikePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.includes("\\");
}
