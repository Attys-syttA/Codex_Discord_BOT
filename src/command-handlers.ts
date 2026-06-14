import type { DiscordBridgeConfig, DiscordChannelMapping, WorkerTarget } from "./config.js";
import {
  contextKeyFromIds,
  resolveProjectChannelId,
  type DiscordContextKey,
} from "./discord-context.js";
import type { SessionMetadata, SessionRegistry } from "./session-registry.js";
import { WorkerClient } from "./worker-client.js";

export interface BridgeCommandInput {
  commandName: string;
  guildId: string;
  channelId: string;
  parentId?: string | null;
  isThread: boolean;
  userId: string;
  memberRoleIds: string[];
  options?: Record<string, string | undefined>;
}

export interface BridgeCommandResponse {
  content: string;
  ephemeral: boolean;
}

export interface BridgeCommandDeps {
  config: DiscordBridgeConfig;
  sessions: SessionRegistry;
  createWorkerClient?: (worker: WorkerTarget) => Pick<WorkerClient, "getHealth" | "abort">;
}

interface ResolvedContext {
  contextKey: DiscordContextKey;
  projectChannelId: string;
  mapping: DiscordChannelMapping;
  worker: WorkerTarget;
}

export async function handleBridgeCommand(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
): Promise<BridgeCommandResponse> {
  if (input.guildId !== deps.config.guildId) {
    return response(`This bot is not enabled for guild ${input.guildId}.`);
  }

  if (!isAllowed(input, deps.config)) {
    return response("You are not allowed to use this bridge.");
  }

  const resolved = resolveContext(input, deps.config);
  if (!resolved) {
    return response("This channel is not mapped to a workspace.");
  }

  switch (input.commandName) {
    case "doctor":
      return response(await renderDoctor(input, deps, resolved));
    case "session":
      return response(renderSession(deps.sessions.get(resolved.contextKey), resolved));
    case "workers":
      return response(renderWorkers(deps.config, resolved.worker.id));
    case "new":
      return response(renderNewSession(deps.sessions.upsert(createBaseSession(input, resolved))));
    case "attach":
      return response(renderAttach(input, deps, resolved));
    case "handoff":
      return response(renderHandoff(deps.sessions.get(resolved.contextKey), resolved));
    case "abort":
      return response(await renderAbort(deps, resolved));
    default:
      return response(`Unknown command: ${input.commandName}`);
  }
}

function isAllowed(input: BridgeCommandInput, config: DiscordBridgeConfig): boolean {
  if (config.allowedUserIdSet.has(input.userId)) {
    return true;
  }

  return input.memberRoleIds.some((roleId) => config.allowedRoleIdSet.has(roleId));
}

function resolveContext(input: BridgeCommandInput, config: DiscordBridgeConfig): ResolvedContext | undefined {
  const projectChannelId = resolveProjectChannelId({
    channelId: input.channelId,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    isThread: input.isThread,
  });
  const mapping = config.channelMappingById.get(projectChannelId);
  if (!mapping) {
    return undefined;
  }

  const worker = config.workers.find((candidate) => candidate.id === mapping.workerId);
  if (!worker) {
    throw new Error(`Mapped worker is missing from config: ${mapping.workerId}`);
  }

  const contextKey = contextKeyFromIds(
    input.guildId,
    projectChannelId,
    input.isThread ? input.channelId : undefined,
  );

  return { contextKey, projectChannelId, mapping, worker };
}

