import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { handleBridgeCommand, type BridgeCommandInput, type BridgeWorkerClient } from "../src/command-handlers.js";
import { SessionRegistry } from "../src/session-registry.js";

const env = {
  DISCORD_TOKEN: "TEST_ONLY_DISCORD_BOT_TOKEN",
  DISCORD_APPLICATION_ID: "100000000000000010",
  DISCORD_GUILD_ID: "100000000000000001",
  DISCORD_ALLOWED_USER_IDS: "100000000000000999",
  DISCORD_ALLOWED_ROLE_IDS: "1515659000000000000",
  DISCORD_CHANNEL_MAPPINGS_JSON: JSON.stringify([
    {
      channelId: "100000000000000101",
      workspace: "E:\\codex_works\\Codex_Discord_BOT",
      workerId: "otthon",
    },
  ]),
  DISCORD_WORKERS_JSON: JSON.stringify([
    {
      id: "otthon",
      label: "Otthon worker",
      baseUrl: "http://127.0.0.1:8787",
    },
  ]),
  DISCORD_DEFAULT_WORKER_ID: "otthon",
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
        info: { threadId: null, workspace: "E:\\codex_works\\Codex_Discord_BOT" },
      }),
      getSessionInfo: async () => ({
        threadId: "codex-thread-live",
        workspace: "E:\\codex_works\\Codex_Discord_BOT",
      }),
      newThread: async () => ({
        threadId: "codex-thread-new",
        workspace: "E:\\codex_works\\Codex_Discord_BOT",
      }),
      resumeThread: async (_sessionId: string, threadId: string) => ({
        threadId,
        workspace: "E:\\codex_works\\Codex_Discord_BOT",
      }),
      abort: async () => undefined,
      ...overrides,
    };
  }

  it("renders /session for an empty mapped thread context", async () => {
    const response = await handleBridgeCommand(baseInput, {
      config: loadConfig(env),
      sessions: new SessionRegistry(),
    });

    expect(response.ephemeral).toBe(true);
    expect(response.content).toContain("No active session");
    expect(response.content).toContain("E:\\codex_works\\Codex_Discord_BOT");
  });

  it("blocks users outside the allowlist", async () => {
    const response = await handleBridgeCommand({ ...baseInput, userId: "1515658000000000000" }, {
      config: loadConfig(env),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toBe("You are not allowed to use this bridge.");
  });

  it("allows configured roles even when the user id is not listed", async () => {
    const response = await handleBridgeCommand({
      ...baseInput,
      userId: "1515658000000000000",
      memberRoleIds: ["1515659000000000000"],
    }, {
      config: loadConfig(env),
      sessions: new SessionRegistry(),
    });

    expect(response.content).toContain("No active session");
  });

  it("creates a worker session and Codex thread with /new", async () => {
    const sessions = new SessionRegistry();
    const calls: string[] = [];
    const response = await handleBridgeCommand({ ...baseInput, commandName: "new" }, {
      config: loadConfig(env),
      sessions,
      createWorkerClient: () => createMockWorker({
        createSession: async () => {
          calls.push("createSession");
          return {
            sessionId: "worker-session-1",
            info: { threadId: null, workspace: "E:\\codex_works\\Codex_Discord_BOT" },
          };
        },
        newThread: async () => {
          calls.push("newThread");
          return {
            threadId: "codex-thread-new",
            workspace: "E:\\codex_works\\Codex_Discord_BOT",
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
    const config = loadConfig(env);

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
    const config = loadConfig(env);
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
          workspace: "E:\\codex_works\\Codex_Discord_BOT",
        }),
      }),
    });

    expect(response.content).toContain("Worker status: reachable");
    expect(response.content).toContain("codex-thread-refreshed");
  });

  it("calls worker abort for a recorded worker session", async () => {
    const sessions = new SessionRegistry();
    const config = loadConfig(env);
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

  it("renders /doctor with worker health from the injectable client", async () => {
    const response = await handleBridgeCommand({ ...baseInput, commandName: "doctor" }, {
      config: loadConfig(env),
      sessions: new SessionRegistry(),
      createWorkerClient: () => createMockWorker(),
    });

    expect(response.content).toContain("Worker health: remote-worker");
    expect(response.content).toContain("Known sessions: 0");
  });
});
