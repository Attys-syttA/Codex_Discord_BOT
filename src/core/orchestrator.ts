import type { DiscordBridgeConfig, DiscordChannelMapping, WorkerTarget } from "../config.js";
import type { SqliteStateStore } from "../db/sqlite-store.js";
import { contextKeyFromIds, resolveProjectChannelId, type DiscordContextKey } from "../discord-context.js";
import { isAllowedUser } from "../security/access.js";
import { WorkerClient, type WorkerNamedCheckResult, type WorkerRepoStatus, type WorkerSessionInfo } from "../worker/worker-client.js";
import type { ApprovalKind, ApprovalRequest, PromptResult, QueueItem, SessionRecord, ThreadBinding } from "./types.js";

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

export interface BridgeMessageInput {
  guildId: string;
  channelId: string;
  channelName?: string;
  parentId?: string | null;
  parentName?: string;
  isThread: boolean;
  userId: string;
  memberRoleIds: string[];
  messageId: string;
  text: string;
}

export interface BridgeCommandResponse {
  content: string;
  followUpContents: string[];
  ephemeral: boolean;
}

export interface PromptDelivery {
  responseParts: string[];
  queued: boolean;
  queuePosition?: number;
  approvalRequest?: ApprovalRequest;
}

export interface BridgeOrchestratorOptions {
  config: DiscordBridgeConfig;
  store: SqliteStateStore;
  createWorkerClient?: (worker: WorkerTarget) => BridgeWorkerClient;
}

export type BridgeWorkerClient = Pick<
  WorkerClient,
  | "abort"
  | "createSession"
  | "getHealth"
  | "getLastResponse"
  | "getRepoStatus"
  | "getSessionInfo"
  | "getSessionStatus"
  | "listSessions"
  | "newThread"
  | "prompt"
  | "resumeThread"
  | "runNamedCheck"
  | "submitApprovalDecision"
>;

interface ResolvedContext {
  guildId: string;
  contextKey: DiscordContextKey;
  projectChannelId: string;
  mapping: DiscordChannelMapping;
  worker: WorkerTarget;
  threadBinding?: ThreadBinding;
}

interface WorkerReachability {
  ok: boolean;
  summary: string;
}

export class BridgeOrchestrator {
  private readonly activeContexts = new Set<DiscordContextKey>();

  constructor(private readonly options: BridgeOrchestratorOptions) {}

  async handleCommand(input: BridgeCommandInput): Promise<BridgeCommandResponse> {
    if (input.guildId !== this.options.config.guildId) {
      return response(`This bot is not enabled for guild ${input.guildId}.`);
    }

    if (!isAllowedUser(input, this.options.config)) {
      return response("You are not allowed to use this bridge.");
    }

    const resolved = this.resolveContext(input);
    const commandName = normalizeCommandName(input.commandName);
    await this.expireApprovalsForContext(resolved?.contextKey);

    if (!resolved && !["register-workspace", "workers", "doctor"].includes(commandName)) {
      return response("This channel is not mapped to a workspace.");
    }

    switch (commandName) {
      case "doctor":
        return response(await this.renderDoctor(input, resolved));
      case "status":
        return response(await this.renderStatus(input, resolved));
      case "session":
        return response(await this.renderSession(resolved!));
      case "session-new":
        return response(await this.renderNewSession(input, resolved!));
      case "session-resume":
        return response(await this.renderAttach(input, resolved!));
      case "session-stop":
        return response(await this.renderAbort(resolved!));
      case "sessions":
        return response(await this.renderSessions(resolved!));
      case "last":
        return response(await this.renderLastResponse(resolved!));
      case "workers":
        return response(await this.renderWorkers(resolved?.worker.id));
      case "worker-bind":
        return response(await this.renderWorkerBind(input, resolved));
      case "register-workspace":
        return response(await this.renderRegisterWorkspace(input));
      case "unregister-workspace":
        return response(this.renderUnregisterWorkspace(resolved!));
      case "queue":
        return response(this.renderQueue(input, resolved!));
      case "auto-approve":
        return response(this.renderAutoApprove(input, resolved!));
      case "git-status":
        return response(await this.renderGitStatus(resolved!));
      case "run-tests":
        return response(await this.renderRunTests(resolved!));
      case "handoff":
        return response(this.renderHandoff(resolved!));
      case "ask":
        return responseParts(await this.runPromptCommand(input, resolved!));
      default:
        return response(`Unknown command: ${input.commandName}`);
    }
  }

  async handleMessage(input: BridgeMessageInput): Promise<PromptDelivery | undefined> {
    if (!this.options.config.enableMessagePrompts) {
      return undefined;
    }

    if (input.guildId !== this.options.config.guildId || !isAllowedUser(input, this.options.config)) {
      return undefined;
    }

    const resolved = this.resolveContext(input);
    if (!resolved) {
      return undefined;
    }

    const explicitBinding = this.options.store.getChannelBinding(input.guildId, resolved.projectChannelId);
    if (explicitBinding && !explicitBinding.autoPromptEnabled) {
      return undefined;
    }

    return this.sendPromptToContext(resolved, input.userId, input.messageId, input.text);
  }

