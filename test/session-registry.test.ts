import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileSessionRegistry, SessionRegistry } from "../src/session-registry.js";

describe("SessionRegistry", () => {
  it("stores and updates session metadata by Discord context key", () => {
    const registry = new SessionRegistry();
    const metadata = registry.upsert({
      contextKey: "100000000000000001:100000000000000101:100000000000000201",
      projectChannelId: "100000000000000101",
      threadId: "100000000000000201",
      workspace: "C:\\codex_works\\Codex_Discord_BOT",
      workerId: "worker-alpha",
    });

    expect(metadata.updatedAt).toEqual(expect.any(String));
    expect(registry.get(metadata.contextKey)).toMatchObject({
      workspace: "C:\\codex_works\\Codex_Discord_BOT",
      workerId: "worker-alpha",
    });

    registry.attachThread(metadata.contextKey, "codex-thread-1");

    expect(registry.get(metadata.contextKey)?.codexThreadId).toBe("codex-thread-1");
  });

  it("persists session metadata to a local JSON store", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "codex-discord-bot-"));
    const storePath = join(tempDir, "sessions.json");

    try {
      const registry = new FileSessionRegistry(storePath);
      const metadata = registry.upsert({
        contextKey: "100000000000000001:100000000000000101:100000000000000201",
        projectChannelId: "100000000000000101",
        threadId: "100000000000000201",
        workspace: "C:\\codex_works\\Codex_Discord_BOT",
        workerId: "worker-alpha",
        workerSessionId: "worker-session-1",
        codexThreadId: "codex-thread-1",
      });

      const restored = new FileSessionRegistry(storePath);

      expect(restored.get(metadata.contextKey)).toMatchObject({
        workerSessionId: "worker-session-1",
        codexThreadId: "codex-thread-1",
      });

      restored.remove(metadata.contextKey);

      const payload = JSON.parse(readFileSync(storePath, "utf8")) as { sessions: unknown[] };
      expect(payload.sessions).toEqual([]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