async function renderDoctor(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
): Promise<string> {
  const client = deps.createWorkerClient?.(resolved.worker) ?? new WorkerClient({
    worker: resolved.worker,
    timeoutMs: deps.config.workerTimeoutMs,
  });
  let workerStatus = "unreachable";
  try {
    const health = await client.getHealth();
    workerStatus = String(health.mode ?? "reachable");
  } catch (error) {
    workerStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  return [
    "Codex Discord bridge doctor",
    `Guild: ${input.guildId}`,
    `Context: ${resolved.contextKey}`,
    `Project channel: ${resolved.projectChannelId}`,
    `Workspace: ${resolved.mapping.workspace}`,
    `Worker: ${resolved.worker.label} (${resolved.worker.baseUrl})`,
    `Worker health: ${workerStatus}`,
    `Known sessions: ${deps.sessions.list().length}`,
  ].join("\n");
}

function renderSession(metadata: SessionMetadata | undefined, resolved: ResolvedContext): string {
  if (!metadata) {
    return [
      "No active session for this Discord context yet.",
      `Context: ${resolved.contextKey}`,
      `Workspace: ${resolved.mapping.workspace}`,
      "Use /new to create a session placeholder or /attach to bind an existing Codex thread.",
    ].join("\n");
  }

  return [
    "Current session",
    `Context: ${metadata.contextKey}`,
    `Workspace: ${metadata.workspace}`,
    `Worker: ${metadata.workerId}`,
    `Worker session ID: ${metadata.workerSessionId ?? "(not created yet)"}`,
    `Codex thread ID: ${metadata.codexThreadId ?? "(not attached yet)"}`,
    `Updated: ${metadata.updatedAt}`,
  ].join("\n");
}

function renderWorkers(config: DiscordBridgeConfig, activeWorkerId: string): string {
  return [
    "Configured workers",
    ...config.workers.map((worker) =>
      `${worker.id === activeWorkerId ? "*" : "-"} ${worker.id}: ${worker.label} (${worker.baseUrl})`,
    ),
  ].join("\n");
}

function createBaseSession(input: BridgeCommandInput, resolved: ResolvedContext): Omit<SessionMetadata, "updatedAt"> {
  return {
    contextKey: resolved.contextKey,
    projectChannelId: resolved.projectChannelId,
    ...(input.isThread ? { threadId: input.channelId } : {}),
    workspace: resolved.mapping.workspace,
    workerId: resolved.worker.id,
  };
}

function renderNewSession(metadata: SessionMetadata): string {
  return [
    "Session placeholder created.",
    `Context: ${metadata.contextKey}`,
    `Workspace: ${metadata.workspace}`,
    `Worker: ${metadata.workerId}`,
    "Worker session creation will be wired in the next integration slice.",
  ].join("\n");
}

function renderAttach(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
): string {
  const threadId = input.options?.thread_id?.trim();
  if (!threadId) {
    return "Missing required option: thread_id";
  }

  if (!deps.sessions.get(resolved.contextKey)) {
    deps.sessions.upsert(createBaseSession(input, resolved));
  }
  const metadata = deps.sessions.attachThread(resolved.contextKey, threadId);
  return [
    "Codex thread attached.",
    `Context: ${metadata.contextKey}`,
    `Codex thread ID: ${metadata.codexThreadId}`,
  ].join("\n");
}

function renderHandoff(metadata: SessionMetadata | undefined, resolved: ResolvedContext): string {
  const threadId = metadata?.codexThreadId;
  if (!threadId) {
    return [
      "No Codex thread is attached to this context yet.",
      `Context: ${resolved.contextKey}`,
      "Use /attach <thread_id> after creating or resuming a Codex thread.",
    ].join("\n");
  }

  return [
    "Handoff",
    `Workspace: ${metadata.workspace}`,
    `Codex thread ID: ${threadId}`,
    `Resume command: cd ${metadata.workspace} && codex resume ${threadId}`,
  ].join("\n");
}

async function renderAbort(deps: BridgeCommandDeps, resolved: ResolvedContext): Promise<string> {
  const metadata = deps.sessions.get(resolved.contextKey);
  if (!metadata?.workerSessionId) {
    return "No active worker session is recorded for this context yet.";
  }

  const client = deps.createWorkerClient?.(resolved.worker) ?? new WorkerClient({
    worker: resolved.worker,
    timeoutMs: deps.config.workerTimeoutMs,
  });
  await client.abort(metadata.workerSessionId);
  return `Abort requested for worker session ${metadata.workerSessionId}.`;
}

function response(content: string): BridgeCommandResponse {
  return { content, ephemeral: true };
}
