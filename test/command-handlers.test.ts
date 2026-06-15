import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { handleBridgeCommand, type BridgeCommandInput, type BridgeWorkerClient } from "../src/command-handlers.js";
import { SessionRegistry } from "../src/session-registry.js";

const CONFIG_DIR = "C:\\codex_works\\Codex_Discord_BOT";
const WORKSPACE_ROOT = "C:\\codex_works";
const REPO_WORKSPACE = "C:\\codex_works\\Codex_Discord_BOT";

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

describe("handleBridgeCommand", () => {
  function createMockWorker(overrides: Partial<BridgeWorkerClient> = {}): BridgeWorkerClient {
    return {
      getHealth: async () => ({ mode: "remote-worker" }),
      createSession: async () => ({
        sessionId: "worker-session-1",
        info: { threadId: null, workspace: REPO_WORKSPACE },
      }),
      getSessionInfo: async () => ({
        threadId: "codex-thread-live",
        workspace: REPO_WORKSPACE,
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
      ...overrides,
    };
  }

  it("renders /session for an empty mapped thread context", async () => {
    const response = await handleBridgeCommand(baseInput, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.ephemeral).toBe(true);
    expect(response.content).toContain("No active session");
    expect(response.content).toContain(REPO_WORKSPACE);
  });

  it("auto maps an unmapped forum thread by parent channel name", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      channelId: "100000000000000202",
      parentId: "100000000000000102",
      parentName: "codex_discord_bot",
    }, {
      config: loadConfig({
        ...env,
        DISCORD_CHANNEL_MAPPINGS_JSON: "[]",
      }, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain("No active session");
    expect(response.content).toContain("Context: 100000000000000001:100000000000000102:100000000000000202");
    expect(response.content).toContain(`Workspace: ${WORKSPACE_ROOT}\\codex_discord_bot`);
  });

  it("prefers explicit channel mappings over auto workspace mapping", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      parentName: "different_project",
    }, {
      config: loadConfig({
        ...env,
      }, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain(`Workspace: ${REPO_WORKSPACE}`);
  });

  it("uses auto workspace aliases to canonicalize forum slug names", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      channelId: "100000000000000202",
      parentId: "100000000000000102",
      parentName: "codex_discord_bot",
    }, {
      config: loadConfig({
        ...env,
        DISCORD_CHANNEL_MAPPINGS_JSON: "[]",
        DISCORD_AUTO_WORKSPACE_ALIASES_JSON: JSON.stringify({
          codex_discord_bot: "Codex_Discord_BOT",
        }),
      }, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain(`Workspace: ${REPO_WORKSPACE}`);
  });

  it("uses the default worker workspace root for auto mapping", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      channelId: "100000000000000202",
      parentId: "100000000000000102",
      parentName: "codex_discord_bot",
    }, {
      config: loadConfig({
        ...env,
        DISCORD_CHANNEL_MAPPINGS_JSON: "[]",
        DISCORD_WORKERS_JSON: JSON.stringify([
          {
            id: "worker-office",
            label: "Office worker",
            baseUrl: "http://127.0.0.1:8788",
            workspaceRoot: "D:\\codex_works",
          },
        ]),
        DISCORD_DEFAULT_WORKER_ID: "worker-office",
        DISCORD_AUTO_WORKSPACE_ALIASES_JSON: JSON.stringify({
          codex_discord_bot: "Codex_Discord_BOT",
        }),
      }, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain("Workspace: D:\\codex_works\\Codex_Discord_BOT");
  });

  it("blocks users outside the allowlist", async () => {
    const response = await handleBridgeCommand({ ...baseInput, userId: "100000000000000998" }, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toBe("You are not allowed to use this bridge.");
  });

  it("allows configured roles even when the user id is not listed", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      userId: "100000000000000998",
      memberRoleIds: ["100000000000000301"],
    }, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain("No active session");
  });

  it("creates a worker session and Codex thread with /new", async () => {
    const sessions = new SessionRegistry();
    const calls: string[] = [];
    const response = await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions,
      createWorkerClient: () => createMockWorker({
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
      }),
    });

    expect(calls).toEqual(["createSession", "newThread"]);
    expect(response.content).toContain("Worker session created.");
    expect(response.content).toContain("codex-thread-new");
    expect(sessions.list()).toHaveLength(1);
  });

  it("attaches and renders a handoff command", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });

    await handleBridgeCommand({
      ...baseInput,
      commandName: "attach",
      options: { thread_id: "codex-thread-1" },
    }, { config, sessions, createWorkerClient: () => createMockWorker() });

    const response = await handleBridgeCommand({ ...baseInput, commandName: "handoff" }, { config, sessions });

    expect(response.content).toContain("codex resume codex-thread-1");
  });

  it("refreshes live worker session info in /session", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });
    await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker(),
    });

    const response = await handleBridgeCommand({ ...baseInput, commandName: "session" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker({
        getSessionInfo: async () => ({
          threadId: "codex-thread-refreshed",
          workspace: REPO_WORKSPACE,
        }),
      }),
    });

    expect(response.content).toContain("Worker status: reachable");
    expect(response.content).toContain("codex-thread-refreshed");
  });

  it("calls worker abort for a recorded worker session", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });
    await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker(),
    });

    const calls: string[] = [];
    const response = await handleBridgeCommand({ ...baseInput, commandName: "abort" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker({
        abort: async (sessionId: string) => {
          calls.push(sessionId);
        },
      }),
    });

    expect(calls).toEqual(["worker-session-1"]);
    expect(response.content).toContain("Abort requested");
  });

  it("requires an active worker session before /ask", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Hol tartunk?" },
    }, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
      createWorkerClient: () => createMockWorker(),
    });

    expect(response.content).toContain("Use /new or /attach first");
  });

  it("sends /ask prompts to the active worker session", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });
    await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker(),
    });

    const calls: Array<{ sessionId: string; input: unknown }> = [];
    const response = await handleBridgeCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Folytasd a Discord bridge-et." },
    }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker({
        prompt: async (sessionId, input, callbacks) => {
          calls.push({ sessionId, input });
          callbacks?.onToolStart?.("shell_command", "tool-1");
          callbacks?.onTextDelta?.("Rendben, ");
          callbacks?.onTextDelta?.("folytatom.");
          callbacks?.onToolEnd?.("tool-1", false);
          callbacks?.onTurnComplete?.({ inputTokens: 10, cachedInputTokens: 2, outputTokens: 5 });
        },
      }),
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
    expect(response.followUpContents).toEqual([]);
  });

  it("does not expose raw worker command lines in /ask responses", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });
    await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker(),
    });

    const response = await handleBridgeCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Státusz?" },
    }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker({
        prompt: async (_sessionId, _input, callbacks) => {
          callbacks?.onToolStart?.("\"C:\\Program Files\\PowerShell\\7\\pwsh.exe\" -Command \"git status --short\"", "tool-1");
          callbacks?.onToolEnd?.("tool-1", false);
          callbacks?.onTextDelta?.("Kész.");
        },
      }),
    });

    expect(response.content).toContain("Codex tool calls: 1 event, 0 failed inside Codex");
    expect(response.content).not.toContain("PowerShell");
    expect(response.content).not.toContain("git status");
  });

  it("splits long /ask responses into follow-up message chunks", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env, { configDir: CONFIG_DIR });
    await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker(),
    });

    const longAnswer = `${"0123456789".repeat(210)}\n${"abcdef".repeat(260)}`;
    const response = await handleBridgeCommand({
      ...baseInput,
      commandName: "ask",
      options: { prompt: "Adj hosszú státuszt." },
    }, {
      config,
      sessions,
      createWorkerClient: () => createMockWorker({
        prompt: async (_sessionId, _input, callbacks) => {
          callbacks?.onTextDelta?.(longAnswer);
          callbacks?.onTurnComplete?.({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 });
        },
      }),
    });

    const allParts = [response.content, ...response.followUpContents];
    expect(allParts.length).toBeGreaterThan(1);
    expect(allParts.every((part) => part.length <= 1_900)).toBe(true);
    expect(allParts.join("")).toContain("0123456789".repeat(50));
    expect(allParts.join("")).toContain("Tokens: in 1, cached 0, out 2");
    expect(allParts.join("")).not.toContain("[truncated]");
  });

  it("renders /doctor with worker health from the injectable client", async () => {
    const response = await handleBridgeCommand({ ...baseInput, commandName: "doctor" }, {
      config: loadConfig(env, { configDir: CONFIG_DIR }),
      sessions: new SessionRegistry(),
      createWorkerClient: () => createMockWorker(),
    });

    expect(response.content).toContain("Worker health: remote-worker");
    expect(response.content).toContain("Known sessions: 0");
  });
});
