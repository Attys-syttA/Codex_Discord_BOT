import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BridgeOrchestrator, type BridgeCommandInput, type BridgeWorkerClient } from "../src/command-handlers.js";
import { loadConfig } from "../src/config.js";
import { SqliteStateStore } from "../src/db/sqlite-store.js";

const CONFIG_DIR = "C:\\workspace\\Codex_Discord_BOT";
const WORKSPACE_ROOT = "C:\\workspace";
const REPO_WORKSPACE = "C:\\workspace\\Codex_Discord_BOT";

const env = {
  DISCORD_TOKEN: "TEST_ONLY_DISCORD_BOT_TOKEN",
  DISCORD_APPLICATION_ID: "100000000000000010",
  DISCORD_GUILD_ID: "100000000000000001",
  DISCORD_ALLOWED_USER_IDS: "100000000000000999",
  DISCORD_ALLOWED_ROLE_IDS: "100000000000000301",
  DISCORD_CHANNEL_MAPPINGS_JSON: JSON.stringify([
    {
      channelId: "100000000000000101",
      workspace: "Codex_Discord_BOT",
      workerId: "worker-home",
    },
  ]),
  DISCORD_WORKERS_JSON: JSON.stringify([
    {
      id: "worker-home",
      label: "Home worker",
      baseUrl: "http://127.0.0.1:8787",
      workspaceRoot: "..",
    },
  ]),
  DISCORD_DEFAULT_WORKER_ID: "worker-home",
  DISCORD_APPROVAL_TTL_MS: "1800000",
};

const baseInput: BridgeCommandInput = {
  commandName: "session",
  guildId: "100000000000000001",
  channelId: "100000000000000201",
  parentId: "100000000000000101",
  isThread: true,
  userId: "100000000000000999",
  memberRoleIds: [],
};