  async handleApprovalDecision(
    requestId: number,
    approved: boolean,
    actorDiscordUserId: string,
    applyToChannel: boolean,
  ): Promise<string> {
    await this.expireApprovalsForContext();
    const request = this.options.store.getApprovalRequest(requestId);
    if (!request) {
      return `Approval request ${requestId} was not found.`;
    }
    if (request.status !== "pending") {
      this.options.store.appendAuditLog({
        contextKey: request.contextKey,
        actorDiscordUserId,
        action: "approval_decision_rejected",
        result: request.status,
        detailJson: JSON.stringify({ requestId, approved, applyToChannel }),
      });
      return `Approval request ${requestId} is already ${request.status}.`;
    }

    const session = this.options.store.getSession(request.contextKey);
    if (session?.workerSessionId) {
      const client = this.createClient(this.requireWorker(session.workerId));
      try {
        await client.submitApprovalDecision(session.workerSessionId, {
          approvalId: String(requestId),
          approved,
          scope: applyToChannel ? "channel" : "once",
        });
        this.options.store.appendAuditLog({
          contextKey: request.contextKey,
          actorDiscordUserId,
          action: "approval_forward",
          result: "success",
          detailJson: JSON.stringify({ requestId, approved, applyToChannel }),
        });
      } catch (error) {
        this.options.store.appendAuditLog({
          contextKey: request.contextKey,
          actorDiscordUserId,
          action: "approval_forward",
          result: "error",
          detailJson: JSON.stringify({ requestId, approved, applyToChannel, error: formatError(error) }),
        });
        return `Approval decision could not be forwarded to the worker: ${formatError(error)}`;
      }
    }

    const status = approved ? (applyToChannel ? "auto_approved" : "approved") : "denied";
    this.options.store.resolveApprovalRequest(requestId, status, actorDiscordUserId);
    this.options.store.appendAuditLog({
      contextKey: request.contextKey,
      actorDiscordUserId,
      action: approved ? "approval_approved" : "approval_denied",
      result: status,
      detailJson: JSON.stringify({ requestId, applyToChannel }),
    });

    let cancelledQueueItems = 0;
    const sessionAfter = session ? this.options.store.upsertSession({
      ...session,
      status: "idle",
      lastActivityAt: new Date().toISOString(),
    }) : undefined;

    if (approved && applyToChannel && sessionAfter) {
      const binding = this.options.store.getChannelBinding(sessionAfter.guildId, sessionAfter.channelId)
        ?? {
          guildId: sessionAfter.guildId,
          channelId: sessionAfter.channelId,
          workspace: sessionAfter.workspace,
          workerId: sessionAfter.workerId,
          autoPromptEnabled: true,
          autoApproveMode: "off" as const,
        };
      this.options.store.upsertChannelBinding({
        ...binding,
        autoApproveMode: "on",
      });
      this.options.store.appendAuditLog({
        contextKey: request.contextKey,
        actorDiscordUserId,
        action: "auto_approve_mode",
        result: "on",
        detailJson: JSON.stringify({ requestId }),
      });
    }

    if (!approved) {
      cancelledQueueItems = this.options.store.clearQueue(request.contextKey);
      this.options.store.appendAuditLog({
        contextKey: request.contextKey,
        actorDiscordUserId,
        action: "approval_queue_cancelled",
        result: String(cancelledQueueItems),
        detailJson: JSON.stringify({ requestId, cancelledQueueItems }),
      });
    }

    if (approved && sessionAfter && sessionAfter.status !== "waiting_approval") {
      await this.drainQueueForStoredSession(sessionAfter);
    }

    return approved
      ? `Approval ${requestId} approved${applyToChannel ? " and auto-approve was enabled for this channel." : "."}`
      : [
        `Approval ${requestId} denied.`,
        `Queued prompts cancelled: ${cancelledQueueItems}.`,
        "Retry with a new explicit prompt when you want to continue.",
      ].join("\n");
  }

  attachApprovalMessage(requestId: number, discordMessageId: string): ApprovalRequest | undefined {
    return this.options.store.updateApprovalRequestMessageId(requestId, discordMessageId);
  }

  private resolveContext(input: {
    guildId: string;
    channelId: string;
    parentId?: string | null;
    parentName?: string;
    channelName?: string;
    isThread: boolean;
  }): ResolvedContext | undefined {
    const projectChannelId = resolveProjectChannelId({
      channelId: input.channelId,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      isThread: input.isThread,
    });

    const explicitBinding = this.options.store.getChannelBinding(input.guildId, projectChannelId);
    const mapping = explicitBinding
      ? { channelId: projectChannelId, workspace: explicitBinding.workspace, workerId: explicitBinding.workerId }
      : this.options.config.channelMappingById.get(projectChannelId)
        ?? this.resolveAutoWorkspaceMapping(input, projectChannelId);
    if (!mapping) {
      return undefined;
    }

    const worker = this.options.config.workers.find((candidate) => candidate.id === mapping.workerId);
    if (!worker) {
      throw new Error(`Mapped worker is missing from config: ${mapping.workerId}`);
    }

    const contextKey = contextKeyFromIds(
      input.guildId,
      projectChannelId,
      input.isThread ? input.channelId : undefined,
    );

    const threadBinding = input.isThread
      ? this.options.store.upsertThreadBinding({
          guildId: input.guildId,
          parentChannelId: projectChannelId,
          threadId: input.channelId,
          sessionMode: "thread",
          ...(input.channelName ? { displayName: input.channelName } : {}),
        })
      : undefined;

    return { guildId: input.guildId, contextKey, projectChannelId, mapping, worker, ...(threadBinding ? { threadBinding } : {}) };
  }

  private resolveAutoWorkspaceMapping(
    input: { channelName?: string; parentName?: string; isThread: boolean },
    projectChannelId: string,
  ): DiscordChannelMapping | undefined {
    const worker = this.options.config.workers.find((candidate) => candidate.id === this.options.config.defaultWorkerId);
    if (!worker) {
      throw new Error(`Default worker is missing from config: ${this.options.config.defaultWorkerId}`);
    }

    const workspaceRoot = worker.workspaceRoot ?? this.options.config.autoWorkspaceRoot;
    if (!workspaceRoot) {
      return undefined;
    }

    const rawProjectName = (input.isThread ? input.parentName : input.channelName)?.trim();
    if (!rawProjectName) {
      return undefined;
    }

    const projectName = this.options.config.autoWorkspaceAliases.get(rawProjectName.toLowerCase()) ?? rawProjectName;
    return {
      channelId: projectChannelId,
      workspace: joinWorkspacePath(workspaceRoot, projectName),
      workerId: worker.id,
    };
  }

