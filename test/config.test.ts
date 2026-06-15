import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const CONFIG_DIR = "C:\\codex_works\\Codex_Discord_BOT";
const WORKSPACE_ROOT = "C:\\codex_works";

const baseEnv = {
  DISCORD_TOKEN: "TEST_ONLY_DISCORD_BOT_TOKEN",
  DISCORD_APPLICATION_ID: "100000000000000010",
  DISCORD_GUILD_ID: "100000000000000001",
  DISCORD_ALLOWED_USER_IDS: "100000000000000999",
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
      sharedSecretEnv: "DISCORD_WORKER_SHARED_SECRET_HOME",
      workspaceRoot: "..",
    },
  ]),
  DISCORD_WORKER_SHARED_SECRET_HOME: "TEST_ONLY_WORKER_SHARED_SECRET",
  DISCORD_DEFAULT_WORKER_ID: "worker-home",
  DISCORD_WORKER_TIMEOUT_MS: "120000",
};

describe("loadConfig", () => {
  it("accepts synthetic Discord pilot identifiers", () => {
    const config = loadConfig(baseEnv, { configDir: CONFIG_DIR });

    expect(config.applicationId).toBe("100000000000000010");
    expect(config.guildId).toBe("100000000000000001");
    expect(config.allowedUserIds).toEqual(["100000000000000999"]);
    expect(config.allowedRoleIds).toEqual([]);
    expect(config.channelMappings[0]).toMatchObject({
      channelId: "100000000000000101",
      workspace: CONFIG_DIR,
      workerId: "worker-home",
    });
    expect(config.autoWorkspaceRoot).toBeUndefined();
    expect(config.autoWorkspaceAliases.size).toBe(0);
    expect(config.ephemeralResponses).toBe(true);
    expect(config.workers[0]).toMatchObject({
      id: "worker-home",
      label: "Home worker",
      baseUrl: "http://127.0.0.1:8787",
    });
    expect(config.sessionStorePath).toBe(".discord-bot-state/sessions.json");
  });

  it("accepts a custom session store path", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_SESSION_STORE_PATH: "runtime/sessions.json",
    }, { configDir: CONFIG_DIR });

    expect(config.sessionStorePath).toBe("runtime/sessions.json");
  });

  it("accepts an optional auto workspace root", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_AUTO_WORKSPACE_ROOT: "..",
    }, { configDir: CONFIG_DIR });

    expect(config.autoWorkspaceRoot).toBe(WORKSPACE_ROOT);
  });

  it("resolves relative workspace mappings against the worker workspace root", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_CHANNEL_MAPPINGS_JSON: JSON.stringify([
        { channelId: "100000000000000101", workspace: "email_header_analyzer", workerId: "worker-home" },
      ]),
    }, { configDir: CONFIG_DIR });

    expect(config.channelMappings[0]?.workspace).toBe("C:\\codex_works\\email_header_analyzer");
  });

  it("stores per-worker workspace roots", () => {
    const config = loadConfig(baseEnv, { configDir: CONFIG_DIR });

    expect(config.workers[0]?.workspaceRoot).toBe(WORKSPACE_ROOT);
  });

  it("loads worker shared secrets from a referenced env variable", () => {
    const config = loadConfig(baseEnv, { configDir: CONFIG_DIR });

    expect(config.workers[0]?.sharedSecret).toBe("TEST_ONLY_WORKER_SHARED_SECRET");
  });

  it("rejects missing referenced worker shared secret env variables", () => {
    expect(() => loadConfig({
      ...baseEnv,
      DISCORD_WORKER_SHARED_SECRET_HOME: undefined,
    }, { configDir: CONFIG_DIR })).toThrow(
      "Missing required environment variable: DISCORD_WORKER_SHARED_SECRET_HOME",
    );
  });

  it("accepts auto workspace aliases", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_AUTO_WORKSPACE_ALIASES_JSON: JSON.stringify({
        codex_discord_bot: "Codex_Discord_BOT",
      }),
    }, { configDir: CONFIG_DIR });

    expect(config.autoWorkspaceAliases.get("codex_discord_bot")).toBe("Codex_Discord_BOT");
  });

  it("rejects invalid auto workspace alias JSON", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_AUTO_WORKSPACE_ALIASES_JSON: "[]" }, { configDir: CONFIG_DIR })).toThrow(
      "Invalid DISCORD_AUTO_WORKSPACE_ALIASES_JSON",
    );
  });

  it("accepts persistent non-ephemeral Discord responses", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_EPHEMERAL_RESPONSES: "false",
    }, { configDir: CONFIG_DIR });

    expect(config.ephemeralResponses).toBe(false);
  });

  it("rejects invalid Discord response visibility values", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_EPHEMERAL_RESPONSES: "sometimes" }, { configDir: CONFIG_DIR })).toThrow(
      "Invalid DISCORD_EPHEMERAL_RESPONSES",
    );
  });

  it("accepts optional role allowlists", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_ALLOWED_ROLE_IDS: "100000000000000301,100000000000000302",
    }, { configDir: CONFIG_DIR });

    expect(config.allowedRoleIdSet.has("100000000000000301")).toBe(true);
    expect(config.allowedRoleIdSet.has("100000000000000302")).toBe(true);
  });

  it("rejects an empty allowed user list", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_ALLOWED_USER_IDS: " " }, { configDir: CONFIG_DIR })).toThrow(
      "Missing required environment variable: DISCORD_ALLOWED_USER_IDS",
    );
  });

  it("rejects invalid Discord snowflakes", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_GUILD_ID: "not-a-snowflake" }, { configDir: CONFIG_DIR })).toThrow(
      "Invalid Discord snowflake",
    );
  });

  it("rejects invalid channel mapping JSON", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_CHANNEL_MAPPINGS_JSON: "{" }, { configDir: CONFIG_DIR })).toThrow(
      "Invalid DISCORD_CHANNEL_MAPPINGS_JSON",
    );
  });

  it("rejects an unknown default worker", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_DEFAULT_WORKER_ID: "worker-office" }, { configDir: CONFIG_DIR })).toThrow(
      "Unknown DISCORD_DEFAULT_WORKER_ID: worker-office",
    );
  });

  it("accepts multiple workers and channel mappings", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_CHANNEL_MAPPINGS_JSON: JSON.stringify([
        { channelId: "100000000000000101", workspace: "Codex_Discord_BOT", workerId: "worker-home" },
        { channelId: "100000000000000102", workspace: "email-header-analyzer", workerId: "worker-office" },
      ]),
      DISCORD_WORKERS_JSON: JSON.stringify([
        { id: "worker-home", label: "Home worker", baseUrl: "http://127.0.0.1:8787", workspaceRoot: "E:\\codex_works" },
        { id: "worker-office", label: "Office worker", baseUrl: "http://127.0.0.1:8788", workspaceRoot: "D:\\codex_works" },
      ]),
      DISCORD_DEFAULT_WORKER_ID: "worker-office",
    }, { configDir: CONFIG_DIR });

    expect(config.workers).toHaveLength(2);
    expect(config.channelMappings).toHaveLength(2);
    expect(config.defaultWorkerId).toBe("worker-office");
    expect(config.channelMappings[1]?.workspace).toBe("D:\\codex_works\\email-header-analyzer");
  });
});
