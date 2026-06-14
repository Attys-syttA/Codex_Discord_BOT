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
  channelName?: string;
  parentId?: string | null;
  parentName?: string;
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
  createWorkerClient?: (worker: WorkerTarget) => BridgeWorkerClient;
}

export type BridgeWorkerClient = Pick<
  WorkerClient,
  "getHealth" | "createSession" | "getSessionInfo" | "newThread" | "resumeThread" | "abort" | "prompt"
>;

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
      return response(await renderSession(deps, resolved));
    case "workers":
      return response(renderWorkers(deps.config, resolved.worker.id));
    case "new":
      return response(await renderNewSession(input, deps, resolved));
    case "attach":
      return response(await renderAttach(input, deps, resolved));
    case "ask":
      return response(await renderAsk(input, deps, resolved));
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
  const mapping = config.channelMappingById.get(projectChannelId) ?? resolveAutoWorkspaceMapping(
    input,
    config,
    projectChannelId,
  );
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

function resolveAutoWorkspaceMapping(
  input: BridgeCommandInput,
  config: DiscordBridgeConfig,
  projectChannelId: string,
): DiscordChannelMapping | undefined {
  if (!config.autoWorkspaceRoot) {
    return undefined;
  }

  const projectName = (input.isThread ? input.parentName : input.channelName)?.trim();
  if (!projectName) {
    return undefined;
  }

  return {
    channelId: projectChannelId,
    workspace: joinWorkspacePath(config.autoWorkspaceRoot, projectName),
    workerId: config.defaultWorkerId,
  };
}