  private async renderDoctor(
    input: BridgeCommandInput,
    resolved: ResolvedContext | undefined,
  ): Promise<string> {
    const mapping = resolved?.mapping;
    const queueCount = resolved ? this.options.store.countQueuedItems(resolved.contextKey) : 0;
    const session = resolved ? this.options.store.getSession(resolved.contextKey) : undefined;
    const pendingApprovals = resolved ? this.options.store.listPendingApprovals(resolved.contextKey).length : 0;
    const binding = resolved ? this.options.store.getChannelBinding(input.guildId, resolved.projectChannelId) : undefined;
    const localSessionCount = this.options.store.listSessions(input.guildId).length;

    let workerStatus = "unresolved";
    let workerSessionVisibility = "not checked";
    if (resolved) {
      workerStatus = (await this.probeWorkerReachability(resolved.worker)).summary;

      try {
        const workerSessions = await this.createClient(resolved.worker).listSessions();
        const workspaceVisibleCount = workerSessions.filter((workerSession) => {
          const workspace = workerSession.info?.workspace;
          return !workspace || workspace === resolved.mapping.workspace;
        }).length;
        workerSessionVisibility = `visible (${workspaceVisibleCount} for workspace)`;
      } catch (error) {
        workerSessionVisibility = `unavailable: ${formatError(error)}`;
      }
    }

    const configuredWorkers = await this.renderConfiguredWorkerLines(resolved?.worker.id);

    return [
      "Codex Discord bridge doctor",
      `Guild: ${input.guildId}`,
      `Context: ${resolved?.contextKey ?? "(not mapped)"}`,
      `Project channel: ${resolved?.projectChannelId ?? input.channelId}`,
      `Workspace: ${mapping?.workspace ?? "(not mapped)"}`,
      `Worker: ${resolved ? `${resolved.worker.label} (${resolved.worker.baseUrl})` : "(unresolved)"}`,
      `Worker health: ${workerStatus}`,
      `Worker session visibility: ${resolved ? workerSessionVisibility : "(not mapped)"}`,
      `Storage: SQLite @ ${this.options.config.databasePath}`,
      `Prompt mode: ${this.options.config.enableMessagePrompts ? "slash + normal messages" : "slash only"}`,
      `Queue length: ${queueCount}/${this.options.config.queueMaxItems}`,
      `Pending approvals: ${pendingApprovals}`,
      `Auto approve: ${binding?.autoApproveMode ?? "off"}`,
      `Session status: ${session?.status ?? "(none)"}`,
      `Local sessions: ${localSessionCount}`,
      "",
      "Configured workers",
      ...configuredWorkers,
    ].join("\n");
  }

  private async renderStatus(
    input: BridgeCommandInput,
    resolved: ResolvedContext | undefined,
  ): Promise<string> {
    if (!resolved) {
      return [
        "Context status",
        `Guild: ${input.guildId}`,
        `Channel: ${input.channelId}`,
        "Workspace: (not mapped)",
      ].join("\n");
    }

    const binding = this.options.store.getChannelBinding(input.guildId, resolved.projectChannelId);
    const session = this.options.store.getSession(resolved.contextKey);
    const queued = this.options.store.countQueuedItems(resolved.contextKey);
    return [
      "Context status",
      `Context: ${resolved.contextKey}`,
      `Workspace: ${resolved.mapping.workspace}`,
      `Worker: ${resolved.worker.id}`,
      `Prompt source: ${this.options.config.enableMessagePrompts ? "slash + normal messages" : "slash only"}`,
      `Auto prompts: ${binding?.autoPromptEnabled ?? true ? "enabled" : "disabled"}`,
      `Auto approve: ${binding?.autoApproveMode ?? "off"}`,
      `Pending approvals: ${this.options.store.listPendingApprovals(resolved.contextKey).length}`,
      `Queue: ${queued}/${this.options.config.queueMaxItems}`,
      `Session status: ${session?.status ?? "(none)"}`,
    ].join("\n");
  }

  private async renderSession(resolved: ResolvedContext): Promise<string> {
    const session = this.options.store.getSession(resolved.contextKey);
    if (!session) {
      return [
        "No active session for this Discord context yet.",
        `Context: ${resolved.contextKey}`,
        `Workspace: ${resolved.mapping.workspace}`,
        "Use /session-new, /session-resume, or send a normal message to create one.",
      ].join("\n");
    }

    const live = await this.refreshSessionInfo(resolved, session);
    const workerStatus = live.workerSessionId
      ? await this.renderWorkerStatus(resolved, live.workerSessionId)
      : "(no worker session)";
    const queued = this.options.store.countQueuedItems(resolved.contextKey);
    const pendingApprovals = this.options.store.listPendingApprovals(resolved.contextKey).length;
    const storedThreadId = session.codexThreadId ?? "(not attached yet)";
    const liveThreadId = live.codexThreadId ?? "(not attached yet)";
    const threadAlignment = session.codexThreadId && live.codexThreadId && session.codexThreadId !== live.codexThreadId
      ? "different"
      : "aligned";

    return [
      `Workspace: ${live.workspace}`,
      `Context: ${live.contextKey}`,
      `Worker: ${live.workerId}`,
      `Stored status: ${live.status}`,
      `Pending approvals: ${pendingApprovals}`,
      `Queue: ${queued}/${this.options.config.queueMaxItems}`,
      `Worker session ID: ${live.workerSessionId ?? "(not created yet)"}`,
      `Stored thread ID: ${storedThreadId}`,
      `Worker thread ID: ${liveThreadId}`,
      `Thread alignment: ${threadAlignment}`,
      `Worker live status: ${workerStatus}`,
      `Last activity: ${live.lastActivityAt}`,
      `Updated: ${live.updatedAt}`,
    ].join("\n");
  }

