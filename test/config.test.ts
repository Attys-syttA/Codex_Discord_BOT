import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const baseEnv = {
  DISCORD_TOKEN: "TEST_ONLY_DISCORD_BOT_TOKEN",
  DISCORD_APPLICATION_ID: "100000000000000010",
  DISCORD_GUILD_ID: "100000000000000001",
  DISCORD_ALLOWED_USER_IDS: "100000000000000999",
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
      sharedSecret: "TEST_ONLY_WORKER_SHARED_SECRET",
    },
  ]),
  DISCORD_DEFAULT_WORKER_ID: "otthon",
  DISCORD_WORKER_TIMEOUT_MS: "120000",
};

describe("loadConfig", () => {
  it("accepts the current non-secret Discord pilot identifiers", () => {
    const config = loadConfig(baseEnv);

    expect(config.applicationId).toBe("100000000000000010");
    expect(config.guildId).toBe("100000000000000001");
    expect(config.allowedUserIds).toEqual(["100000000000000999"]);
    expect(config.allowedRoleIds).toEqual([]);
    expect(config.channelMappings[0]).toMatchObject({
      channelId: "100000000000000101",
      workerId: "otthon",
    });
    expect(config.workers[0]).toMatchObject({
      id: "otthon",
      label: "Otthon worker",
      baseUrl: "http://127.0.0.1:8787",
    });
  });

  it("accepts optional role allowlists", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_ALLOWED_ROLE_IDS: "1515659000000000000,1515659000000000001",
    });

    expect(config.allowedRoleIdSet.has("1515659000000000000")).toBe(true);
    expect(config.allowedRoleIdSet.has("1515659000000000001")).toBe(true);
  });

  it("rejects an empty allowed user list", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_ALLOWED_USER_IDS: " " })).toThrow(
      "Missing required environment variable: DISCORD_ALLOWED_USER_IDS",
    );
  });

  it("rejects invalid Discord snowflakes", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_GUILD_ID: "not-a-snowflake" })).toThrow(
      "Invalid Discord snowflake",
    );
  });

  it("rejects invalid channel mapping JSON", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_CHANNEL_MAPPINGS_JSON: "{" })).toThrow(
      "Invalid DISCORD_CHANNEL_MAPPINGS_JSON",
    );
  });

  it("rejects an unknown default worker", () => {
    expect(() => loadConfig({ ...baseEnv, DISCORD_DEFAULT_WORKER_ID: "munkahely" })).toThrow(
      "Unknown DISCORD_DEFAULT_WORKER_ID: munkahely",
    );
  });

  it("accepts multiple workers and channel mappings", () => {
    const config = loadConfig({
      ...baseEnv,
      DISCORD_CHANNEL_MAPPINGS_JSON: JSON.stringify([
        { channelId: "100000000000000101", workspace: "E:\\codex_works\\Codex_Discord_BOT", workerId: "otthon" },
        { channelId: "1515657000000000000", workspace: "E:\\codex_works\\email-header-analyzer", workerId: "munkahely" },
      ]),
      DISCORD_WORKERS_JSON: JSON.stringify([
        { id: "otthon", label: "Otthon worker", baseUrl: "http://127.0.0.1:8787" },
        { id: "munkahely", label: "Munkahely worker", baseUrl: "http://127.0.0.1:8788" },
      ]),
      DISCORD_DEFAULT_WORKER_ID: "munkahely",
    });

    expect(config.workers).toHaveLength(2);
    expect(config.channelMappings).toHaveLength(2);
    expect(config.defaultWorkerId).toBe("munkahely");
  });
});