const tempDirs: string[] = [];
const stores: SqliteStateStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("BridgeOrchestrator", () => {
  function createMockWorker(overrides: Partial<BridgeWorkerClient> = {}): BridgeWorkerClient {
    return {
      getHealth: async () => ({ mode: "remote-worker" }),
      createSession: async () => ({
        sessionId: "worker-session-1",
        info: { threadId: null, workspace: REPO_WORKSPACE },
      }),
      listSessions: async () => ([
        {
          sessionId: "worker-session-1",
          info: { threadId: "codex-thread-live", workspace: REPO_WORKSPACE, status: "running", phase: "planning" },
        },
      ]),
      getSessionInfo: async () => ({
        threadId: "codex-thread-live",
        workspace: REPO_WORKSPACE,
      }),
      getSessionStatus: async () => ({
        status: "running",
      }),
      newThread: async () => ({
        threadId: "codex-thread-new",
        workspace: REPO_WORKSPACE,
      }),
      resumeThread: async (_sessionId: string, threadId: string) => ({
        threadId,
        workspace: REPO_WORKSPACE,
      }),
      abort: async () => undefined,
      prompt: async () => undefined,
      getRepoStatus: async () => ({
        workspace: REPO_WORKSPACE,
        branch: "main",
        ahead: 1,
        behind: 0,
        clean: true,
        summary: "ahead by 1 commit",
      }),
      runNamedCheck: async (name: string) => ({
        name,
        ok: true,
        summary: "All tests passed",
      }),
      getLastResponse: async () => ({
        text: "Utolsó válasz",
      }),
      submitApprovalDecision: async () => ({ ok: true }),
      ...overrides,
    };
  }

  function createHarness(workerOverrides: Partial<BridgeWorkerClient> = {}) {
    const tempDir = mkdtempSync(join(tmpdir(), "codex-discord-bot-"));
    tempDirs.push(tempDir);
    const store = new SqliteStateStore({
      databasePath: join(tempDir, "bridge.sqlite"),
    });
    stores.push(store);
    const orchestrator = new BridgeOrchestrator({
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      store,
      createWorkerClient: () => createMockWorker(workerOverrides),
    });
    return { store, orchestrator };
  }

  it("renders /session for an empty mapped thread context", async () => {
    const { orchestrator } = createHarness();
    const response = await orchestrator.handleCommand(baseInput);

    expect(response.ephemeral).toBe(true);
    expect(response.content).toContain("No active session");
    expect(response.content).toContain(REPO_WORKSPACE);
  });

  it("renders /session with live worker status when a session exists", async () => {
    const { orchestrator } = createHarness();
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "session" });

    expect(response.content).toContain(`Workspace: ${REPO_WORKSPACE}`);
    expect(response.content).toContain("Stored status: idle");
    expect(response.content).toContain("Pending approvals: 0");
    expect(response.content).toContain("Queue: 0/10");
    expect(response.content).toContain("Stored thread ID: codex-thread-new");
    expect(response.content).toContain("Worker thread ID: codex-thread-live");
    expect(response.content).toContain("Thread alignment: different");
    expect(response.content).toContain("Worker live status: running");
    expect(response.content).toContain("codex-thread-live");
  });

  it("auto maps an unmapped forum thread by parent channel name", async () => {
    const { store } = createHarness();
    const orchestrator = new BridgeOrchestrator({
      config: loadConfig({
        ...env,
        DISCORD_CHANNEL_MAPPINGS_JSON: "[]",
      }, { configDir: CONFIG_DIR }),
      store,
    });

    const response = await orchestrator.handleCommand({
      ...baseInput,
      channelId: "100000000000000202",
      parentId: "100000000000000102",
      parentName: "codex_discord_bot",
    });

    expect(response.content).toContain("No active session");
    expect(response.content).toContain("Context: 100000000000000001:100000000000000102:100000000000000202");
    expect(response.content).toContain(`Workspace: ${WORKSPACE_ROOT}\\codex_discord_bot`);
  });

  it("creates a worker session and Codex thread with /session-new", async () => {
    const calls: string[] = [];
    const { orchestrator, store } = createHarness({
      createSession: async () => {
        calls.push("createSession");
        return {
          sessionId: "worker-session-1",
          info: { threadId: null, workspace: REPO_WORKSPACE },
        };
      },
      newThread: async () => {
        calls.push("newThread");
        return {
          threadId: "codex-thread-new",
          workspace: REPO_WORKSPACE,
        };
      },
    });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    expect(calls).toEqual(["createSession", "newThread"]);
    expect(response.content).toContain("Worker session created.");
    expect(response.content).toContain("codex-thread-new");
    expect(store.listSessions()).toHaveLength(1);
  });

  it("attaches and renders a handoff command", async () => {
    const { orchestrator } = createHarness();
    await orchestrator.handleCommand({
      ...baseInput,
      commandName: "session-resume",
      options: { thread_id: "codex-thread-1" },
    });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "handoff" });
    expect(response.content).toContain("codex resume 'codex-thread-1'");
  });

  it("renders /sessions with stored and worker-reported sessions", async () => {
    const { orchestrator } = createHarness();
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "sessions" });

    expect(response.content).toContain("Session overview");
    expect(response.content).toContain(`Workspace: ${REPO_WORKSPACE}`);
    expect(response.content).toContain("Stored session count: 1");
    expect(response.content).toContain("Worker visible session count: 1");
    expect(response.content).toContain("Stored sessions");
    expect(response.content).toContain("Worker-reported sessions");
    expect(response.content).toContain("worker-session-1");
    expect(response.content).toContain("codex-thread-live");
    expect(response.content).toContain("running, phase=planning");
    expect(response.content).toContain("* | idle | codex-thread-new");
    expect(response.content).toContain("worker=codex-thread-live");
    expect(response.content).toContain("thread drift");
  });

  it("normalizes worker live status using preferred fields", async () => {
    const { orchestrator } = createHarness({
      getSessionStatus: async () => ({
        status: "running",
        phase: "review",
        queueDepth: 1,
      }),
    });
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "session" });

    expect(response.content).toContain("Worker live status: running, phase=review");
  });

  it("sends /ask prompts to the active worker session", async () => {
    const calls: Array<{ sessionId: string; input: unknown }> = [];
    const { orchestrator } = createHarness({
      prompt: async (sessionId, input, callbacks) => {
        calls.push({ sessionId, input });
        callbacks?.onToolStart?.("shell_command", "tool-1");
        callbacks?.onTextDelta?.("Rendben, ");
        callbacks?.onTextDelta?.("folytatom.");
        callbacks?.onToolEnd?.("tool-1", false);
        callbacks?.onTurnComplete?.({ inputTokens: 10, cachedInputTokens: 2, outputTokens: 5 });
      },
    });

    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });
    const response = await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Folytasd a Discord bridge-et." },
    });

    expect(calls).toEqual([
      {
        sessionId: "worker-session-1",
        input: {
          policyPreamble: [
            "For repository status questions, prefer the current status and next steps in docs/STATE.md.",
            "Treat older append-only docs/CHANGELOG.dev.md follow-up lines as historical notes that may have already been completed.",
          ].join("\n"),
          text: "Folytasd a Discord bridge-et.",
        },
      },
    ]);
    expect(response.content).toContain("Codex response");
    expect(response.content).toContain("Rendben, folytatom.");
    expect(response.content).toContain("Codex tool calls: 1 event, 0 failed inside Codex");
    expect(response.content).toContain("Tokens: in 10, cached 2, out 5");
  });

  it("queues normal message prompts while the context is busy", async () => {
    let releasePrompt: (() => void) | undefined;
    const { orchestrator, store } = createHarness({
      prompt: async (_sessionId, _input, callbacks) => {
        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });
        callbacks?.onTextDelta?.("Első válasz");
      },
    });

    const first = orchestrator.handleMessage({
      guildId: baseInput.guildId,
      channelId: baseInput.channelId,
      parentId: "100000000000000101",
      isThread: true,
      userId: baseInput.userId,
      memberRoleIds: [],
      messageId: "msg-1",
      text: "Első kérés",
    });
    for (let attempt = 0; attempt < 20 && !releasePrompt; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const second = await orchestrator.handleMessage({
      guildId: baseInput.guildId,
      channelId: baseInput.channelId,
      parentId: "100000000000000101",
      isThread: true,
      userId: baseInput.userId,
      memberRoleIds: [],
      messageId: "msg-2",
      text: "Második kérés",
    });

    expect(second?.queued).toBe(true);
    expect(store.countQueuedItems("100000000000000001:100000000000000101:100000000000000201")).toBe(1);

    releasePrompt?.();
    await first;
  });

  it("renders /doctor with SQLite storage and worker health", async () => {
    const { orchestrator } = createHarness();
    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "doctor" });

    expect(response.content).toContain("Worker health: remote-worker");
    expect(response.content).toContain("Worker session visibility: visible (1 for workspace)");
    expect(response.content).toContain("Storage: SQLite");
    expect(response.content).toContain("Prompt mode: slash + normal messages");
    expect(response.content).toContain("Auto approve: off");
    expect(response.content).toContain("Local sessions: 0");
  });

  it("shows the local preview first in /last", async () => {
    const { orchestrator, store } = createHarness({
      getLastResponse: async () => ({
        text: "Worker valasz",
      }),
    });
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const session = store.getSession("100000000000000001:100000000000000101:100000000000000201");
    if (session) {
      store.upsertSession({
        ...session,
        lastResponsePreview: "Helyi elonezet",
      });
    }

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "last" });

    expect(response.content).toContain("Last response");
    expect(response.content).toContain("Source: local preview");
    expect(response.content).toContain("Helyi elonezet");
    expect(response.content).not.toContain("Worker valasz");
  });

  it("falls back to worker last-response in /last when no local preview exists", async () => {
    const { orchestrator } = createHarness({
      getLastResponse: async () => ({
        text: "Worker valasz",
      }),
    });
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "last" });

    expect(response.content).toContain("Last response");
    expect(response.content).toContain("Source: worker last-response");
    expect(response.content).toContain("Worker valasz");
  });

  it("returns a clear unavailable message in /last when neither local nor worker data exists", async () => {
    const { orchestrator, store } = createHarness();

    store.upsertSession({
      contextKey: "100000000000000001:100000000000000101:100000000000000201",
      guildId: baseInput.guildId,
      channelId: "100000000000000101",
      threadId: "100000000000000201",
      workspace: REPO_WORKSPACE,
      workerId: "worker-home",
      status: "idle",
    });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "last" });

    expect(response.content).toContain("Last response");
    expect(response.content).toContain("Source: unavailable");
    expect(response.content).toContain("no local preview and no worker session");
  });

  it("renders git status from the worker with a clear source label", async () => {
    const { orchestrator } = createHarness();

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "git-status" });

    expect(response.content).toContain("Git status");
    expect(response.content).toContain("Source: worker repo-status");
    expect(response.content).toContain("Branch: main");
    expect(response.content).toContain("Summary: ahead by 1 commit");
  });

  it("renders a clear unavailable git-status message when the worker repo endpoint fails", async () => {
    const { orchestrator } = createHarness({
      getRepoStatus: async () => {
        throw new Error("repo endpoint missing");
      },
    });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "git-status" });

    expect(response.content).toContain("Git status");
    expect(response.content).toContain("Source: unavailable");
    expect(response.content).toContain("worker repo-status failed: repo endpoint missing");
  });

  it("expires stale approvals lazily during status rendering", async () => {
    const { orchestrator, store } = createHarness();
    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });

    const session = store.getSession("100000000000000001:100000000000000101:100000000000000201");
    expect(session?.status).toBe("idle");
    if (session) {
      store.upsertSession({ ...session, status: "waiting_approval" });
    }

    const staleApproval = store.createApprovalRequest({
      contextKey: "100000000000000001:100000000000000101:100000000000000201",
      workerId: "worker-home",
      workerSessionId: "worker-session-1",
      approvalKind: "worker_question",
      payloadJson: "{\"prompt\":\"stale\"}",
      createdAt: "2000-01-01T00:00:00.000Z",
    });

    const response = await orchestrator.handleCommand({ ...baseInput, commandName: "status" });

    expect(store.getApprovalRequest(staleApproval.id)?.status).toBe("expired");
    expect(store.getSession("100000000000000001:100000000000000101:100000000000000201")?.status).toBe("idle");
    expect(response.content).toContain("Pending approvals: 0");
    expect(store.listAuditLog("100000000000000001:100000000000000101:100000000000000201").some((entry) => entry.action === "approval_expired")).toBe(true);
  });

  it("audits approval decisions and enables auto-approve", async () => {
    const { orchestrator, store } = createHarness({
      prompt: async (_sessionId, _input, callbacks) => {
        callbacks?.onApprovalRequest?.("file_modification", { path: "src/index.ts" });
      },
    });

    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });
    await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Touch a file" },
    });

    const approval = store.listPendingApprovals("100000000000000001:100000000000000101:100000000000000201")[0];
    expect(approval).toBeTruthy();

    const result = await orchestrator.handleApprovalDecision(approval!.id, true, baseInput.userId, true);

    expect(result).toContain("auto-approve was enabled");
    expect(store.getApprovalRequest(approval!.id)?.status).toBe("auto_approved");
    expect(store.getChannelBinding(baseInput.guildId, "100000000000000101")?.autoApproveMode).toBe("on");
    expect(store.listAuditLog("100000000000000001:100000000000000101:100000000000000201").map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["approval_requested", "approval_forward", "approval_approved", "auto_approve_mode"]),
    );
  });

  it("queues new prompts while the session is waiting for approval", async () => {
    const { orchestrator, store } = createHarness({
      prompt: async (_sessionId, _input, callbacks) => {
        callbacks?.onApprovalRequest?.("worker_question", { question: "Continue?" });
      },
    });

    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });
    await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Elso kerdes" },
    });

    const response = await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Masodik kerdes" },
    });

    expect(response.content).toContain("waiting for approval");
    expect(store.getSession("100000000000000001:100000000000000101:100000000000000201")?.status).toBe("waiting_approval");
    expect(store.countQueuedItems("100000000000000001:100000000000000101:100000000000000201")).toBe(1);
  });

  it("drains queued prompts after approval is resolved", async () => {
    const seenPrompts: string[] = [];
    const { orchestrator, store } = createHarness({
      prompt: async (_sessionId, input, callbacks) => {
        const text = typeof input === "object" && input && "text" in input ? String(input.text) : String(input);
        seenPrompts.push(text);
        if (seenPrompts.length === 1) {
          callbacks?.onApprovalRequest?.("worker_question", { question: "Continue?" });
          return;
        }
        callbacks?.onTextDelta?.("Masodik kor lefutott.");
      },
    });

    await orchestrator.handleCommand({ ...baseInput, commandName: "session-new" });
    await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Elso kerdes" },
    });

    await orchestrator.handleCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Masodik kerdes" },
    });

    const approval = store.listPendingApprovals("100000000000000001:100000000000000101:100000000000000201")[0];
    expect(approval).toBeTruthy();

    await orchestrator.handleApprovalDecision(approval!.id, true, baseInput.userId, false);

    expect(seenPrompts).toEqual(["Elso kerdes", "Masodik kerdes"]);
    expect(store.countQueuedItems("100000000000000001:100000000000000101:100000000000000201")).toBe(0);
    expect(store.getSession("100000000000000001:100000000000000101:100000000000000201")?.status).toBe("idle");
  });
});
