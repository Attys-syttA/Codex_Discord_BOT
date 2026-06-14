import { describe, expect, it } from "vitest";

import { SessionRegistry } from "../src/session-registry.js";

describe("SessionRegistry", () => {
  it("stores and updates session metadata by Discord context key", () => {
    const registry = new SessionRegistry();
    const metadata = registry.upsert({
      contextKey: "100000000000000001:100000000000000101:100000000000000201",
      projectChannelId: "100000000000000101",
      threadId: "100000000000000201",
      workspace: "E:\\codex_works\\Codex_Discord_BOT",
      workerId: "otthon",
    });

    expect(metadata.updatedAt).toEqual(expect.any(String));
    expect(registry.get(metadata.contextKey)).toMatchObject({
      workspace: "E:\\codex_works\\Codex_Discord_BOT",
      workerId: "otthon",
    });

    registry.attachThread(metadata.contextKey, "codex-thread-1");

    expect(registry.get(metadata.contextKey)?.codexThreadId).toBe("codex-thread-1");
  });
});