function joinWorkspacePath(root: string, projectName: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  const separator = /^[A-Za-z]:[\\/]/.test(normalizedRoot) || normalizedRoot.includes("\\") ? "\\" : "/";
  return `${normalizedRoot}${separator}${projectName}`;
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

async function renderSession(deps: BridgeCommandDeps, resolved: ResolvedContext): Promise<string> {
  const metadata = deps.sessions.get(resolved.contextKey);
  if (!metadata) {
    return [
      "No active session for this Discord context yet.",
      `Context: ${resolved.contextKey}`,
      `Workspace: ${resolved.mapping.workspace}`,
      "Use /new to create a session placeholder or /attach to bind an existing Codex thread.",
    ].join("\n");
  }

  const live = await refreshSessionInfo(deps, resolved, metadata);

  return [
    "Current session",
    `Context: ${metadata.contextKey}`,
    `Workspace: ${live.metadata.workspace}`,
    `Worker: ${metadata.workerId}`,
    `Worker session ID: ${live.metadata.workerSessionId ?? "(not created yet)"}`,
    `Codex thread ID: ${live.metadata.codexThreadId ?? "(not attached yet)"}`,
    `Worker status: ${live.status}`,
    `Updated: ${live.metadata.updatedAt}`,
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

async function renderNewSession(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
): Promise<string> {
  const client = createClient(deps, resolved.worker);
  const created = await client.createSession({ workspace: resolved.mapping.workspace });
  const info = await client.newThread(created.sessionId, { workspace: resolved.mapping.workspace });
  const metadata = deps.sessions.upsert({
    ...createBaseSession(input, resolved),
    workerSessionId: created.sessionId,
    ...(info.threadId ? { codexThreadId: info.threadId } : {}),
    workspace: info.workspace || resolved.mapping.workspace,
  });

  return [
    "Worker session created.",
    `Context: ${metadata.contextKey}`,
    `Workspace: ${metadata.workspace}`,
    `Worker: ${metadata.workerId}`,
    `Worker session ID: ${metadata.workerSessionId}`,
    `Codex thread ID: ${metadata.codexThreadId ?? "(worker did not return one yet)"}`,
  ].join("\n");
}

async function renderAttach(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
): Promise<string> {
  const threadId = input.options?.thread_id?.trim();
  if (!threadId) {
    return "Missing required option: thread_id";
  }

  const current = deps.sessions.get(resolved.contextKey);
  const client = createClient(deps, resolved.worker);
  const workerSessionId = current?.workerSessionId ?? (await client.createSession({ workspace: resolved.mapping.workspace })).sessionId;
  const info = await client.resumeThread(workerSessionId, threadId);
  const metadata = deps.sessions.upsert({
    ...createBaseSession(input, resolved),
    workerSessionId,
    codexThreadId: info.threadId ?? threadId,
    workspace: info.workspace || resolved.mapping.workspace,
  });

  return [
    "Codex thread attached through worker.",
    `Context: ${metadata.contextKey}`,
    `Worker session ID: ${metadata.workerSessionId}`,
    `Codex thread ID: ${metadata.codexThreadId}`,
  ].join("\n");
}

async function renderAsk(
  input: BridgeCommandInput,
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
): Promise<string> {
  const prompt = input.options?.prompt?.trim();
  if (!prompt) {
    return "Missing required option: prompt";
  }

  const metadata = deps.sessions.get(resolved.contextKey);
  if (!metadata?.workerSessionId) {
    return "No active worker session is recorded for this context yet. Use /new or /attach first.";
  }

  const textParts: string[] = [];
  let toolStarts = 0;
  let toolFailures = 0;
  let usage: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number } | undefined;

  try {
    await createClient(deps, resolved.worker).prompt(
      metadata.workerSessionId,
      {
        policyPreamble: [
          "For repository status questions, prefer the current status and next steps in docs/STATE.md.",
          "Treat older append-only docs/CHANGELOG.dev.md follow-up lines as historical notes that may have already been completed.",
        ].join("\n"),
        text: prompt,
      },
      {
        onTextDelta: (delta) => textParts.push(delta),
        onToolStart: () => {
          toolStarts += 1;
        },
        onToolEnd: (_toolCallId, isError) => {
          if (isError) {
            toolFailures += 1;
          }
        },
        onTurnComplete: (nextUsage) => {
          usage = nextUsage;
        },
      },
    );
  } catch (error) {
    return `Codex prompt failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const answer = textParts.join("").trim() || "(no text returned)";
  const lines = [
    "Codex response",
    truncateDiscordMessage(answer, 1_500),
  ];

  if (toolStarts > 0) {
    lines.push(`Tools: ${toolStarts} tool event${toolStarts === 1 ? "" : "s"}, ${toolFailures} failed`);
  }

  if (usage) {
    lines.push(`Tokens: in ${usage.inputTokens ?? "?"}, cached ${usage.cachedInputTokens ?? "?"}, out ${usage.outputTokens ?? "?"}`);
  }

  return truncateDiscordMessage(lines.join("\n"), 1_950);
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

  const client = createClient(deps, resolved.worker);
  await client.abort(metadata.workerSessionId);
  return `Abort requested for worker session ${metadata.workerSessionId}.`;
}

function response(content: string): BridgeCommandResponse {
  return { content, ephemeral: true };
}

async function refreshSessionInfo(
  deps: BridgeCommandDeps,
  resolved: ResolvedContext,
  metadata: SessionMetadata,
): Promise<{ metadata: SessionMetadata; status: string }> {
  if (!metadata.workerSessionId) {
    return { metadata, status: "not created yet" };
  }

  try {
    const info = await createClient(deps, resolved.worker).getSessionInfo(metadata.workerSessionId);
    const next = deps.sessions.upsert({
      ...metadata,
      workspace: info.workspace || metadata.workspace,
      ...(info.threadId ? { codexThreadId: info.threadId } : {}),
    });
    return { metadata: next, status: "reachable" };
  } catch (error) {
    return {
      metadata,
      status: `error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function createClient(deps: BridgeCommandDeps, worker: WorkerTarget): BridgeWorkerClient {
  return deps.createWorkerClient?.(worker) ?? new WorkerClient({
    worker,
    timeoutMs: deps.config.workerTimeoutMs,
  });
}

function truncateDiscordMessage(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 14)).trimEnd()}\n[truncated]`;
}
