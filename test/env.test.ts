import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadDefaultEnvFiles, loadEnvFile } from "../src/env.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadEnvFile", () => {
  it("loads missing environment keys without overriding existing values", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "codex-discord-env-"));
    tempDirs.push(dir);
    const envPath = path.join(dir, ".env");
    await writeFile(envPath, [
      "DISCORD_TOKEN=from-file",
      "EXISTING=from-file",
      "QUOTED=\"hello world\"",
    ].join("\n"));

    const env: NodeJS.ProcessEnv = { EXISTING: "already-set" };

    loadEnvFile(envPath, env);

    expect(env.DISCORD_TOKEN).toBe("from-file");
    expect(env.EXISTING).toBe("already-set");
    expect(env.QUOTED).toBe("hello world");
  });

  it("prefers CODEX_DISCORD_ENV_FILE when provided", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "codex-discord-env-"));
    tempDirs.push(dir);
    const envPath = path.join(dir, ".env.nas");
    await writeFile(envPath, "DISCORD_TOKEN=from-nas-file\n");

    const env: NodeJS.ProcessEnv = { CODEX_DISCORD_ENV_FILE: envPath };

    loadDefaultEnvFiles(env);

    expect(env.DISCORD_TOKEN).toBe("from-nas-file");
  });
});