  private async renderWorkers(activeWorkerId?: string): Promise<string> {
    return [
      "Configured workers",
      ...await this.renderConfiguredWorkerLines(activeWorkerId),
    ].join("\n");
  }

  private async renderNewSession(
    input: BridgeCommandInput,
    resolved: ResolvedContext,
  ): Promise<string> {
    const client = this.createClient(resolved.worker);
    const created = await client.createSession({ workspace: resolved.mapping.workspace });
    const info = await client.newThread(created.sessionId, { workspace: resolved.mapping.workspace });
    const session = this.upsertBaseSession(input, resolved, {
      workerSessionId: created.sessionId,
      workspace: info.workspace || resolved.mapping.workspace,
      status: "idle",
      ...(info.threadId ? { codexThreadId: info.threadId } : {}),
    });

    return [
      "Worker session created.",
      `Context: ${session.contextKey}`,
      `Workspace: ${session.workspace}`,
      `Worker: ${session.workerId}`,
      `Worker session ID: ${session.workerSessionId}`,
      `Codex thread ID: ${session.codexThreadId ?? "(worker did not return one yet)"}`,
    ].join("\n");
  }

  private async renderAttach(
    input: BridgeCommandInput,
    resolved: ResolvedContext,
  ): Promise<string> {
    const threadId = input.options?.thread_id?.trim();
    if (!threadId) {
      return "Missing required option: thread_id";
    }

    const current = this.options.store.getSession(resolved.contextKey);
    const client = this.createClient(resolved.worker);
    const workerSessionId = current?.workerSessionId ?? (await client.createSession({ workspace: resolved.mapping.workspace })).sessionId;
    const info = await client.resumeThread(workerSessionId, threadId);
    const session = this.upsertBaseSession(input, resolved, {
      workerSessionId,
      codexThreadId: info.threadId ?? threadId,
      workspace: info.workspace || resolved.mapping.workspace,
      status: "idle",
    });

    return [
      "Codex thread attached through worker.",
      `Context: ${session.contextKey}`,
      `Worker session ID: ${session.workerSessionId}`,
      `Codex thread ID: ${session.codexThreadId}`,
    ].join("\n");
  }

  private async renderAbort(resolved: ResolvedContext): Promise<string> {
    const session = this.options.store.getSession(resolved.contextKey);
    if (!session?.workerSessionId) {
      return "No active worker session is recorded for this context yet.";
    }

    await this.createClient(resolved.worker).abort(session.workerSessionId);
    this.options.store.upsertSession({
      ...session,
      status: "stopped",
      lastActivityAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return `Abort requested for worker session ${session.workerSessionId}.`;
  }

  private async renderSessions(resolved: ResolvedContext): Promise<string> {
    const storedSessions = this.options.store.listSessions(resolved.guildId, resolved.projectChannelId);
    const workerSessions = await this.listVisibleWorkerSessions(resolved);
    const lines = [
      "Session overview",
      `Workspace: ${resolved.mapping.workspace}`,
      `Context: ${resolved.contextKey}`,
      `Stored session count: ${storedSessions.length}`,
      `Worker visible session count: ${workerSessions.length}`,
      "",
    ];

    if (storedSessions.length === 0) {
      lines.push("Stored sessions");
      lines.push("none yet for this project channel");
    } else {
      lines.push("Stored sessions");
      lines.push(
        ...storedSessions.slice(0, 10).map((session) => {
          const matchedWorkerSession = session.workerSessionId
            ? workerSessions.find((workerSession) => workerSession.sessionId === session.workerSessionId)
            : undefined;
          const workerThreadId = matchedWorkerSession?.info?.threadId;
          const threadAlignment = session.codexThreadId && workerThreadId && session.codexThreadId !== workerThreadId
            ? "thread drift"
            : undefined;

          return [
            session.contextKey === resolved.contextKey ? "*" : "-",
            session.status,
            session.codexThreadId ?? "(no thread)",
            ...(workerThreadId ? [`worker=${workerThreadId}`] : []),
            ...(threadAlignment ? [threadAlignment] : []),
            session.updatedAt,
          ].join(" | ");
        }),
      );
    }

    lines.push("");
    lines.push(...formatWorkerSessions(workerSessions));
    return lines.join("\n");
  }

  private async renderLastResponse(resolved: ResolvedContext): Promise<string> {
    const session = this.options.store.getSession(resolved.contextKey);
    if (!session) {
      return "No stored session exists for this context yet.";
    }

    if (session.lastResponsePreview) {
      return [
        "Last response",
        "Source: local preview",
        session.lastResponsePreview,
      ].join("\n");
    }

    if (!session.workerSessionId) {
      return [
        "Last response",
        "Source: unavailable",
        "Reason: no local preview and no worker session is attached yet.",
      ].join("\n");
    }

    try {
      const lastResponse = await this.createClient(resolved.worker).getLastResponse(session.workerSessionId);
      return [
        "Last response",
        "Source: worker last-response",
        String(lastResponse.text ?? "(empty)"),
      ].join("\n");
    } catch (error) {
      return [
        "Last response",
        "Source: unavailable",
        `Reason: worker last-response failed: ${formatError(error)}`,
      ].join("\n");
    }
  }

  private async renderWorkerBind(input: BridgeCommandInput, resolved: ResolvedContext | undefined): Promise<string> {
    const workerId = input.options?.worker_id?.trim();
    if (!workerId) {
      return "Missing required option: worker_id";
    }
    const worker = this.options.config.workers.find((candidate) => candidate.id === workerId);
    if (!worker) {
      return `Unknown worker: ${workerId}`;
    }
    if (!resolved) {
      return "This channel is not mapped yet. Use /register-workspace first.";
    }

    const currentBinding = this.options.store.getChannelBinding(input.guildId, resolved.projectChannelId);
    const base = currentBinding ?? {
      guildId: input.guildId,
      channelId: resolved.projectChannelId,
      workspace: resolved.mapping.workspace,
      workerId: resolved.mapping.workerId,
      autoPromptEnabled: true,
      autoApproveMode: "off" as const,
    };

    const next = this.options.store.upsertChannelBinding({
      ...base,
      workerId: worker.id,
    });
    const reachability = await this.probeWorkerReachability(worker);
    return [
      "Worker binding saved.",
      `Project channel: ${resolved.projectChannelId}`,
      `Workspace: ${next.workspace}`,
      `Worker: ${next.workerId}`,
      `Worker reachability: ${reachability.summary}`,
    ].join("\n");
  }

  private async renderRegisterWorkspace(input: BridgeCommandInput): Promise<string> {
    const workspace = input.options?.workspace?.trim();
    const workerId = input.options?.worker_id?.trim() || this.options.config.defaultWorkerId;
    if (!workspace) {
      return "Missing required option: workspace";
    }

    const worker = this.options.config.workers.find((candidate) => candidate.id === workerId);
    if (!worker) {
      return `Unknown worker: ${workerId}`;
    }

    const projectChannelId = resolveProjectChannelId({
      channelId: input.channelId,
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      isThread: input.isThread,
    });
    const resolvedWorkspace = resolveWorkspaceForBinding(workspace, worker.workspaceRoot ?? this.options.config.autoWorkspaceRoot);
    this.options.store.upsertChannelBinding({
      guildId: input.guildId,
      channelId: projectChannelId,
      workspace: resolvedWorkspace,
      workerId: worker.id,
      autoPromptEnabled: true,
      autoApproveMode: "off",
    });
    const reachability = await this.probeWorkerReachability(worker);

    return [
      "Workspace binding saved.",
      `Project channel: ${projectChannelId}`,
      `Workspace: ${resolvedWorkspace}`,
      `Worker: ${worker.id}`,
      `Worker reachability: ${reachability.summary}`,
    ].join("\n");
  }

  private renderUnregisterWorkspace(resolved: ResolvedContext): string {
    const deleted = this.options.store.removeChannelBinding(resolved.guildId, resolved.projectChannelId);
    return deleted
      ? `Removed explicit workspace binding for project channel ${resolved.projectChannelId}.`
      : "No explicit workspace binding existed for this project channel.";
  }

  private renderQueue(input: BridgeCommandInput, resolved: ResolvedContext): string {
    const action = input.options?.subcommand ?? input.options?.action ?? "list";
    if (action === "clear") {
      const cleared = this.options.store.clearQueue(resolved.contextKey);
      return `Cleared ${cleared} queued prompt(s) for ${resolved.contextKey}.`;
    }

    const queue = this.options.store.listQueue(resolved.contextKey);
    if (queue.length === 0) {
      return "The queue is empty for this context.";
    }

    return [
      `Queue for ${resolved.contextKey}`,
      ...queue.map((item) => `- #${item.id} | ${item.status} | ${truncate(item.promptText, 80)}`),
    ].join("\n");
  }

  private renderAutoApprove(input: BridgeCommandInput, resolved: ResolvedContext): string {
    const mode = input.options?.mode?.trim();
    if (mode !== "on" && mode !== "off") {
      return "Mode must be on or off.";
    }
    const currentBinding = this.options.store.getChannelBinding(input.guildId, resolved.projectChannelId) ?? {
      guildId: input.guildId,
      channelId: resolved.projectChannelId,
      workspace: resolved.mapping.workspace,
      workerId: resolved.worker.id,
      autoPromptEnabled: true,
      autoApproveMode: "off" as const,
    };
    this.options.store.upsertChannelBinding({
      ...currentBinding,
      autoApproveMode: mode,
    });
    return `Auto-approve is now ${mode} for project channel ${resolved.projectChannelId}.`;
  }

  private async renderGitStatus(resolved: ResolvedContext): Promise<string> {
    const session = await this.ensureSessionForPrompt(resolved, "git-status");
    if (!session.workerSessionId) {
      return [
        "Git status",
        "Source: unavailable",
        "Reason: no worker session is attached yet.",
      ].join("\n");
    }

    let status: WorkerRepoStatus;
    try {
      status = await this.createClient(resolved.worker).getRepoStatus(session.workerSessionId);
    } catch (error) {
      return [
        "Git status",
        "Source: unavailable",
        `Reason: worker repo-status failed: ${formatError(error)}`,
      ].join("\n");
    }

    return [
      "Git status",
      "Source: worker repo-status",
      `Workspace: ${status.workspace ?? session.workspace}`,
      `Branch: ${status.branch ?? "(unknown)"}`,
      `Ahead/behind: ${status.ahead ?? "?"}/${status.behind ?? "?"}`,
      `Clean: ${status.clean === undefined ? "(unknown)" : status.clean ? "yes" : "no"}`,
      `Summary: ${status.summary ?? "(none)"}`,
    ].join("\n");
  }

  private async renderRunTests(resolved: ResolvedContext): Promise<string> {
    const session = await this.ensureSessionForPrompt(resolved, "run-tests");
    if (!session.workerSessionId) {
      return "No worker session is available for checks.";
    }

    let result: WorkerNamedCheckResult;
    try {
      result = await this.createClient(resolved.worker).runNamedCheck(session.workerSessionId, "tests");
    } catch (error) {
      return `Named test checks are not available from this worker yet: ${formatError(error)}`;
    }

    return [
      `Worker check: ${result.name}`,
      `Result: ${result.ok ? "ok" : "failed"}`,
      `Summary: ${result.summary}`,
      ...(result.details ? [result.details] : []),
    ].join("\n");
  }

  private renderHandoff(resolved: ResolvedContext): string {
    const session = this.options.store.getSession(resolved.contextKey);
    const threadId = session?.codexThreadId;
    if (!threadId) {
      return [
        "No Codex thread is attached to this context yet.",
        `Context: ${resolved.contextKey}`,
        "Use /session-resume after creating or resuming a Codex thread.",
      ].join("\n");
    }

    return [
      "Handoff",
      `Workspace: ${session.workspace}`,
      `Codex thread ID: ${threadId}`,
      `Resume command (PowerShell): Set-Location '${session.workspace}'; codex resume '${threadId}'`,
    ].join("\n");
  }

  private async runPromptCommand(input: BridgeCommandInput, resolved: ResolvedContext): Promise<string[]> {
    const prompt = input.options?.prompt?.trim();
    if (!prompt) {
      return ["Missing required option: prompt"];
    }

    const delivery = await this.sendPromptToContext(resolved, input.userId, undefined, prompt);
    if (delivery.queued) {
      return delivery.responseParts.length > 0
        ? delivery.responseParts
        : [`The context is busy, so the prompt was queued at position ${delivery.queuePosition}.`];
    }

    return delivery.responseParts;
  }

  private async sendPromptToContext(
    resolved: ResolvedContext,
    discordUserId: string,
    sourceMessageId: string | undefined,
    prompt: string,
  ): Promise<PromptDelivery> {
    const queueReason = this.getQueueReason(resolved.contextKey);
    if (queueReason) {
      return this.enqueueDeferredPrompt(resolved.contextKey, discordUserId, sourceMessageId, prompt, queueReason);
    }

    const session = await this.ensureSessionForPrompt(resolved, prompt);
    if (!session.workerSessionId) {
      return { responseParts: ["No active worker session could be created for this context."], queued: false };
    }

    this.activeContexts.add(resolved.contextKey);
    try {
      const result = await this.executePrompt(resolved, session, prompt);
      const responseParts = renderPromptResult(result);
      this.options.store.upsertSession({
        ...session,
        status: result.approvalRequest ? "waiting_approval" : "idle",
        lastActivityAt: new Date().toISOString(),
        lastPromptPreview: preview(prompt),
        lastResponsePreview: preview(responseParts.join("\n")),
      });
      void this.drainQueue(resolved);
      return {
        responseParts,
        queued: false,
        ...(result.approvalRequest ? { approvalRequest: result.approvalRequest } : {}),
      };
    } catch (error) {
      this.options.store.upsertSession({
        ...session,
        status: "error",
        lastActivityAt: new Date().toISOString(),
        lastPromptPreview: preview(prompt),
        lastResponsePreview: preview(`Codex prompt failed: ${formatError(error)}`),
      });
      return { responseParts: [`Codex prompt failed: ${formatError(error)}`], queued: false };
    } finally {
      this.activeContexts.delete(resolved.contextKey);
    }
  }

  private async executePrompt(
    resolved: ResolvedContext,
    session: SessionRecord,
    prompt: string,
  ): Promise<PromptResult> {
    const client = this.createClient(resolved.worker);
    const textParts: string[] = [];
    let toolStarts = 0;
    let toolFailures = 0;
    let usage: PromptResult["usage"];
    let approvalRequest: ApprovalRequest | undefined;

    this.options.store.upsertSession({
      ...session,
      status: "busy",
      lastActivityAt: new Date().toISOString(),
      lastPromptPreview: preview(prompt),
    });

    await client.prompt(
      session.workerSessionId!,
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
        onApprovalRequest: (approvalKind, payload) => {
          approvalRequest = this.options.store.createApprovalRequest({
            contextKey: resolved.contextKey,
            workerId: resolved.worker.id,
            approvalKind,
            payloadJson: JSON.stringify(payload),
            ...(session.workerSessionId ? { workerSessionId: session.workerSessionId } : {}),
          });
          this.options.store.appendAuditLog({
            contextKey: resolved.contextKey,
            action: "approval_requested",
            result: approvalKind,
            detailJson: JSON.stringify(payload),
          });
        },
        onTurnComplete: (nextUsage) => {
          usage = nextUsage;
        },
      },
    );

    return {
      responseParts: splitDiscordMessages(textParts.join("").trim() || "(no text returned)"),
      toolStarts,
      toolFailures,
      ...(approvalRequest ? { approvalRequest } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  private async ensureSessionForPrompt(resolved: ResolvedContext, promptForPreview: string): Promise<SessionRecord> {
    const existing = this.options.store.getSession(resolved.contextKey);
    if (existing?.workerSessionId) {
      return existing;
    }

    const client = this.createClient(resolved.worker);
    const created = await client.createSession({ workspace: resolved.mapping.workspace });
    const info = await client.newThread(created.sessionId, { workspace: resolved.mapping.workspace });
    return this.options.store.upsertSession({
      contextKey: resolved.contextKey,
      guildId: resolved.guildId,
      channelId: resolved.projectChannelId,
      ...(resolved.threadBinding ? { threadId: resolved.threadBinding.threadId } : {}),
      workspace: info.workspace || resolved.mapping.workspace,
      workerId: resolved.worker.id,
      workerSessionId: created.sessionId,
      ...(info.threadId ? { codexThreadId: info.threadId } : {}),
      status: "idle",
      lastActivityAt: new Date().toISOString(),
      lastPromptPreview: preview(promptForPreview),
    });
  }

  private async refreshSessionInfo(resolved: ResolvedContext, session: SessionRecord): Promise<SessionRecord> {
    if (!session.workerSessionId) {
      return session;
    }

    try {
      const info = await this.createClient(resolved.worker).getSessionInfo(session.workerSessionId);
      return this.mergeSessionInfo(session, info);
    } catch {
      return session;
    }
  }

  private async renderWorkerStatus(resolved: ResolvedContext, workerSessionId: string): Promise<string> {
    try {
      const rawStatus = await this.createClient(resolved.worker).getSessionStatus(workerSessionId);
      return summarizeWorkerStatus(rawStatus);
    } catch (error) {
      return `unavailable: ${formatError(error)}`;
    }
  }

  private async listVisibleWorkerSessions(resolved: ResolvedContext): Promise<Array<{ sessionId: string; info?: WorkerSessionInfo }>> {
    const workerSessions = await this.createClient(resolved.worker).listSessions();
    return workerSessions.filter((session) => {
      const workspace = session.info?.workspace;
      return !workspace || workspace === resolved.mapping.workspace;
    });
  }

  private async renderWorkerSessions(resolved: ResolvedContext): Promise<string[]> {
    try {
      return formatWorkerSessions(await this.listVisibleWorkerSessions(resolved));
    } catch (error) {
      return [
        "Worker-reported sessions",
        `unavailable (${formatError(error)})`,
      ];
    }
  }

  private mergeSessionInfo(session: SessionRecord, info: WorkerSessionInfo): SessionRecord {
    return this.options.store.upsertSession({
      ...session,
      workspace: info.workspace || session.workspace,
      ...(info.threadId ? { codexThreadId: info.threadId } : {}),
      lastActivityAt: new Date().toISOString(),
    });
  }

  private upsertBaseSession(
    input: BridgeCommandInput,
    resolved: ResolvedContext,
    overrides: Partial<SessionRecord>,
  ): SessionRecord {
    return this.options.store.upsertSession({
      contextKey: resolved.contextKey,
      guildId: input.guildId,
      channelId: resolved.projectChannelId,
      ...(input.isThread ? { threadId: input.channelId } : {}),
      workspace: overrides.workspace ?? resolved.mapping.workspace,
      workerId: overrides.workerId ?? resolved.worker.id,
      ...(overrides.workerSessionId ? { workerSessionId: overrides.workerSessionId } : {}),
      ...(overrides.codexThreadId ? { codexThreadId: overrides.codexThreadId } : {}),
      status: overrides.status ?? "idle",
      lastActivityAt: new Date().toISOString(),
      ...(overrides.lastPromptPreview ? { lastPromptPreview: overrides.lastPromptPreview } : {}),
      ...(overrides.lastResponsePreview ? { lastResponsePreview: overrides.lastResponsePreview } : {}),
    });
  }

  private async drainQueue(resolved: ResolvedContext): Promise<void> {
    if (this.getQueueReason(resolved.contextKey) === "waiting_approval") {
      return;
    }

    const next = this.options.store.listQueue(resolved.contextKey).find((item) => item.status === "queued");
    if (!next || this.activeContexts.has(resolved.contextKey)) {
      return;
    }

    this.options.store.markQueueItemStatus(next.id, "running");
    const delivery = await this.sendPromptToContext(resolved, next.discordUserId, next.sourceMessageId, next.promptText);
    this.options.store.markQueueItemStatus(next.id, delivery.responseParts[0]?.startsWith("Codex prompt failed:") ? "failed" : "completed");
  }

  private async drainQueueForStoredSession(session: SessionRecord): Promise<void> {
    const resolved = this.resolveStoredSessionContext(session);
    if (!resolved) {
      return;
    }

    await this.drainQueue(resolved);
  }

  private createClient(worker: WorkerTarget): BridgeWorkerClient {
    return this.options.createWorkerClient?.(worker) ?? new WorkerClient({
      worker,
      timeoutMs: this.options.config.workerTimeoutMs,
    });
  }

  private requireWorker(workerId: string): WorkerTarget {
    const worker = this.options.config.workers.find((candidate) => candidate.id === workerId);
    if (!worker) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    return worker;
  }

  private async expireApprovalsForContext(contextKey?: DiscordContextKey): Promise<void> {
    const expiryTime = new Date(Date.now() - this.options.config.approvalTtlMs).toISOString();
    const expiredApprovals = this.options.store.listPendingApprovals(contextKey)
      .filter((approval) => approval.createdAt <= expiryTime);

    if (expiredApprovals.length === 0) {
      return;
    }

    this.options.store.expirePendingApprovals(expiryTime, contextKey);
    for (const approval of expiredApprovals) {
      const session = this.options.store.getSession(approval.contextKey);
      const stillPending = this.options.store.listPendingApprovals(approval.contextKey).length;
      if (session?.status === "waiting_approval" && stillPending === 0) {
        const nextSession = this.options.store.upsertSession({
          ...session,
          status: "idle",
          lastActivityAt: new Date().toISOString(),
        });
        await this.drainQueueForStoredSession(nextSession);
      }
      this.options.store.appendAuditLog({
        contextKey: approval.contextKey,
        action: "approval_expired",
        result: "expired",
        detailJson: JSON.stringify({ requestId: approval.id }),
      });
    }
  }

  private enqueueDeferredPrompt(
    contextKey: DiscordContextKey,
    discordUserId: string,
    sourceMessageId: string | undefined,
    prompt: string,
    reason: "busy" | "waiting_approval",
  ): PromptDelivery {
    const queueCount = this.options.store.countQueuedItems(contextKey);
    if (queueCount >= this.options.config.queueMaxItems) {
      return {
        responseParts: [`The queue is full for this context (${queueCount}/${this.options.config.queueMaxItems}).`],
        queued: false,
      };
    }

    this.options.store.enqueuePrompt({
      contextKey,
      discordUserId,
      promptText: prompt,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    });

    return {
      responseParts: reason === "waiting_approval"
        ? [`The session is waiting for approval, so the prompt was queued at position ${queueCount + 1}.`]
        : [],
      queued: true,
      queuePosition: queueCount + 1,
    };
  }

  private getQueueReason(contextKey: DiscordContextKey): "busy" | "waiting_approval" | undefined {
    if (this.activeContexts.has(contextKey)) {
      return "busy";
    }

    const session = this.options.store.getSession(contextKey);
    if (session?.status === "waiting_approval" || this.options.store.listPendingApprovals(contextKey).length > 0) {
      return "waiting_approval";
    }

    return undefined;
  }

  private resolveStoredSessionContext(session: SessionRecord): ResolvedContext | undefined {
    const worker = this.options.config.workers.find((candidate) => candidate.id === session.workerId);
    if (!worker) {
      return undefined;
    }

    const threadBinding = session.threadId
      ? this.options.store.getThreadBinding(session.guildId, session.threadId)
      : undefined;

    return {
      guildId: session.guildId,
      contextKey: session.contextKey,
      projectChannelId: session.channelId,
      mapping: {
        channelId: session.channelId,
        workspace: session.workspace,
        workerId: session.workerId,
      },
      worker,
      ...(threadBinding ? { threadBinding } : {}),
    };
  }

  private async probeWorkerReachability(worker: WorkerTarget): Promise<WorkerReachability> {
    try {
      const health = await this.createClient(worker).getHealth();
      return {
        ok: true,
        summary: `reachable (${String(health.mode ?? "ok")})`,
      };
    } catch (error) {
      return {
        ok: false,
        summary: `unreachable: ${formatError(error)}`,
      };
    }
  }

  private async renderConfiguredWorkerLines(activeWorkerId?: string): Promise<string[]> {
    const lines: string[] = [];
    for (const worker of this.options.config.workers) {
      const reachability = await this.probeWorkerReachability(worker);
      const flags = [
        worker.id === this.options.config.defaultWorkerId ? "default" : undefined,
        worker.id === activeWorkerId ? "active" : undefined,
      ].filter(Boolean).join(", ");
      lines.push([
        worker.id,
        worker.label,
        worker.baseUrl,
        `workspaceRoot=${worker.workspaceRoot ?? "(not set)"}`,
        `health=${reachability.summary}`,
        ...(flags ? [`flags=${flags}`] : []),
      ].join(" | "));
    }
    return lines;
  }
}

function normalizeCommandName(value: string): string {
  if (value === "new") {
    return "session-new";
  }
  if (value === "attach") {
    return "session-resume";
  }
  if (value === "abort") {
    return "session-stop";
  }
  return value;
}

function response(content: string): BridgeCommandResponse {
  return { content, followUpContents: [], ephemeral: true };
}

function responseParts(parts: string[]): BridgeCommandResponse {
  const normalizedParts = parts.length > 0 ? parts : ["(empty response)"];
  return {
    content: normalizedParts[0] ?? "(empty response)",
    followUpContents: normalizedParts.slice(1),
    ephemeral: true,
  };
}

function renderPromptResult(result: PromptResult): string[] {
  const lines = ["Codex response", ...result.responseParts];

  if (result.toolStarts > 0) {
    lines.push(
      `Codex tool calls: ${result.toolStarts} event${result.toolStarts === 1 ? "" : "s"}, ${result.toolFailures} failed inside Codex`,
    );
  }

  if (result.usage) {
    lines.push(
      `Tokens: in ${result.usage.inputTokens ?? "?"}, cached ${result.usage.cachedInputTokens ?? "?"}, out ${result.usage.outputTokens ?? "?"}`,
    );
  }

  if (result.approvalRequest) {
    lines.push(
      `Approval required: #${result.approvalRequest.id} (${result.approvalRequest.approvalKind})`,
    );
  }

  return splitDiscordMessages(lines.join("\n"));
}

function preview(value: string, maxLength = 280): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function splitDiscordMessages(value: string, maxLength = 1_900): string[] {
  if (value.length <= maxLength) {
    return [value];
  }

  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    const preferredBreak = remaining.lastIndexOf("\n", maxLength);
    const splitAt = preferredBreak > maxLength * 0.5 ? preferredBreak : maxLength;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function joinWorkspacePath(root: string, projectName: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  const separator = /^[A-Za-z]:[\\/]/.test(normalizedRoot) || normalizedRoot.includes("\\") ? "\\" : "/";
  return `${normalizedRoot}${separator}${projectName}`;
}

function resolveWorkspaceForBinding(workspace: string, workspaceRoot?: string): string {
  if (!workspaceRoot || /^[A-Za-z]:[\\/]/.test(workspace) || workspace.startsWith("/")) {
    return workspace;
  }
  return joinWorkspacePath(workspaceRoot, workspace.replace(/^[./\\]+/, ""));
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeWorkerStatus(status: Record<string, unknown>): string {
  const preferredSummary = summarizePreferredWorkerStatusFields(status);
  if (preferredSummary) {
    return preferredSummary;
  }

  const compactEntries = Object.entries(status)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}=${stringifyStatusValue(value)}`);

  return compactEntries.length > 0 ? compactEntries.join(", ") : "(empty worker status)";
}

function summarizeWorkerStatusFromUnknown(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const summary = summarizeWorkerStatus(value as Record<string, unknown>);
  return summary === "(empty worker status)" ? undefined : summary;
}

function summarizePreferredWorkerStatusFields(status: Record<string, unknown>): string | undefined {
  const preferredFields = ["status", "state", "mode", "phase"];
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const field of preferredFields) {
    const value = status[field];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    const normalized = value.trim();
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    parts.push(parts.length === 0 ? normalized : `${field}=${normalized}`);
    seen.add(dedupeKey);
  }

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function stringifyStatusValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyStatusValue(item)).join("|");
  }
  if (typeof value === "object") {
    return "[object]";
  }
  return String(value);
}

function countWorkerSessionLines(lines: string[]): number {
  return lines.filter((line) => line.startsWith("- ")).length;
}

function formatWorkerSessions(workerSessions: Array<{ sessionId: string; info?: WorkerSessionInfo }>): string[] {
  if (workerSessions.length === 0) {
    return [
      "Worker-reported sessions",
      "none for this workspace",
    ];
  }

  return [
    "Worker-reported sessions",
    ...workerSessions.slice(0, 10).map((session) =>
      [
        `- ${session.sessionId}`,
        session.info?.threadId ?? "(no thread)",
        session.info?.workspace ?? "(unknown workspace)",
        summarizeWorkerStatusFromUnknown(session.info) ?? "(no live status)",
      ].join(" | "),
    ),
  ];
}
